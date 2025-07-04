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

// Read DEV flag from .env (default false)
const DEV = process.env.DEV === 'TRUE';

// Simple timestamped logger
const log = (...args) => console.log(new Date().toISOString(), ...args);
const warn = (...args) => console.warn(new Date().toISOString(), ...args);
const error = (...args) => console.error(new Date().toISOString(), ...args);

const TOKEN = process.env.DISCORD_TOKEN;
const ASSIGNMENT_CHANNEL_ID = process.env.ASSIGNMENT_CHANNEL_ID;
const DB_PATH = path.join(__dirname, 'assignments.db');

// Initialize SQLite database
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

// Static data
const professions = ["Carpentry", "Farming", "Fishing", "Foraging", "Forestry", "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Cooking"];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];
const tools = ["Saw", "Hoe", "Fishing Rod", "Machete", "Axe", "Hunting Bow", "Knife", "Chisel", "Pickaxe", "Quill", "Hammer", "Shears"];
const materials = ["Leather", "Cloth", "Plate"];
const pieces = ["Head", "Chestplate", "Leggings", "Boots", "Gloves", "Belt"];
const tiers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
const rarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];

// profession → matching tool
const professionToolMap = {
    Carpentry: "Saw", Farming: "Hoe", Fishing: "Fishing Rod",
    Foraging: "Machete", Forestry: "Axe", Hunting: "Hunting Bow",
    Leatherworking: "Knife", Masonry: "Chisel", Mining: "Pickaxe",
    Scholar: "Quill", Smithing: "Hammer", Tailoring: "Shears", Cooking: null
};

// SQLite helpers
function fetchAllAssignments() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id,profession FROM assignments`, [], (e, rows) => {
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
        db.all(`SELECT user_id,tool,tier,rarity FROM tools`, [], (e, rows) => {
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

function getMeta(key) {
    return new Promise((res, rej) => {
        db.get(`SELECT value FROM meta WHERE key=?`, [key], (e, row) => {
            if (e) return rej(e);
            res(row?.value);
        });
    });
}

function setMeta(key, value) {
    return new Promise((res, rej) => {
        db.run(`
            INSERT INTO meta(key,value) VALUES(?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `, [key, value], err => err ? rej(err) : res());
    });
}

// Rebuild the “Assigned Professions” board with pagination (no armor)
async function updateAssignmentEmbed(guild) {
    if (DEV) {
        log('[DEV] Skipping embed update');
        return;
    }
    try {
        const [assignMap, toolMap] = await Promise.all([
            fetchAllAssignments(),
            fetchAllTools()
        ]);

        const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        const storedId = await getMeta('board_message_id');
        let message = null;
        if (storedId) {
            try {
                const f = await channel.messages.fetch(storedId);
                if (f.edit) {
                    message = f;
                    log(`[Embed] Fetched ${storedId}`);
                }
            } catch {
                warn('[Embed] could not fetch; will recreate');
            }
        }
        if (!message) {
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            const newMsg = await channel.send({ embeds: [init] });
            await setMeta('board_message_id', newMsg.id);
            message = newMsg;
            log(`[Embed] Created ${newMsg.id}`);
        }

        // Build sections (omit armor)
        const sections = professions.map(prof => {
            const users = Object.entries(assignMap)
                .filter(([, ps]) => ps.includes(prof))
                .map(([uid]) => uid);
            if (!users.length) return `### ${prof}\n*No one assigned*`;

            const toolName = professionToolMap[prof];
            const lines = users.map(uid => {
                const member = guild.members.cache.get(uid);
                if (!member) return null;

                const profRole = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                const profText = profRole ? profRole.name : prof;

                let toolText = '';
                if (toolName && toolMap[uid]?.[toolName]) {
                    const { tier, rarity } = toolMap[uid][toolName];
                    toolText = ` – ${rarity} T${tier} ${toolName}`;
                }

                return `- <@${uid}> – ${profText}${toolText}`;
            }).filter(Boolean);

            return `### ${prof}\n${lines.join('\n')}`;
        });

        // Paginate into multiple embeds
        const embeds = [];
        let current = new EmbedBuilder()
            .setTitle('📋 Assigned Professions')
            .setColor(0x00AEFF);
        let buffer = '';
        const MAX_BUFFER = 3000;

        for (const sec of sections) {
            if (buffer.length + sec.length + 2 > MAX_BUFFER) {
                current.setDescription(buffer.trim());
                embeds.push(current);
                current = new EmbedBuilder()
                    .setTitle('📋 Assigned Professions (cont’d)')
                    .setColor(0x00AEFF);
                buffer = '';
            }
            buffer += sec + '\n\n';
        }
        if (buffer.length) {
            current.setDescription(buffer.trim());
            embeds.push(current);
        }

        await message.edit({ embeds });
        log('[Embed] Board updated with', embeds.length, 'pages');
    } catch (err) {
        error('[Embed] update error:', err);
    }
}

// Helper for valid rarities at a given tier
const validRaritiesForTier = tier => rarities.filter((_, i) => tier >= i + 1);

// Handle rarity-select for tools only
async function handleSelectRarity(interaction) {
    const [, k1, k2] = interaction.customId.split(':'); // always "tool" type now
    const uid = interaction.user.id;
    const tier = parseInt(k2, 10);
    const tool = k1.replace(/_/g, ' ');
    const rarity = interaction.values[0];

    log(`[SetTool] ${interaction.user.tag} → ${tool} T${tier} ${rarity}`);
    await new Promise((res, rej) => {
        db.run(`
            INSERT INTO tools(user_id,tool,tier,rarity)
            VALUES(?,?,?,?)
            ON CONFLICT(user_id,tool) DO UPDATE
              SET tier=excluded.tier,
                  rarity=excluded.rarity
        `, [uid, tool, tier, rarity], e => e ? rej(e) : res());
    });

    await updateAssignmentEmbed(interaction.guild);
    return interaction.update({
        content: `✅ Set **${tool} T${tier} ${rarity}**!`,
        embeds: [], components: []
    });
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('setupassignments').setDescription('Initialize board'),
        new SlashCommandBuilder()
            .setName('assignmyselfto')
            .setDescription('Assign yourself to a profession')
            .addStringOption(o => o
                .setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),
        new SlashCommandBuilder()
            .setName('unassignmyselffrom')
            .setDescription('Unassign yourself from a profession')
            .addStringOption(o => o
                .setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),
        new SlashCommandBuilder().setName('selectprofession').setDescription('Choose a profession'),
        new SlashCommandBuilder()
            .setName('settimer')
            .setDescription('Set a timer')
            .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
            .addStringOption(o => o.setName('note').setDescription('Optional note')),
        new SlashCommandBuilder()
            .setName('settool')
            .setDescription('Assign a tool + tier')
            .addStringOption(o => o
                .setName('tool')
                .setDescription('Tool')
                .setRequired(true)
                .addChoices(...tools.map(t => ({ name: t, value: t })))
            )
            .addStringOption(o => o
                .setName('tier')
                .setDescription('Tier')
                .setRequired(true)
                .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
            ),
        new SlashCommandBuilder()
            .setName('removetool')
            .setDescription('Remove a tool')
            .addStringOption(o => o
                .setName('tool')
                .setDescription('Tool to remove')
                .setRequired(true)
                .addChoices(...tools.map(t => ({ name: t, value: t })))
            ),
        new SlashCommandBuilder()
            .setName('topprofession')
            .setDescription('Show top member of a profession')
            .addStringOption(o => o
                .setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),
        new SlashCommandBuilder()
            .setName('info')
            .setDescription('Show full profile info for a user')
            .addUserOption(o => o
                .setName('target')
                .setDescription('User')
                .setRequired(true)
            )
    ].map(cmd => cmd.toJSON());

    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commands);
        await guild.members.fetch();
        await updateAssignmentEmbed(guild);
        log(`✅ Commands registered in ${guild.name}`);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;
    const { commandName, options, user, guild } = interaction;

    if (interaction.isChatInputCommand()) {
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
            return interaction.reply({ content: '✅ Board initialized.', ephemeral: true });
        }

        // assignmyselfto
        if (commandName === 'assignmyselfto') {
            const prof = options.getString('profession');
            log(`[Cmd] ${user.tag} → /assignmyselfto ${prof}`);
            await new Promise((r, j) => db.run(
                `INSERT OR IGNORE INTO assignments(user_id,profession) VALUES(?,?)`,
                [user.id, prof],
                e => e ? j(e) : r()
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
                [user.id, prof],
                e => e ? j(e) : r()
            ));
            const role = guild.roles.cache.find(r => r.name === prof);
            if (role) await guild.members.fetch(user.id).then(m => m.roles.remove(role));
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Unassigned from **${prof}**.`, ephemeral: true });
        }

        // settimer
        if (commandName === 'settimer') {
            const minutes = options.getInteger('minutes');
            const note = options.getString('note')?.trim() || '⏰ Your timer is up!';
            log(`[Cmd] ${user.tag} → /settimer ${minutes}min`);
            await interaction.reply({ content: `⏳ Timer set for ${minutes} minutes.`, ephemeral: true });
            setTimeout(() => {
                interaction.channel.send({ content: `🔔 <@${user.id}> ${note}` });
                log(`[Timer] Pinged ${user.tag}`);
            }, minutes * 60000);
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
            return interaction.reply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true
            });
        }

        // settool
        if (commandName === 'settool') {
            const tool = options.getString('tool');
            const tier = parseInt(options.getString('tier'), 10);
            log(`[Cmd] ${user.tag} → /settool ${tool} T${tier}`);
            const valid = validRaritiesForTier(tier);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`tool:${tool.replace(/\s+/g, '_')}:${tier}`)
                .setPlaceholder('Rarity…')
                .addOptions(valid.map(r => ({ label: `${r} T${tier}`, value: r })));
            const embed = new EmbedBuilder()
                .setTitle(`Choose rarity for ${tool} T${tier}`)
                .setColor(0xFFD700);
            return interaction.reply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true
            });
        }

        // removetool
        if (commandName === 'removetool') {
            const tool = options.getString('tool');
            log(`[Cmd] ${user.tag} → /removetool ${tool}`);
            await new Promise((r, j) => db.run(
                `DELETE FROM tools WHERE user_id=? AND tool=?`,
                [user.id, tool],
                e => e ? j(e) : r()
            ));
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Removed ${tool}.`, ephemeral: true });
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
                    .sort((a, b) =>
                        parseInt(b.name.split(' ')[1], 10) -
                        parseInt(a.name.split(' ')[1], 10)
                    )
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
            const userProfs = assignMap[uid] || [];
            const mainProf = userProfs[0] || 'None';
            const otherProfs = userProfs.slice(1);

            const toolMap = await fetchAllTools();
            const tmap = toolMap[uid] || {};
            const toolList = Object.entries(tmap)
                .map(([tool, { tier, rarity }]) => `${rarity} T${tier} ${tool}`);

            const embed = new EmbedBuilder()
                .setTitle(`${target.username}'s Profile`)
                .setThumbnail(avatar)
                .addFields(
                    { name: 'Main Profession', value: mainProf, inline: true },
                    { name: 'Other Professions', value: otherProfs.length ? otherProfs.join(', ') : 'None', inline: true },
                    { name: 'Tools', value: toolList.length ? toolList.join('\n') : 'None' }
                )
                .setColor(0x00AEFF)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }

    // StringSelectMenu handlers
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('tool:')) {
            return handleSelectRarity(interaction);
        }
        if (interaction.customId === 'select_profession') {
            const prof = interaction.values[0];
            log(`[Select] ${interaction.user.tag} → profession ${prof}`);
            const embed = new EmbedBuilder()
                .setTitle(`Profession: ${prof}`)
                .setColor(0xFFD700);
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`select_level_${prof}`)
                .setPlaceholder('Level...')
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
                    reason: `Role for ${prof} level ${lvl}`
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

client.login(TOKEN);
