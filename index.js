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

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

const professions = [
    "Carpentry", "Farming", "Fishing", "Foraging", "Forestry",
    "Hunting", "Leatherworking", "Masonry", "Mining",
    "Scholar", "Smithing", "Tailoring", "Cooking"
];

const levels = ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"];

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    if (assignmentData.messageId && assignmentData.channelId) {
        const guilds = client.guilds.cache;
        for (const [id, guild] of guilds) {
            await guild.members.fetch(); // ensure full cache
            await updateAssignmentEmbed(guild);
        }
    }
    const commands = [
        new SlashCommandBuilder()
            .setName('setupassignments')
            .setDescription('Initializes the Assigned Professions board'),
        new SlashCommandBuilder()
            .setName('assignmyselfto')
            .setDescription('Assign yourself to a profession (must have a role of that profession)')
            .addStringOption(option =>
                option.setName('profession')
                    .setDescription('The profession to assign yourself to')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))),

        new SlashCommandBuilder()
            .setName('profession')
            .setDescription('See the top 5 users in a specific profession')
            .addStringOption(option =>
                option.setName('profession')
                    .setDescription('The profession to check')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p })))),

        new SlashCommandBuilder()
            .setName('testwelcome')
            .setDescription('Test the welcome message embed'),

        new SlashCommandBuilder()
            .setName('selectprofession')
            .setDescription('Start the profession selection process'),
        new SlashCommandBuilder()
            .setName('removeprofession')
            .setDescription('Remove your profession role')
            .addStringOption(option =>
                option.setName('profession')
                    .setDescription('Name of the profession to remove')
                    .setRequired(true)
                    .addChoices(...professions.map(p => ({ name: p, value: p }))))
    ];

    for (const [id, guild] of client.guilds.cache) {
        await guild.commands.set(commands);
        console.log(`✅ Registered slash commands in ${guild.name}`);
    }
});
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'profession') return;

    const profession = interaction.options.getString('profession');
    const rolePattern = new RegExp(`^${profession} (\\d{1,3})$`);
    const members = await interaction.guild.members.fetch();

    const scoredMembers = [];

    for (const member of members.values()) {
        const role = member.roles.cache.find(r => rolePattern.test(r.name));
        if (role) {
            const match = role.name.match(rolePattern);
            const level = parseInt(match[1]);
            scoredMembers.push({ user: member.user, level });
        }
    }

    if (scoredMembers.length === 0) {
        await interaction.reply({ content: `❌ No users found with the **${profession}** profession.`, ephemeral: true });
        return;
    }

    scoredMembers.sort((a, b) => b.level - a.level);
    const top5 = scoredMembers.slice(0, 5);

    const description = top5.map((entry, index) => {
        return `**#${index + 1}** – <@${entry.user.id}>: Level ${entry.level}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Top ${profession} Members`)
        .setDescription(description)
        .setColor(0xFFD700);

    await interaction.reply({ embeds: [embed] });
});

async function updateAssignmentEmbed(guild) {
    const channel = await guild.channels.fetch(assignmentChannelId);
    const message = await channel.messages.fetch(assignmentMessageId);

    const professionSections = professions.map(prof => {
        const entries = Array.from(assignedProfessionByUser.entries())
            .filter(([, p]) => p === prof)
            .map(([userId]) => {
                const member = guild.members.cache.get(userId);
                if (!member) return null;
                const role = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                if (!role) return null;
                return `- ${member.displayName} – ${role.name}`;
            })
            .filter(Boolean);

        return `### ${prof}\n${entries.length > 0 ? entries.join('\n') : '*No one assigned*'}`;
    });

    const embed = new EmbedBuilder()
        .setTitle('📋 Assigned Professions')
        .setDescription(professionSections.join('\n\n'))
        .setColor(0x00AEFF)
        .setTimestamp();

    await message.edit({ embeds: [embed] });
}
const fs = require('fs');
const path = require('path');
const assignmentDataPath = path.join(__dirname, 'assignments.json');

// Load existing data
let assignmentData = { assigned: {}, messageId: null, channelId: null };
if (fs.existsSync(assignmentDataPath)) {
    assignmentData = JSON.parse(fs.readFileSync(assignmentDataPath, 'utf-8'));
}

const assignedProfessionByUser = new Map(Object.entries(assignmentData.assigned));

async function updateAssignmentEmbed(guild) {
    const channel = await guild.channels.fetch(assignmentData.channelId);
    const message = await channel.messages.fetch(assignmentData.messageId);

    const professionSections = professions.map(prof => {
        const entries = Array.from(assignedProfessionByUser.entries())
            .filter(([, p]) => p === prof)
            .map(([userId]) => {
                const member = guild.members.cache.get(userId);
                if (!member) return null;
                const role = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                if (!role) return null;
                return `- ${member.displayName} – ${role.name}`;
            })
            .filter(Boolean);

        return `### ${prof}\n${entries.length > 0 ? entries.join('\n') : '*No one assigned*'}`;
    });

    const embed = new EmbedBuilder()
        .setTitle('📋 Assigned Professions')
        .setDescription(professionSections.join('\n\n'))
        .setColor(0x00AEFF)
        .setTimestamp();

    await message.edit({ embeds: [embed] });
}

// 🔧 Command: /setupassignments
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'setupassignments') return;

    const embed = new EmbedBuilder()
        .setTitle('📋 Assigned Professions')
        .setDescription('*Initializing...*')
        .setColor(0x00AEFF)
        .setTimestamp();

    const msg = await interaction.channel.send({ embeds: [embed] });

    assignmentData.channelId = msg.channel.id;
    assignmentData.messageId = msg.id;

    fs.writeFileSync(assignmentDataPath, JSON.stringify({
        ...assignmentData,
        assigned: Object.fromEntries(assignedProfessionByUser)
    }, null, 2));

    await interaction.reply({ content: '✅ Assignment board initialized and saved.', ephemeral: true });
});

// 🧍 Command: /assignmyselfto
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'assignmyselfto') return;

    const profession = interaction.options.getString('profession');
    const member = await interaction.guild.members.fetch(interaction.user.id);

    const role = member.roles.cache.find(r => r.name.startsWith(`${profession} `));
    if (!role) {
        await interaction.reply({ content: `❌ You don't have a role for **${profession}**.`, ephemeral: true });
        return;
    }

    // Remove previous assignment
    if (assignedProfessionByUser.has(member.id)) {
        const prev = assignedProfessionByUser.get(member.id);
        if (prev !== profession) {
            assignedProfessionByUser.delete(member.id);
        }
    }

    assignedProfessionByUser.set(member.id, profession);

    assignmentData.assigned = Object.fromEntries(assignedProfessionByUser);
    fs.writeFileSync(assignmentDataPath, JSON.stringify(assignmentData, null, 2));

    await updateAssignmentEmbed(interaction.guild);
    await interaction.reply({ content: `✅ You have been assigned to **${profession}**.`, ephemeral: true });
});

// Profession selection
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'selectprofession') {
        const embed = new EmbedBuilder()
            .setTitle('Choose Your Profession')
            .setDescription('Select your profession from the dropdown below.')
            .setColor(0x00AEFF);

        const professionMenu = new StringSelectMenuBuilder()
            .setCustomId('select_profession')
            .setPlaceholder('Select a profession...')
            .addOptions(professions.map(p => ({
                label: p,
                value: p
            })));

        const row = new ActionRowBuilder().addComponents(professionMenu);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Command to remove profession
    if (interaction.commandName === 'removeprofession') {
        const profession = interaction.options.getString('profession');
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const roleToRemove = member.roles.cache.find(r =>
            r.name.startsWith(`${profession} `)
        );

        if (roleToRemove) {
            await member.roles.remove(roleToRemove);
            await interaction.reply({ content: `✅ Removed role: ${roleToRemove.name}`, ephemeral: true });
        } else {
            await interaction.reply({ content: `❌ You don't have any role for **${profession}**`, ephemeral: true });
        }
    }
});
client.on('guildMemberAdd', async member => {
    const welcomeChannelId = '1384144470261633147'; // Replace with your welcome channel ID
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(0x00AEFF)
        .setTitle(`🎉 Welcome to ${member.guild.name}!`)
        .setDescription(`Hey ${member.user.username}, we're glad you're here!\n\nChoose your profession with \`/selectprofession\` and become part of the community.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Failed to send welcome message:', error.message);
    }
});

// Dropdown: profession → level
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'select_profession') {
        const selectedProfession = interaction.values[0];

        const embed = new EmbedBuilder()
            .setTitle(`Profession: ${selectedProfession}`)
            .setDescription(`Now select your level for **${selectedProfession}**.`)
            .setColor(0xFFD700);

        const levelMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_level_${selectedProfession}`)
            .setPlaceholder('Select a level...')
            .addOptions(levels.map(l => ({
                label: `Level ${l}`,
                value: l
            })));

        const row = new ActionRowBuilder().addComponents(levelMenu);
        await interaction.update({ embeds: [embed], components: [row] });
    }

    if (interaction.customId.startsWith('select_level_')) {
        const profession = interaction.customId.replace('select_level_', '');
        const level = interaction.values[0];
        const roleName = `${profession} ${level}`;

        const guild = interaction.guild;
        const member = await guild.members.fetch(interaction.user.id);

        // Remove old role of the same profession
        const existingRole = member.roles.cache.find(r =>
            r.name.startsWith(`${profession} `)
        );
        if (existingRole) {
            await member.roles.remove(existingRole);
        }

        // Create role if not exists
        let role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            role = await guild.roles.create({
                name: roleName,
                color: 0x3498db,
                hoist: true,
                mentionable: true,
                reason: `Created for ${profession} ${level}`
            });
        }

        await member.roles.add(role);

        await interaction.update({
            content: `✅ You now have the **${roleName}** role.`,
            embeds: [],
            components: []
        });
    }
});


client.on('threadCreate', async thread => {
    // Only target public forum threads
    if (!thread.parent || thread.parent.type !== 15) return; // 15 = GuildForum
    if (thread.archived) return;

    try {
        const questTag = thread.appliedTags?.some(tagId => {
            const tag = thread.parent.availableTags.find(t => t.id === tagId);
            return tag?.name.toLowerCase() === 'quest';
        });

        if (!questTag) return;

        console.log(`📝 Detected 'Quest' thread: "${thread.name}". Will auto-archive in 4 hours.`);

        setTimeout(async () => {
            try {
                const freshThread = await thread.fetch();
                if (!freshThread.archived) {
                    await freshThread.setArchived(true, 'Auto-archived Quest thread after 4 hours');
                    console.log(`✅ Archived thread: ${freshThread.name}`);
                }
            } catch (err) {
                console.error(`❌ Failed to archive thread: ${thread.name}`, err.message);
            }
        }, 4 * 60 * 60 * 1000); // 4 hours in milliseconds
    } catch (err) {
        console.error('Error processing threadCreate:', err.message);
    }
});

client.login(TOKEN);
