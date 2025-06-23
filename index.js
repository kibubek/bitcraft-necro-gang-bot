require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials,
    ActionRowBuilder, StringSelectMenuBuilder,
    EmbedBuilder, SlashCommandBuilder, Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const ASSIGNMENT_FILE = path.join(__dirname, 'assignments.json');
const WELCOME_CHANNEL_ID = '1384144470261633147';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

const professions = ["Carpentry", "Farming", "Fishing", "Foraging", "Forestry", "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring", "Cooking"];
const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];

let assignmentData = { assigned: {}, messageId: null, channelId: null };
if (fs.existsSync(ASSIGNMENT_FILE)) {
    assignmentData = JSON.parse(fs.readFileSync(ASSIGNMENT_FILE, 'utf8'));
}
const assignedProfessionByUser = new Map(Object.entries(assignmentData.assigned));

function saveAssignments() {
    assignmentData.assigned = Object.fromEntries(assignedProfessionByUser);
    fs.writeFileSync(ASSIGNMENT_FILE, JSON.stringify(assignmentData, null, 2));
}

async function updateAssignmentEmbed(guild) {
    if (!assignmentData.channelId || !assignmentData.messageId) return;
    try {
        const channel = await guild.channels.fetch(assignmentData.channelId);
        const message = await channel.messages.fetch(assignmentData.messageId);

        const sections = professions.map(prof => {
            const entries = Array.from(assignedProfessionByUser.entries())
                .filter(([, p]) => p === prof)
                .map(([id]) => {
                    const member = guild.members.cache.get(id);
                    if (!member) return null;
                    const role = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                    return role ? `- ${member.displayName} – ${role.name}` : null;
                }).filter(Boolean);
            return `### ${prof}\n${entries.length ? entries.join('\n') : '*No one assigned*'}`;
        });

        await message.edit({
            embeds: [new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription(sections.join('\n\n'))
                .setColor(0x00AEFF)
                .setTimestamp()]
        });
    } catch (e) {
        console.warn('Embed update error:', e.message);
    }
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('setupassignments').setDescription('Initialize the assignment board'),
        new SlashCommandBuilder().setName('assignmyselfto').setDescription('Assign yourself to a profession')
            .addStringOption(opt => opt.setName('profession').setDescription('Profession').setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))),
        new SlashCommandBuilder().setName('profession').setDescription('Top 5 in a profession')
            .addStringOption(opt => opt.setName('profession').setDescription('Profession').setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))),
        new SlashCommandBuilder().setName('testwelcome').setDescription('Test welcome embed'),
        new SlashCommandBuilder().setName('selectprofession').setDescription('Choose a profession'),
        new SlashCommandBuilder().setName('removeprofession').setDescription('Remove your profession role')
            .addStringOption(opt => opt.setName('profession').setDescription('Profession').setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))),
        new SlashCommandBuilder().setName('settimer').setDescription('Set a timer that pings you after given minutes')
            .addIntegerOption(opt => opt.setName('minutes').setDescription('How many minutes').setRequired(true))
            .addStringOption(opt => opt.setName('note').setDescription('Optional note'))
    ];
    for (const [_, guild] of client.guilds.cache) {
        await guild.commands.set(commands.map(cmd => cmd.toJSON()));
        await guild.members.fetch();
        if (assignmentData.messageId && assignmentData.channelId) await updateAssignmentEmbed(guild);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;
    const { commandName, guild, user } = interaction;

    if (interaction.isChatInputCommand()) {
        const member = await guild.members.fetch(user.id);
        const profession = interaction.options.getString('profession');

        if (commandName === 'setupassignments') {
            const embed = new EmbedBuilder().setTitle('📋 Assigned Professions').setDescription('*Initializing...*').setColor(0x00AEFF);
            const msg = await interaction.channel.send({ embeds: [embed] });
            assignmentData.channelId = msg.channel.id;
            assignmentData.messageId = msg.id;
            saveAssignments();
            return void interaction.reply({ content: '✅ Assignment board initialized.', ephemeral: true });
        }

        if (commandName === 'assignmyselfto') {
            const role = member.roles.cache.find(r => r.name.startsWith(`${profession} `));
            if (!role) return void interaction.reply({ content: `❌ You don't have a role for **${profession}**.`, ephemeral: true });
            assignedProfessionByUser.set(user.id, profession);
            saveAssignments();
            await updateAssignmentEmbed(guild);
            return void interaction.reply({ content: `✅ Assigned to **${profession}**.`, ephemeral: true });
        }

        if (commandName === 'settimer') {
            const minutes = interaction.options.getInteger('minutes');
            let note = interaction.options.getString('note')?.trim();
            if (!note) note = '⏰ Your timer is up!';
            const delayMs = minutes * 60 * 1000;

            await interaction.reply({
                content: `⏳ Timer set for ${minutes} minute(s).\nI’ll remind you with: "${note}"`,
                ephemeral: true
            });

            setTimeout(() => {
                const extraLine = Math.random() < 0.5 ? `\n-# You can set your own timers using /settimer` : '';
                interaction.channel.send({ content: `🔔 <@${user.id}> ${note}${extraLine}` });
            }, delayMs);

            return;
        }



        if (commandName === 'profession') {
            const pattern = new RegExp(`^${profession} (\\d{1,3})$`);
            const scored = [];
            guild.members.cache.forEach(m => {
                const role = m.roles.cache.find(r => pattern.test(r.name));
                if (role) {
                    const lvl = parseInt(role.name.match(pattern)[1]);
                    scored.push({ user: m.user, level: lvl });
                }
            });
            if (!scored.length) return void interaction.reply({ content: `❌ No users found for ${profession}`, ephemeral: true });
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Top ${profession}`)
                .setDescription(scored.sort((a, b) => b.level - a.level).slice(0, 5)
                    .map((u, i) => `**#${i + 1}** – <@${u.user.id}>: Level ${u.level}`).join('\n'))
                .setColor(0xFFD700);
            return void interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'removeprofession') {
            const role = member.roles.cache.find(r => r.name.startsWith(`${profession} `));
            if (role) await member.roles.remove(role);
            return void interaction.reply({ content: role ? `✅ Removed ${role.name}` : `❌ No role for ${profession}`, ephemeral: true });
        }

        if (commandName === 'testwelcome') {
            const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
            if (!channel) return;
            const embed = new EmbedBuilder()
                .setColor(0x00AEFF)
                .setTitle(`🎉 Welcome to ${guild.name}!`)
                .setDescription(`Hey ${user.username}, we're glad you're here!\n\nUse \`/selectprofession\` to begin.`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member #${guild.memberCount}` })
                .setTimestamp();
            return void channel.send({ embeds: [embed] });
        }

        if (commandName === 'selectprofession') {
            const embed = new EmbedBuilder().setTitle('Choose Your Profession')
                .setDescription('Select your profession below').setColor(0x00AEFF);
            const menu = new StringSelectMenuBuilder().setCustomId('select_profession')
                .setPlaceholder('Select a profession...')
                .addOptions(professions.map(p => ({ label: p, value: p })));
            return void interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_profession') {
            const prof = interaction.values[0];
            const embed = new EmbedBuilder().setTitle(`Profession: ${prof}`)
                .setDescription(`Now choose your level for **${prof}**`).setColor(0xFFD700);
            const levelMenu = new StringSelectMenuBuilder().setCustomId(`select_level_${prof}`)
                .setPlaceholder('Select a level...')
                .addOptions(levels.map(l => ({ label: `Level ${l}`, value: l })));
            return void interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(levelMenu)] });
        }

        if (interaction.customId.startsWith('select_level_')) {
            const prof = interaction.customId.replace('select_level_', '');
            const level = interaction.values[0];
            const roleName = `${prof} ${level}`;
            const guild = interaction.guild;
            const member = await guild.members.fetch(interaction.user.id);

            const oldRole = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
            if (oldRole) await member.roles.remove(oldRole);

            let role = guild.roles.cache.find(r => r.name === roleName);
            if (!role) role = await guild.roles.create({
                name: roleName,
                color: 0x3498db,
                hoist: true,
                mentionable: true,
                reason: `Created for ${prof} ${level}`
            });

            await member.roles.add(role);

            if (assignedProfessionByUser.get(member.id) === prof) {
                saveAssignments();
                await updateAssignmentEmbed(guild);
            }

            return void interaction.update({ content: `✅ Assigned **${roleName}**.`, embeds: [], components: [] });
        }
    }
});

client.login(TOKEN);
