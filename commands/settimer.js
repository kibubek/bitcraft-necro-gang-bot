const { SlashCommandBuilder } = require('discord.js');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settimer')
        .setDescription('Set a timer')
        .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Optional note')),
    async execute(interaction) {
        const mins = interaction.options.getInteger('minutes');
        const note = interaction.options.getString('note')?.trim() || '⏰ Your timer is up!';
        log(`[Cmd] ${interaction.user.tag} → /settimer ${mins}min`);
        await interaction.reply({ content: `⏳ Timer set for ${mins} minutes.`, ephemeral: true });
        setTimeout(() => {
            interaction.channel.send({ content: `🔔 <@${interaction.user.id}> ${note}` });
            log(`[Timer] Pinged ${interaction.user.tag}`);
        }, mins * 60000);
    }
};
