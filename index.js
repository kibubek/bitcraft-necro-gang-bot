// index.js
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    SlashCommandBuilder,
    Events
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DEV = process.env.DEV === 'TRUE';
const TOKEN = process.env.DISCORD_TOKEN;
const ASSIGNMENT_CHANNEL_ID = process.env.ASSIGNMENT_CHANNEL_ID;
const ARMOR_CHANNEL_ID = process.env.ARMOR_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const DB_PATH = path.join(__dirname, 'assignments.db');

const log = (...args) => console.log(new Date().toISOString(), ...args);
const warn = (...args) => console.warn(new Date().toISOString(), ...args);
const error = (...args) => console.error(new Date().toISOString(), ...args);

// ————————————————————————————————————————————————————————————— Database Setup —————————————————————————————————————————————————————————————
const db = new sqlite3.Database(DB_PATH, err => {
    if (err) return error('[DB]', err);
    log(`✅ Connected to SQLite database. DEV=${DEV}`);
});
db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      user_id    TEXT NOT NULL,
      profession TEXT NOT NULL,
      PRIMARY KEY (user_id, profession)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS tools (
      user_id TEXT NOT NULL,
      tool    TEXT NOT NULL,
      tier    INTEGER NOT NULL,
      rarity  TEXT NOT NULL,
      PRIMARY KEY (user_id, tool)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS armor (
      user_id  TEXT NOT NULL,
      material TEXT NOT NULL,
      piece    TEXT NOT NULL,
      tier     INTEGER NOT NULL,
      rarity   TEXT NOT NULL,
      PRIMARY KEY (user_id, material, piece)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// ————————————————————————————————————————————————————————————— Static Data —————————————————————————————————————————————————————————————
const professions = [
    "Carpentry", "Farming", "Fishing", "Foraging", "Forestry",
    "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar",
    "Smithing", "Tailoring", "Cooking"
];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];
const toolsList = [
    "Saw", "Hoe", "Fishing Rod", "Machete", "Axe",
    "Hunting Bow", "Knife", "Chisel", "Pickaxe", "Quill", "Hammer", "Shears"
];
const materials = ["Leather", "Cloth", "Plate"];
const pieces = ["Head", "Chestplate", "Leggings", "Boots", "Gloves", "Belt"];
const tiers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
const rarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];
const professionToolMap = {
    Carpentry: "Saw", Farming: "Hoe", Fishing: "Fishing Rod",
    Foraging: "Machete", Forestry: "Axe", Hunting: "Hunting Bow",
    Leatherworking: "Knife", Masonry: "Chisel", Mining: "Pickaxe",
    Scholar: "Quill", Smithing: "Hammer", Tailoring: "Shears", Cooking: null
};

// ————————————————————————————————————————————————————————————— DB Helpers —————————————————————————————————————————————————————————————
function fetchAllAssignments() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, profession FROM assignments`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            rows.forEach(r => {
                m[r.user_id] = m[r.user_id] || [];
                m[r.user_id].push(r.profession);
            });
            res(m);
        });
    });
}

function fetchAllTools() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, tool, tier, rarity FROM tools`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            rows.forEach(r => {
                m[r.user_id] = m[r.user_id] || {};
                m[r.user_id][r.tool] = { tier: r.tier, rarity: r.rarity };
            });
            res(m);
        });
    });
}

function fetchAllArmor() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, material, piece, tier, rarity FROM armor`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            rows.forEach(r => {
                m[r.user_id] = m[r.user_id] || {};
                m[r.user_id][`${r.material}:${r.piece}`] = {
                    material: r.material,
                    piece: r.piece,
                    tier: r.tier,
                    rarity: r.rarity
                };
            });
            res(m);
        });
    });
}

function getMeta(key) {
    return new Promise((res, rej) => {
        db.get(`SELECT value FROM meta WHERE key = ?`, [key], (e, row) => {
            if (e) return rej(e);
            res(row?.value);
        });
    });
}

function setMeta(key, value) {
    return new Promise((res, rej) => {
        db.run(
            `INSERT INTO meta(key,value) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            [key, value],
            err => err ? rej(err) : res()
        );
    });
}

// ————————————————————————————————————————————————————————————— Assignment Board —————————————————————————————————————————————————————————————
async function updateAssignmentEmbed(guild) {
    if (DEV) {
        log('[DEV] skip assignment embed');
        return;
    }

    try {
        const [assignMap, toolMap] = await Promise.all([
            fetchAllAssignments(),
            fetchAllTools()
        ]);
        const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        let msg = null;
        const stored = await getMeta('board_message_id');
        if (stored) {
            try { msg = await channel.messages.fetch(stored); }
            catch { }
        }
        if (!msg) {
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            msg = await channel.send({ embeds: [init] });
            await setMeta('board_message_id', msg.id);
        }

        const sections = professions.map(prof => {
            const users = Object.entries(assignMap)
                .filter(([, ps]) => ps.includes(prof))
                .map(([uid]) => uid);
            if (!users.length) return `### ${prof}\n*No one assigned*`;

            const toolName = professionToolMap[prof];
            const lines = users.map(uid => {
                const m = guild.members.cache.get(uid);
                if (!m) return null;
                const role = m.roles.cache.find(r => r.name.startsWith(`${prof} `));
                const profText = role ? role.name : prof;
                let toolText = '';
                if (toolName && toolMap[uid]?.[toolName]) {
                    const { tier, rarity } = toolMap[uid][toolName];
                    toolText = ` – ${rarity} T${tier} ${toolName}`;
                }
                return `- <@${uid}> – ${profText}${toolText}`;
            }).filter(Boolean);

            return `### ${prof}\n${lines.join('\n')}`;
        });

        // paginate ~3000 chars per embed
        const embeds = [];
        let cur = new EmbedBuilder().setTitle('📋 Assigned Professions').setColor(0x00AEFF);
        let buf = '';
        const MAX = 3000;
        for (const sec of sections) {
            if (buf.length + sec.length > MAX) {
                cur.setDescription(buf.trim());
                embeds.push(cur);
                cur = new EmbedBuilder().setTitle('📋 Assigned Professions (cont’d)').setColor(0x00AEFF);
                buf = '';
            }
            buf += sec + '\n\n';
        }
        if (buf) {
            cur.setDescription(buf.trim());
            embeds.push(cur);
        }

        await msg.edit({ embeds });
        log(`[Embed] assignment updated (${embeds.length} pages)`);
    } catch (err) {
        error('[Embed] assignment error', err);
    }
}

// ————————————————————————————————————————————————————————————— Armor Board —————————————————————————————————————————————————————————————
async function updateArmorEmbed(guild) {
    if (DEV) {
        log('[DEV] skipping armor embed');
        return;
    }

    try {
        // 1) load saved armor
        const armorMap = await fetchAllArmor();

        // 2) only include users who have >0 armor entries
        const usersWithArmor = Object.keys(armorMap);
        if (usersWithArmor.length === 0) {
            // nothing to show
            const placeholder = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*No one has set any armor yet.*')
                .setColor(0x00AEFF);
            // fetch/create and send/edit a single-page placeholder:
            const channel = await client.channels.fetch(ARMOR_CHANNEL_ID);
            let msg = null;
            const stored = await getMeta('armor_message_id');
            if (stored) {
                try { msg = await channel.messages.fetch(stored); }
                catch { }
            }
            if (!msg) {
                msg = await channel.send({ embeds: [placeholder] });
                await setMeta('armor_message_id', msg.id);
            } else {
                await msg.edit({ embeds: [placeholder] });
            }
            return log('[Armor] no entries, placeholder sent');
        }

        // 3) paginate by 8 users per page (8×3 = 24 fields)
        const USERS_PER_PAGE = 8;
        const pages = [];

        for (let i = 0; i < usersWithArmor.length; i += USERS_PER_PAGE) {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*Cloth & Leather only*')
                .setColor(0x00AEFF)
                .setTimestamp();

            for (const uid of usersWithArmor.slice(i, i + USERS_PER_PAGE)) {
                const userArmor = armorMap[uid];

                const cloth = Object.values(userArmor)
                    .filter(a => a.material === 'Cloth')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                const leather = Object.values(userArmor)
                    .filter(a => a.material === 'Leather')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                embed.addFields(
                    { name: 'User', value: `<@${uid}>`, inline: true },
                    { name: '🧵 Cloth', value: cloth, inline: true },
                    { name: '🥾 Leather', value: leather, inline: true }
                );
            }

            pages.push(embed);
        }

        // 4) fetch/create & edit the message
        const channel = await client.channels.fetch(ARMOR_CHANNEL_ID);
        let msg = null;
        const stored = await getMeta('armor_message_id');
        if (stored) {
            try { msg = await channel.messages.fetch(stored); }
            catch { }
        }
        if (!msg) {
            msg = await channel.send({ embeds: [pages[0]] });
            await setMeta('armor_message_id', msg.id);
        } else {
            await msg.edit({ embeds: pages });
        }

        log(`[Armor] board updated across ${pages.length} page(s)`);
    } catch (err) {
        error('[Armor] update error', err);
    }
}



// ————————————————————————————————————————————————————————————— Utility —————————————————————————————————————————————————————————————
const validRaritiesForTier = tier => rarities.filter((_, i) => tier >= i + 1);

async function handleSelectRarity(interaction) {
    const [type, k1, k2, k3] = interaction.customId.split(':');
    const uid = interaction.user.id;

    if (type === 'tool') {
        const tier = parseInt(k2, 10);
        const tool = k1.replace(/_/g, ' ');
        const rarity = interaction.values[0];
        await new Promise((res, rej) => db.run(
            `INSERT INTO tools(user_id,tool,tier,rarity)
       VALUES(?,?,?,?) 
       ON CONFLICT(user_id,tool) DO UPDATE SET
         tier=excluded.tier,rarity=excluded.rarity`,
            [uid, tool, tier, rarity],
            e => e ? rej(e) : res()
        ));
        await updateAssignmentEmbed(interaction.guild);
    }

    if (type === 'armor') {
        const material = k1, piece = k2, tier = parseInt(k3, 10);
        const rarity = interaction.values[0];
        await new Promise((res, rej) => db.run(
            `INSERT INTO armor(user_id,material,piece,tier,rarity)
       VALUES(?,?,?,?,?) 
       ON CONFLICT(user_id,material,piece) DO UPDATE SET
         tier=excluded.tier,rarity=excluded.rarity`,
            [uid, material, piece, tier, rarity],
            e => e ? rej(e) : res()
        ));
        await updateAssignmentEmbed(interaction.guild);
        await updateArmorEmbed(interaction.guild);
    }

    return interaction.update({
        content: `✅ Set **${type === 'tool'
            ? k1.replace(/_/g, ' ')
            : `${k1} ${k2}`
            }**!`,
        embeds: [], components: []
    });
}

// ————————————————————————————————————————————————————————————— Client & Commands —————————————————————————————————————————————————————————————
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);

    const commands = [
        // setup
        new SlashCommandBuilder()
            .setName('setupassignments').setDescription('Initialize boards'),

        // professions
        new SlashCommandBuilder()
            .setName('assignmyselfto')
            .setDescription('Assign yourself to a profession')
            .addStringOption(o =>
                o.setName('profession')
                    .setDescription('Profession')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),

        new SlashCommandBuilder()
            .setName('unassignmyselffrom')
            .setDescription('Unassign yourself from a profession')
            .addStringOption(o =>
                o.setName('profession')
                    .setDescription('Profession')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),

        new SlashCommandBuilder()
            .setName('selectprofession')
            .setDescription('Choose a profession'),

        // timer
        new SlashCommandBuilder()
            .setName('settimer')
            .setDescription('Set a timer')
            .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
            .addStringOption(o => o.setName('note').setDescription('Optional note')),

        // tools
        new SlashCommandBuilder()
            .setName('settool')
            .setDescription('Assign a tool + tier')
            .addStringOption(o =>
                o.setName('tool')
                    .setDescription('Tool')
                    .setRequired(true)
                    .addChoices(...toolsList.map(t => ({ name: t, value: t })))
            )
            .addStringOption(o =>
                o.setName('tier')
                    .setDescription('Tier')
                    .setRequired(true)
                    .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
            ),

        new SlashCommandBuilder()
            .setName('removetool')
            .setDescription('Remove a tool')
            .addStringOption(o =>
                o.setName('tool')
                    .setDescription('Tool to remove')
                    .setRequired(true)
                    .addChoices(...toolsList.map(t => ({ name: t, value: t })))
            ),

        // armor
        new SlashCommandBuilder()
            .setName('setarmor')
            .setDescription('Assign an armor piece')
            .addStringOption(o =>
                o.setName('material')
                    .setDescription('Leather|Cloth|Plate')
                    .setRequired(true)
                    .addChoices(...materials.map(m => ({ name: m, value: m })))
            )
            .addStringOption(o =>
                o.setName('piece')
                    .setDescription('Head|Chestplate|Leggings|Boots|Gloves|Belt')
                    .setRequired(true)
                    .addChoices(...pieces.map(p => ({ name: p, value: p })))
            )
            .addStringOption(o =>
                o.setName('tier')
                    .setDescription('Tier')
                    .setRequired(true)
                    .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
            ),

        new SlashCommandBuilder()
            .setName('removearmor')
            .setDescription('Remove an armor piece')
            .addStringOption(o =>
                o.setName('material')
                    .setDescription('Leather|Cloth|Plate')
                    .setRequired(true)
                    .addChoices(...materials.map(m => ({ name: m, value: m })))
            )
            .addStringOption(o =>
                o.setName('piece')
                    .setDescription('Head|Chestplate|Leggings|Boots|Gloves|Belt')
                    .setRequired(true)
                    .addChoices(...pieces.map(p => ({ name: p, value: p })))
            ),

        // stats & info
        new SlashCommandBuilder()
            .setName('topprofession')
            .setDescription('Show top member of a profession')
            .addStringOption(o =>
                o.setName('profession')
                    .setDescription('Profession')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),

        new SlashCommandBuilder()
            .setName('info')
            .setDescription('Show full profile info for a user')
            .addUserOption(o =>
                o.setName('target')
                    .setDescription('User')
                    .setRequired(true)
            )
    ].map(cmd => cmd.toJSON());

    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commands);
        await guild.members.fetch();
        await updateAssignmentEmbed(guild);
        await updateArmorEmbed(guild);
    }
});

// ————————————————————————————————————————————————————————————— Interaction Handling —————————————————————————————————————————————————————————————
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, options, user, guild } = interaction;

        // setupassignments
        if (commandName === 'setupassignments') {
            log(`[Cmd] ${user.tag} → /setupassignments`);
            const ch = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            const msg = await ch.send({ embeds: [init] });
            await setMeta('board_message_id', msg.id);

            const ach = await guild.channels.fetch(ARMOR_CHANNEL_ID);
            const ainit = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            const amsg = await ach.send({ embeds: [ainit] });
            await setMeta('armor_message_id', amsg.id);

            return interaction.reply({ content: '✅ Boards initialized.', ephemeral: true });
        }

        // assignmyselfto
        if (commandName === 'assignmyselfto') {
            const prof = options.getString('profession');
            log(`[Cmd] ${user.tag} → /assignmyselfto ${prof}`);
            await new Promise((r, j) => db.run(
                `INSERT OR IGNORE INTO assignments(user_id,profession) VALUES(?,?)`,
                [user.id, prof], e => e ? j(e) : r()
            ));
            const role = guild.roles.cache.find(r => r.name === prof);
            if (role) await guild.members.fetch(user.id).then(m => m.roles.add(role));
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Assigned to **${prof}**.`, ephemeral: true });
        }

        // unassignmyselffrom
        if (commandName === 'unassignmyselffrom') {
            const prof = options.getString('profession');
            log(`[Cmd] ${user.tag} → /unassignmyselffrom ${prof}`);
            await new Promise((r, j) => db.run(
                `DELETE FROM assignments WHERE user_id=? AND profession=?`,
                [user.id, prof], e => e ? j(e) : r()
            ));
            const role = guild.roles.cache.find(r => r.name === prof);
            if (role) await guild.members.fetch(user.id).then(m => m.roles.remove(role));
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Unassigned from **${prof}**.`, ephemeral: true });
        }

        // settimer
        if (commandName === 'settimer') {
            const mins = options.getInteger('minutes');
            const note = options.getString('note')?.trim() || '⏰ Your timer is up!';
            log(`[Cmd] ${user.tag} → /settimer ${mins}min`);
            await interaction.reply({ content: `⏳ Timer set for ${mins} minutes.`, ephemeral: true });
            setTimeout(() => {
                interaction.channel.send({ content: `🔔 <@${user.id}> ${note}` });
                log(`[Timer] Pinged ${user.tag}`);
            }, mins * 60000);
            return;
        }

        // selectprofession
        if (commandName === 'selectprofession') {
            log(`[Cmd] ${user.tag} → /selectprofession`);
            const embed = new EmbedBuilder()
                .setTitle('Choose a profession')
                .setColor(0x00AEFF);
            const menu = new StringSelectMenuBuilder()
                .setCustomId('select_profession')
                .setPlaceholder('Profession...')
                .addOptions(professions.map(p => ({ label: p, value: p })));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // settool
        if (commandName === 'settool') {
            const tool = options.getString('tool');
            const tier = parseInt(options.getString('tier'), 10);
            log(`[Cmd] ${user.tag} → /settool ${tool} T${tier}`);
            const valid = validRaritiesForTier(tier);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`tool:${tool.replace(/\s+/g, '_')}:${tier}`)
                .setPlaceholder('Select rarity…')
                .addOptions(valid.map(r => ({ label: `${r} T${tier}`, value: r })));
            const embed = new EmbedBuilder()
                .setTitle(`Choose rarity for ${tool} T${tier}`)
                .setColor(0xFFD700);
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // removetool
        if (commandName === 'removetool') {
            const tool = options.getString('tool');
            log(`[Cmd] ${user.tag} → /removetool ${tool}`);
            await new Promise((r, j) => db.run(
                `DELETE FROM tools WHERE user_id=? AND tool=?`,
                [user.id, tool], e => e ? j(e) : r()
            ));
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Removed ${tool}.`, ephemeral: true });
        }

        // setarmor
        if (commandName === 'setarmor') {
            const mat = options.getString('material');
            const piece = options.getString('piece');
            const tier = parseInt(options.getString('tier'), 10);
            log(`[Cmd] ${user.tag} → /setarmor ${mat} ${piece} T${tier}`);
            const valid = validRaritiesForTier(tier);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`armor:${mat}:${piece}:${tier}`)
                .setPlaceholder('Select rarity…')
                .addOptions(valid.map(r => ({ label: `${r} T${tier}`, value: r })));
            const embed = new EmbedBuilder()
                .setTitle(`Choose rarity for ${mat} ${piece} T${tier}`)
                .setColor(0xFFD700);
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // removearmor
        if (commandName === 'removearmor') {
            const mat = options.getString('material');
            const piece = options.getString('piece');
            log(`[Cmd] ${user.tag} → /removearmor ${mat} ${piece}`);
            await new Promise((r, j) => db.run(
                `DELETE FROM armor WHERE user_id=? AND material=? AND piece=?`,
                [user.id, mat, piece], e => e ? j(e) : r()
            ));
            await updateAssignmentEmbed(guild);
            await updateArmorEmbed(guild);
            return interaction.reply({ content: `✅ Removed ${mat} ${piece}.`, ephemeral: true });
        }

        // topprofession
        if (commandName === 'topprofession') {
            const prof = options.getString('profession');
            log(`[Cmd] ${user.tag} → /topprofession ${prof}`);
            await guild.members.fetch();
            let top = null, lvl = -1;
            guild.members.cache.forEach(m => {
                const role = m.roles.cache
                    .filter(r => r.name.startsWith(`${prof} `))
                    .sort((a, b) => parseInt(b.name.split(' ')[1], 10) - parseInt(a.name.split(' ')[1], 10))
                    .first();
                if (role) {
                    const v = parseInt(role.name.split(' ')[1], 10);
                    if (v > lvl) { lvl = v; top = m; }
                }
            });
            if (!top) return interaction.reply({ content: `No one has ${prof}`, ephemeral: true });
            return interaction.reply({ content: `🏆 Top ${prof}: ${top} – Level ${lvl}` });
        }

        // info
        if (commandName === 'info') {
            const target = options.getUser('target');
            const uid = target.id;
            const avatar = target.displayAvatarURL({ dynamic: true });

            const assignMap = await fetchAllAssignments();
            const pros = assignMap[uid] || [];
            const mainProf = pros[0] || 'None';
            const otherProf = pros.slice(1);

            const tmap = (await fetchAllTools())[uid] || {};
            const toolsList = Object.entries(tmap).map(([tool, { tier, rarity }]) => `${rarity} T${tier} ${tool}`);

            const embed = new EmbedBuilder()
                .setTitle(`${target.username}'s Profile`)
                .setThumbnail(avatar)
                .addFields(
                    { name: 'Main Profession', value: mainProf, inline: true },
                    { name: 'Other Professions', value: otherProf.length ? otherProf.join(', ') : 'None', inline: true },
                    { name: 'Tools', value: toolsList.length ? toolsList.join('\n') : 'None', inline: false }
                )
                .setColor(0x00AEFF)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
    else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('tool:') || interaction.customId.startsWith('armor:')) {
            return handleSelectRarity(interaction);
        }
        if (interaction.customId === 'select_profession') {
            const prof = interaction.values[0];
            log(`[Select] ${interaction.user.tag} → profession ${prof}`);
            const embed = new EmbedBuilder().setTitle(`Profession: ${prof}`).setColor(0xFFD700);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`select_level_${prof}`)
                .setPlaceholder('Level…')
                .addOptions(levels.map(l => ({ label: `Level ${l}`, value: l })));
            return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
        }
        if (interaction.customId.startsWith('select_level_')) {
            const prof = interaction.customId.replace('select_level_', '');
            const lvl = interaction.values[0];
            log(`[Select] ${interaction.user.tag} → level ${lvl} for ${prof}`);
            const mem = await interaction.guild.members.fetch(interaction.user.id);
            const old = mem.roles.cache.find(r => r.name.startsWith(`${prof} `));
            if (old) { await mem.roles.remove(old); log(`[Role] Removed ${old.name}`); }
            let role = interaction.guild.roles.cache.find(r => r.name === `${prof} ${lvl}`);
            if (!role) {
                role = await interaction.guild.roles.create({
                    name: `${prof} ${lvl}`,
                    color: 0x3498db,
                    hoist: true,
                    mentionable: true,
                    reason: `Created for ${prof} ${lvl}`
                });
                log(`[Role] Created ${role.name}`);
            }
            await mem.roles.add(role);
            log(`[Role] Assigned ${role.name}`);
            await updateAssignmentEmbed(interaction.guild);
            return interaction.update({ content: `✅ Assigned **${prof} ${lvl}**!`, embeds: [], components: [] });
        }
    }
});

// ————————————————————————————————————————————————————————————— Welcome & Sync —————————————————————————————————————————————————————————————
client.on(Events.GuildMemberAdd, async member => {
    // welcome embed
    try {
        const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
        if (channel?.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Welcome to Lich-core Dominion!')
                .setDescription(`Hey ${member}, we’re glad you’re here!\n\nChoose your profession with \`/selectprofession\` and become part of the community.`)
                .setColor(0x00AEFF)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member #${member.guild.memberCount} • ${new Date().toLocaleDateString()}` });
            await channel.send({ embeds: [embed] });
            log(`[Welcome] Sent welcome for ${member.user.tag}`);
        }
    } catch (err) {
        error('[Welcome] error', err);
    }

    // sync armor board so new member appears immediately
    await updateArmorEmbed(member.guild);
});

client.login(TOKEN);
