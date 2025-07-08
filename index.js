require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const { updateAssignmentEmbed, updateArmorEmbed } = require('./boards');

const TOKEN = process.env.DISCORD_TOKEN;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

const log = (...args) => console.log(new Date().toISOString(), ...args);
const error = (...args) => console.error(new Date().toISOString(), ...args);

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
const commandData = Array.from(commands.values()).map(c => c.data.toJSON());

// Load interaction handlers
const interactions = fs.readdirSync(path.join(__dirname, 'interactions'))
    .filter(f => f.endsWith('.js'))
    .map(f => require(`./interactions/${f}`));

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commandData);
        await guild.members.fetch();
        await updateAssignmentEmbed(client, guild);
        await updateArmorEmbed(client, guild);
    }
});

client.on(Events.GuildMemberAdd, async member => {
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
        }
    } catch (err) {
        error('[Welcome] error', err);
    }
    await updateArmorEmbed(client, member.guild);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
        } else {
            for (const handler of interactions) {
                if (handler.match(interaction)) {
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
