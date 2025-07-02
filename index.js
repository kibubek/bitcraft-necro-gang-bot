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

// Simple timestamped logger
const log = (...args) => console.log(new Date().toISOString(), ...args);
const warn = (...args) => console.warn(new Date().toISOString(), ...args);
const error = (...args) => console.error(new Date().toISOString(), ...args);

const TOKEN = process.env.DISCORD_TOKEN;
const ASSIGNMENT_CHANNEL_ID = '1386402550399500409';
const DB_PATH = path.join(__dirname, 'assignments.db');

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, err => {
    if (err) return error('[DB]', err.message);
    log('✅ Connected to SQLite database.');
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
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// Static data
const professions = [
    "Carpentry", "Farming", "Fishing", "Foraging", "Forestry",
    "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar",
    "Smithing", "Tailoring", "Cooking"
];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];

const tools = [
    "Saw", "Hoe", "Fishing Rod", "Machete", "Axe",
    "Hunting Bow", "Knife", "Chisel", "Pickaxe",
    "Quill", "Hammer", "Shears"
];
const tiers = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
const rarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];

// profession → matching tool
const professionToolMap = {
    Carpentry: "Saw",
    Farming: "Hoe",
    Fishing: "Fishing Rod",
    Foraging: "Machete",
    Forestry: "Axe",
    Hunting: "Hunting Bow",
    Leatherworking: "Knife",
    Masonry: "Chisel",
    Mining: "Pickaxe",
    Scholar: "Quill",
    Smithing: "Hammer",
    Tailoring: "Shears",
    Cooking: null
};

// SQLite helpers
function fetchAllAssignments() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, profession FROM assignments`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            for (const { user_id, profession } of rows) {
                m[user_id] = m[user_id] || [];
                m[user_id].push(profession);
            }
            res(m);
        });
    });
}

function fetchAllTools() {
    return new Promise((res, rej) => {
        db.all(`SELECT user_id, tool, tier, rarity FROM tools`, [], (e, rows) => {
            if (e) return rej(e);
            const m = {};
            for (const { user_id, tool, tier, rarity } of rows) {
                m[user_id] = m[user_id] || {};
                m[user_id][tool] = { tier, rarity };
            }
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

// Rebuild the “Assigned Professions” board
async function updateAssignmentEmbed(guild) {
    try {
        const [assignedMap, toolsMap] = await Promise.all([
            fetchAllAssignments(),
            fetchAllTools()
        ]);

        const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        const storedId = await getMeta('board_message_id');
        let message;

        if (storedId) {
            try {
                const fetched = await channel.messages.fetch(storedId);
                if (fetched.edit) {
                    message = fetched;
                    log(`[Embed] Fetched existing board message ${storedId}`);
                } else {
                    throw new Error('Invalid stored message');
                }
            } catch (e) {
                warn('[Embed] Could not fetch board message; recreating.', e.message);
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
            log(`[Embed] Created new board message ${newMsg.id}`);
        }

        const sections = professions.map(prof => {
            const users = Object.entries(assignedMap)
                .filter(([, profs]) => profs.includes(prof))
                .map(([uid]) => uid);

            if (!users.length) {
                return `### ${prof}\n*No one assigned*`;
            }

            const toolName = professionToolMap[prof];
            const lines = users.map(uid => {
                const member = guild.members.cache.get(uid);
                if (!member) return null;
                const profRole = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                const profText = profRole ? profRole.name : prof;
                let toolText = '';
                if (toolName && toolsMap[uid]?.[toolName]) {
                    const { tier, rarity } = toolsMap[uid][toolName];
                    toolText = ` – ${rarity} T${tier} ${toolName}`;
                }
                return `- <@${uid}> – ${profText}${toolText}`;
            }).filter(Boolean);

            return `### ${prof}\n${lines.join('\n')}`;
        });

        const embed = new EmbedBuilder()
            .setTitle('📋 Assigned Professions')
            .setDescription(sections.join('\n\n'))
            .setColor(0x00AEFF)
            .setTimestamp();

        await message.edit({ embeds: [embed] });
        log('[Embed] Updated board embed');
    } catch (err) {
        warn('[Embed] Error updating assignment embed:', err.message);
    }
}

// Handle the rarity-select menu for /settool
async function handleSelectRarity(interaction) {
    const [, toolKey, tierStr] = interaction.customId.split(':');
    const tool = toolKey.replace(/_/g, ' ');
    const tier = parseInt(tierStr, 10);
    const rarity = interaction.values[0];
    const uid = interaction.user.id;

    log(`[SetTool] User ${interaction.user.tag} chose ${tool} T${tier} ${rarity}`);

    // Upsert into tools table
    await new Promise((res, rej) => {
        db.run(
            `INSERT INTO tools(user_id,tool,tier,rarity)
         VALUES(?,?,?,?)
       ON CONFLICT(user_id,tool) DO UPDATE
         SET tier=excluded.tier,
             rarity=excluded.rarity`,
            [uid, tool, tier, rarity],
            e => e ? rej(e) : res()
        );
    });
    log(`[DB] Upserted tool ${tool} for user ${uid}`);

    // Assign the role "Tool T# Rarity"
    const roleName = `${tool} T${tier} ${rarity}`;
    let role = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
        role = await interaction.guild.roles.create({
            name: roleName,
            color: 0x779ECB,
            hoist: false,
            mentionable: true,
            reason: `Tool slot for ${tool}`
        });
        log(`[Role] Created role ${roleName}`);
    }
    const member = await interaction.guild.members.fetch(uid);
    member.roles.cache
        .filter(r => r.name.startsWith(`${tool} T`))
        .forEach(r => {
            member.roles.remove(r);
            log(`[Role] Removed old role ${r.name} from user ${uid}`);
        });
    await member.roles.add(role);
    log(`[Role] Assigned role ${roleName} to user ${uid}`);

    // Refresh the assignments board
    await updateAssignmentEmbed(interaction.guild);

    // Confirmation
    return interaction.update({
        content: `✅ Set **${tool} T${tier} ${rarity}** for <@${uid}>!`,
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
        new SlashCommandBuilder()
            .setName('setupassignments')
            .setDescription('Initialize the assignment board'),

        new SlashCommandBuilder()
            .setName('assignmyselfto')
            .setDescription('Assign yourself to a profession')
            .addStringOption(opt =>
                opt.setName('profession')
                    .setDescription('Profession')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),

        new SlashCommandBuilder()
            .setName('unassignmyselffrom')
            .setDescription('Unassign yourself from a profession')
            .addStringOption(opt =>
                opt.setName('profession')
                    .setDescription('Profession')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))
            ),

        new SlashCommandBuilder()
            .setName('settimer')
            .setDescription('Set a timer that pings you after given minutes')
            .addIntegerOption(opt =>
                opt.setName('minutes')
                    .setDescription('How many minutes')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('note').setDescription('Optional note')
            ),

        new SlashCommandBuilder()
            .setName('selectprofession')
            .setDescription('Choose a profession'),

        new SlashCommandBuilder()
            .setName('settool')
            .setDescription('Assign yourself a tool + tier')
            .addStringOption(opt =>
                opt.setName('tool')
                    .setDescription('Which tool?')
                    .setRequired(true)
                    .addChoices(...tools.map(t => ({ name: t, value: t })))
            )
            .addStringOption(opt =>
                opt.setName('tier')
                    .setDescription('Tier level (1–10)')
                    .setRequired(true)
                    .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
            ),

        new SlashCommandBuilder()
            .setName('getmytools')
            .setDescription('List your current tools + tiers + rarities'),

        new SlashCommandBuilder()
            .setName('gettools')
            .setDescription('List another user’s tools + tiers + rarities')
            .addUserOption(opt =>
                opt.setName('target')
                    .setDescription('Which user?')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('removetool')
            .setDescription('Remove one of your tools')
            .addStringOption(opt =>
                opt.setName('tool')
                    .setDescription('Which tool to remove?')
                    .setRequired(true)
                    .addChoices(...tools.map(t => ({ name: t, value: t })))
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
    const { commandName, guild, user } = interaction;
    const member = await guild.members.fetch(user.id);

    if (interaction.isChatInputCommand()) {
        // setupassignments
        if (commandName === 'setupassignments') {
            const ch = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            const msg = await ch.send({ embeds: [init] });
            await setMeta('board_message_id', msg.id);
            log(`[Command] ${user.tag} ran /setupassignments`);
            return interaction.reply({ content: '✅ Assignment board initialized.', ephemeral: true });
        }

        // assignmyselfto
        if (commandName === 'assignmyselfto') {
            const prof = interaction.options.getString('profession');
            log(`[Command] ${user.tag} ran /assignmyselfto ${prof}`);
            const role = guild.roles.cache.find(r => r.name === prof);
            if (!role) {
                warn(`[assignmyselfto] Role ${prof} not found`);
                return interaction.reply({ content: `❌ Role **${prof}** not found.`, ephemeral: true });
            }
            await new Promise((res, rej) => {
                db.run(
                    `INSERT OR IGNORE INTO assignments(user_id,profession) VALUES(?,?)`,
                    [user.id, prof],
                    err => err ? rej(err) : res()
                );
            });
            await member.roles.add(role);
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Assigned to **${prof}**.`, ephemeral: true });
        }

        // unassignmyselffrom
        if (commandName === 'unassignmyselffrom') {
            const prof = interaction.options.getString('profession');
            log(`[Command] ${user.tag} ran /unassignmyselffrom ${prof}`);
            await new Promise((res, rej) => {
                db.run(
                    `DELETE FROM assignments WHERE user_id=? AND profession=?`,
                    [user.id, prof],
                    err => err ? rej(err) : res()
                );
            });
            const role = guild.roles.cache.find(r => r.name === prof);
            if (role) {
                await member.roles.remove(role);
                log(`[Role] Removed role ${prof} from ${user.tag}`);
            }
            await updateAssignmentEmbed(guild);
            return interaction.reply({ content: `✅ Unassigned from **${prof}**.`, ephemeral: true });
        }

        // settimer
        if (commandName === 'settimer') {
            const minutes = interaction.options.getInteger('minutes');
            const note = interaction.options.getString('note')?.trim() || '⏰ Your timer is up!';
            log(`[Command] ${user.tag} ran /settimer ${minutes}min – Note: "${note}"`);
            await interaction.reply({
                content: `⏳ Timer set for ${minutes} minute(s).\nI’ll remind you with: "${note}"`,
                ephemeral: true
            });
            setTimeout(() => {
                interaction.channel.send({ content: `🔔 <@${user.id}> ${note}` });
                log(`[Timer] Sent reminder to ${user.tag}`);
            }, minutes * 60 * 1000);
            return;
        }

        // selectprofession
        if (commandName === 'selectprofession') {
            log(`[Command] ${user.tag} ran /selectprofession`);
            const embed = new EmbedBuilder()
                .setTitle('Choose Your Profession')
                .setDescription('Select your profession below')
                .setColor(0x00AEFF);
            const menu = new StringSelectMenuBuilder()
                .setCustomId('select_profession')
                .setPlaceholder('Select a profession…')
                .addOptions(professions.map(p => ({ label: p, value: p })));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // settool
        if (commandName === 'settool') {
            const tool = interaction.options.getString('tool');
            const tier = parseInt(interaction.options.getString('tier'), 10);
            log(`[Command] ${user.tag} ran /settool ${tool} T${tier}`);
            const allowed = rarities.filter((_, i) => tier >= i + 1);
            const toolKey = tool.replace(/\s+/g, '_');
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`select_rarity:${toolKey}:${tier}`)
                .setPlaceholder('Select a rarity…')
                .addOptions(allowed.map(r => ({ label: `${r} T${tier}`, value: r })));
            const embed = new EmbedBuilder()
                .setTitle(`Choose a rarity for ${tool} T${tier}`)
                .setDescription('Only these rarities are valid at that tier:')
                .setColor(0xFFD700);
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // getmytools
        if (commandName === 'getmytools') {
            log(`[Command] ${user.tag} ran /getmytools`);
            db.all(
                `SELECT tool, tier, rarity FROM tools WHERE user_id = ?`,
                [user.id],
                (err, rows) => {
                    if (err) {
                        error('[getmytools] DB error', err.message);
                        return interaction.reply({ content: '❌ Could not fetch your tools.', ephemeral: true });
                    }
                    if (!rows.length) {
                        return interaction.reply({ content: `You haven't set any tools yet. Use /settool to add one!`, ephemeral: true });
                    }
                    const list = rows.map(r => `• **${r.tool}**: T${r.tier} ${r.rarity}`).join('\n');
                    const embed = new EmbedBuilder()
                        .setTitle(`${user.username}'s Tools`)
                        .setDescription(list)
                        .setColor(0x00AEFF)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            );
            return;
        }

        // gettools
        if (commandName === 'gettools') {
            const target = interaction.options.getUser('target');
            log(`[Command] ${user.tag} ran /gettools for ${target.tag}`);
            db.all(
                `SELECT tool, tier, rarity FROM tools WHERE user_id = ?`,
                [target.id],
                (err, rows) => {
                    if (err) {
                        error('[gettools] DB error', err.message);
                        return interaction.reply({ content: '❌ Could not fetch tools.', ephemeral: true });
                    }
                    if (!rows.length) {
                        return interaction.reply({ content: `${target.username} hasn’t set any tools.`, ephemeral: true });
                    }
                    const list = rows.map(r => `• **${r.tool}**: T${r.tier} ${r.rarity}`).join('\n');
                    const embed = new EmbedBuilder()
                        .setTitle(`${target.username}'s Tools`)
                        .setDescription(list)
                        .setColor(0x00AEFF)
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            );
            return;
        }

        // removetool
        if (commandName === 'removetool') {
            const tool = interaction.options.getString('tool');
            log(`[Command] ${user.tag} ran /removetool ${tool}`);
            const uid = user.id;
            // remove from DB
            await new Promise((res, rej) => {
                db.run(
                    `DELETE FROM tools WHERE user_id = ? AND tool = ?`,
                    [uid, tool],
                    err => err ? rej(err) : res()
                );
            });
            log(`[DB] Removed tool ${tool} for user ${uid}`);
            // remove roles
            const mem = await guild.members.fetch(uid);
            mem.roles.cache
                .filter(r => r.name.startsWith(`${tool} T`))
                .forEach(r => {
                    mem.roles.remove(r);
                    log(`[Role] Removed role ${r.name} from user ${uid}`);
                });
            // refresh board
            await updateAssignmentEmbed(guild);
            return interaction.reply({
                content: `✅ Removed **${tool}** from your tools.`,
                ephemeral: true
            });
        }
    }

    // StringSelectMenu handlers
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_profession') {
            const prof = interaction.values[0];
            log(`[SelectMenu] ${user.tag} selected profession ${prof}`);
            const embed = new EmbedBuilder()
                .setTitle(`Profession: ${prof}`)
                .setDescription(`Now choose your level for **${prof}**`)
                .setColor(0xFFD700);
            const levelMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_level_${prof}`)
                .setPlaceholder('Select a level…')
                .addOptions(levels.map(l => ({ label: `Level ${l}`, value: l })));
            return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(levelMenu)] });
        }

        if (interaction.customId.startsWith('select_level_')) {
            const prof = interaction.customId.replace('select_level_', '');
            const lvl = interaction.values[0];
            log(`[SelectMenu] ${user.tag} selected level ${lvl} for profession ${prof}`);
            const roleName = `${prof} ${lvl}`;
            const mem = await interaction.guild.members.fetch(interaction.user.id);

            const oldRole = mem.roles.cache.find(r => r.name.startsWith(`${prof} `));
            if (oldRole) {
                await mem.roles.remove(oldRole);
                log(`[Role] Removed old profession role ${oldRole.name} from ${user.tag}`);
            }

            let role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (!role) {
                role = await interaction.guild.roles.create({
                    name: roleName,
                    color: 0x3498db,
                    hoist: true,
                    mentionable: true,
                    reason: `Created for ${prof} ${lvl}`
                });
                log(`[Role] Created profession role ${roleName}`);
            }
            await mem.roles.add(role);
            log(`[Role] Assigned profession role ${roleName} to ${user.tag}`);
            await updateAssignmentEmbed(interaction.guild);

            return interaction.update({ content: `✅ Assigned **${roleName}**.`, embeds: [], components: [] });
        }

        if (interaction.customId.startsWith('select_rarity:')) {
            log(`[SelectMenu] ${user.tag} selected a rarity`);
            return handleSelectRarity(interaction);
        }
    }
});

client.login(TOKEN);
