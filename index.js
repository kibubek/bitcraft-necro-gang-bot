require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const { updateAssignmentEmbed, updateArmorEmbed } = require('./boards');

const TOKEN = process.env.DISCORD_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

const { log, error } = require('./logger');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember]
});

// Load commands
const commands = new Map();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const cmd = require(`./commands/${file}`);
    commands.set(cmd.data.name, cmd);
}
log(`[Init] Loaded ${commands.size} command modules`);
const commandData = Array.from(commands.values()).map(c => c.data.toJSON());

// Load interaction handlers
const interactions = fs.readdirSync(path.join(__dirname, 'interactions'))
    .filter(f => f.endsWith('.js'))
    .map(f => require(`./interactions/${f}`));
log(`[Init] Loaded ${interactions.length} interaction handlers`);

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commandData);
        log(`[Init] Synced commands to ${guild.name}`);
        await guild.members.fetch();
        await updateAssignmentEmbed(client, guild);
        await updateArmorEmbed(client, guild);
    }
});

client.on(Events.GuildMemberAdd, async member => {
    log(`[Welcome] New member ${member.user.tag}`);
    try {
        const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Welcome to Lich-core Dominion!')
                .setDescription(`Hey ${member}, we’re glad you’re here!\n\nChoose your profession with \`/selectprofession\` and become part of the community.`)
                .setColor(0x00AEFF)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member #${member.guild.memberCount} • ${new Date().toLocaleDateString()}` });
            await channel.send({ embeds: [embed] });
            log('[Welcome] Sent welcome message');
        }
    } catch (err) {
        error('[Welcome] error', err);
    }
    await updateArmorEmbed(client, member.guild);
    log('[Welcome] Armor board synced');
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);
            if (command) {
                log(`[Cmd] ${interaction.user.tag} → /${interaction.commandName}`);
                await command.execute(interaction);
            }
        } else {
            for (const handler of interactions) {
                if (handler.match(interaction)) {
                    log(`[Select] ${interaction.user.tag} → ${interaction.customId}`);
                    await handler.execute(interaction);
                    break;
                }
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
