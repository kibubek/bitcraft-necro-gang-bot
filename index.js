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

const TOKEN = process.env.DISCORD_TOKEN;
const ASSIGNMENT_CHANNEL_ID = '1386402550399500409';
const DB_PATH = path.join(__dirname, 'assignments.db');

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, err => {
    if (err) return console.error('[DB]', err.message);
    console.log('✅ Connected to SQLite database.');
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
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

const professions = [
    "Carpentry", "Farming", "Fishing", "Foraging", "Forestry",
    "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar",
    "Smithing", "Tailoring", "Cooking"
];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];

// Helpers for SQLite operations
function fetchAllAssignments() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT user_id, profession FROM assignments`, [], (err, rows) => {
            if (err) return reject(err);
            const assigned = {};
            for (const { user_id, profession } of rows) {
                assigned[user_id] = assigned[user_id] || [];
                assigned[user_id].push(profession);
            }
            resolve(assigned);
        });
    });
}

function getMeta(key) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT value FROM meta WHERE key = ?`, [key], (err, row) => {
            if (err) return reject(err);
            resolve(row?.value);
        });
    });
}

function setMeta(key, value) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO meta(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            [key, value],
            err => (err ? reject(err) : resolve())
        );
    });
}

function assignedToList(profession, assignedMap, guild) {
    const out = [];
    for (const [userId, profs] of Object.entries(assignedMap)) {
        if (!profs.includes(profession)) continue;
        const member = guild.members.cache.get(userId);
        if (!member) continue;
        const role = member.roles.cache.find(r => r.name.startsWith(`${profession} `));
        if (!role) continue;
        out.push({ id: userId, roleName: role.name });
    }
    return out;
}

// Robust embed updater
async function updateAssignmentEmbed(guild) {
    try {
        const assigned = await fetchAllAssignments();
        const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        const storedId = await getMeta('board_message_id');
        let message;

        if (storedId) {
            try {
                const fetched = await channel.messages.fetch(storedId);
                if (fetched && typeof fetched.edit === 'function') {
                    message = fetched;
                } else {
                    throw new Error('Stored message invalid');
                }
            } catch (err) {
                console.warn('[RECOVERY] Assignment message missing or invalid. Creating a new one...');
            }
        }

        if (!message) {
            const initEmbed = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing...*')
                .setColor(0x00AEFF);
            const newMsg = await channel.send({ embeds: [initEmbed] });
            await setMeta('board_message_id', newMsg.id);
            message = newMsg;
        }

        const sections = professions.map(prof => {
            const entries = assignedToList(prof, assigned, guild)
                .map(e => `- <@${e.id}> – ${e.roleName}`);
            return `### ${prof}\n${entries.length ? entries.join('\n') : '*No one assigned*'}`;
        });

        const updatedEmbed = new EmbedBuilder()
            .setTitle('📋 Assigned Professions')
            .setDescription(sections.join('\n\n'))
            .setColor(0x00AEFF)
            .setTimestamp();

        await message.edit({ embeds: [updatedEmbed] });
    } catch (e) {
        console.warn('Embed update error:', e);
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('setupassignments').setDescription('Initialize the assignment board'),
        new SlashCommandBuilder()
            .setName('assignmyselfto')
            .setDescription('Assign yourself to a profession')
            .addStringOption(opt => opt.setName('profession').setDescription('Profession').setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))),
        new SlashCommandBuilder()
            .setName('unassignmyselffrom')
            .setDescription('Unassign yourself from a profession')
            .addStringOption(opt => opt.setName('profession').setDescription('Profession').setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))),
        new SlashCommandBuilder()
            .setName('settimer')
            .setDescription('Set a timer that pings you after given minutes')
            .addIntegerOption(opt => opt.setName('minutes').setDescription('How many minutes').setRequired(true))
            .addStringOption(opt => opt.setName('note').setDescription('Optional note')),
        new SlashCommandBuilder().setName('selectprofession').setDescription('Choose a profession')
    ];

    for (const [_, guild] of client.guilds.cache) {
        await guild.commands.set(commands.map(cmd => cmd.toJSON()));
        await guild.members.fetch();
        await updateAssignmentEmbed(guild);
        console.log(`✅ Commands registered in ${guild.name}`);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;
    const { commandName, guild, user } = interaction;

    if (interaction.isChatInputCommand()) {
        const member = await guild.members.fetch(user.id);
        const profession = interaction.options.getString('profession');

        if (commandName === 'setupassignments') {
            const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
            const embed = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing...*')
                .setColor(0x00AEFF);
            const msg = await channel.send({ embeds: [embed] });
            await setMeta('board_message_id', msg.id);
            console.log(`[SETUP] ${user.tag} initialized assignment board`);
            return void interaction.reply({ content: '✅ Assignment board initialized.', ephemeral: true });
        }

        if (commandName === 'assignmyselfto') {
            const generic = guild.roles.cache.find(r => r.name === profession);
            if (!generic) {
                return void interaction.reply({ content: `❌ Role **${profession}** not found.`, ephemeral: true });
            }
            await new Promise((res, rej) => {
                db.run(
                    `INSERT OR IGNORE INTO assignments (user_id, profession) VALUES (?, ?)`,
                    [user.id, profession],
                    err => err ? rej(err) : res()
                );
            });
            await member.roles.add(generic);
            await updateAssignmentEmbed(guild);
            console.log(`[ASSIGN] ${user.tag} assigned to ${profession}`);
            return void interaction.reply({ content: `✅ Assigned to **${profession}**.`, ephemeral: true });
        }

        if (commandName === 'unassignmyselffrom') {
            await new Promise((res, rej) => {
                db.run(
                    `DELETE FROM assignments WHERE user_id = ? AND profession = ?`,
                    [user.id, profession],
                    err => err ? rej(err) : res()
                );
            });
            const generic = guild.roles.cache.find(r => r.name === profession);
            if (generic) await member.roles.remove(generic);
            await updateAssignmentEmbed(guild);
            console.log(`[UNASSIGN] ${user.tag} unassigned from ${profession}`);
            return void interaction.reply({ content: `✅ Unassigned from **${profession}**.`, ephemeral: true });
        }

        if (commandName === 'settimer') {
            const minutes = interaction.options.getInteger('minutes');
            let note = interaction.options.getString('note')?.trim() || '⏰ Your timer is up!';
            const delayMs = minutes * 60 * 1000;

            await interaction.reply({
                content: `⏳ Timer set for ${minutes} minute(s).\nI’ll remind you with: "${note}"`,
                ephemeral: true
            });

            console.log(`[TIMER] ${user.tag} set timer for ${minutes} min – Note: "${note}"`);
            setTimeout(() => {
                const extraLine = Math.random() < 0.5 ? `\n~# You can set your own timers using /settimer` : '';
                interaction.channel.send({ content: `🔔 <@${user.id}> ${note}${extraLine}` });
                console.log(`[TIMER DONE] Pinged ${user.tag}`);
            }, delayMs);
        }

        if (commandName === 'selectprofession') {
            const embed = new EmbedBuilder()
                .setTitle('Choose Your Profession')
                .setDescription('Select your profession below')
                .setColor(0x00AEFF);
            const menu = new StringSelectMenuBuilder()
                .setCustomId('select_profession')
                .setPlaceholder('Select a profession...')
                .addOptions(professions.map(p => ({ label: p, value: p })));
            console.log(`[SELECT] ${user.tag} opened profession selector`);
            return void interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_profession') {
            const prof = interaction.values[0];
            const embed = new EmbedBuilder()
                .setTitle(`Profession: ${prof}`)
                .setDescription(`Now choose your level for **${prof}**`)
                .setColor(0xFFD700);
            const levelMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_level_${prof}`)
                .setPlaceholder('Select a level...')
                .addOptions(levels.map(l => ({ label: `Level ${l}`, value: l })));
            console.log(`[LEVEL MENU] ${interaction.user.tag} picked ${prof}`);
            return void interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(levelMenu)] });
        }

        if (interaction.customId.startsWith('select_level_')) {
            const prof = interaction.customId.replace('select_level_', '');
            const level = interaction.values[0];
            const roleName = `${prof} ${level}`;
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const oldRole = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
            if (oldRole) await member.roles.remove(oldRole);

            let role = interaction.guild.roles.cache.find(r => r.name === roleName);
            if (!role) {
                role = await interaction.guild.roles.create({
                    name: roleName,
                    color: 0x3498db,
                    hoist: true,
                    mentionable: true,
                    reason: `Created for ${prof} ${level}`
                });
            }
            await member.roles.add(role);
            console.log(`[LEVEL SELECTED] ${interaction.user.tag} now has role ${roleName}`);
            // Update the assignment board embed
            await updateAssignmentEmbed(interaction.guild);
            return void interaction.update({ content: `✅ Assigned **${roleName}**.`, embeds: [], components: [] });
        }
    }
});

client.login(TOKEN);
