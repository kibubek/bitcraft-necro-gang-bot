require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const { updateAssignmentEmbed } = require('./boards');
const { professions } = require('./constants');

const TOKEN = process.env.DISCORD_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

const { log, error } = require('./logger');

async function cleanupRoles(guild) {
    await guild.roles.fetch();
    for (const role of guild.roles.cache.values()) {
        for (const prof of professions) {
            if (new RegExp(`^${prof} \\d+$`).test(role.name)) {
                try {
                    await role.delete('Remove level-based profession role');
                    log(`[Startup] Deleted role ${role.name} in ${guild.name}`);
                } catch (err) {
                    error('[Startup] Failed to delete role', err);
                }
                break;
            }
        }
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});
//TEST
// Load commands
const commands = new Map();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const cmd = require(`./commands/${file}`);
    commands.set(cmd.data.name, cmd);
}
log(`[Init] Loaded ${commands.size} command modules`);
const commandData = Array.from(commands.values()).map(c => c.data.toJSON());


client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commandData);
        log(`[Init] Synced commands to ${guild.name}`);
        await guild.members.fetch();
        await cleanupRoles(guild);
        await updateAssignmentEmbed(client, guild);
    }
});

client.on(Events.GuildMemberAdd, async member => {
    log(`[Welcome] New member ${member.user.tag}`);
    try {
        const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Welcome to Lich-core Dominion!')
                .setDescription(`Hey ${member}, we’re glad you’re here!`)
                .setColor(0x00AEFF)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member #${member.guild.memberCount} • ${new Date().toLocaleDateString()}` });
            await channel.send({ embeds: [embed] });
            log('[Welcome] Sent welcome message');
        }
    } catch (err) {
        error('[Welcome] error', err);
    }
    log('[Welcome] Newcomer processed');
});

client.on(Events.GuildMemberRemove, async member => {
    log(`[Depart] Member left: ${member.user.tag}`);
    await updateAssignmentEmbed(client, member.guild);
    log('[Depart] Boards updated');
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
        const before = new Set(oldMember.roles.cache.map(r => r.name));
        const after = new Set(newMember.roles.cache.map(r => r.name));
        let changed = false;
        for (const prof of professions) {
            if (before.has(prof) !== after.has(prof)) {
                changed = true;
                break;
            }
        }
        if (changed) {
            await updateAssignmentEmbed(client, newMember.guild);
            log('[Update] Assignment roles changed');
        }
    } catch (err) {
        error('[Update] member role update error', err);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);
            if (command) {
                log(`[Cmd] ${interaction.user.tag} → /${interaction.commandName}`);
                await command.execute(interaction);
            }
        }
    } catch (err) {
        error('[Interaction]', err);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ There was an error while executing this interaction.', ephemeral: true });
        }
    }
});

client.login(TOKEN);
