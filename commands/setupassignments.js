const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setMeta } = require('../db');
const { log } = require('../logger');

const ASSIGNMENT_CHANNEL_ID = process.env.ASSIGNMENT_CHANNEL_ID;
const ARMOR_CHANNEL_ID = process.env.ARMOR_CHANNEL_ID;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupassignments')
        .setDescription('Initialize boards'),
    async execute(interaction) {
        log(`[Cmd] ${interaction.user.tag} → /setupassignments`);
        const guild = interaction.guild;
        const ch = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        const init = new EmbedBuilder()
            .setTitle('📋 Assigned Professions')
            .setDescription('*Initializing…*')
            .setColor(0x00AEFF);
        const msg = await ch.send({ embeds: [init] });
        await setMeta('board_message_id', msg.id);
        await setMeta('board_message_ids', JSON.stringify([msg.id]));

        const ach = await guild.channels.fetch(ARMOR_CHANNEL_ID);
        const ainit = new EmbedBuilder()
            .setTitle('🛡️ Armor Board')
            .setDescription('*Initializing…*')
            .setColor(0x00AEFF);
        const amsg = await ach.send({ embeds: [ainit] });
        await setMeta('armor_message_id', amsg.id);

        await interaction.reply({ content: '✅ Boards initialized.', ephemeral: true });
    }
};
