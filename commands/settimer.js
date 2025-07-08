const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settimer')
        .setDescription('Set a timer')
        .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
        .addStringOption(o => o.setName('note').setDescription('Optional note')),
    async execute(interaction) {
        const mins = interaction.options.getInteger('minutes');
        const note = interaction.options.getString('note')?.trim() || '⏰ Your timer is up!';
        await interaction.reply({ content: `⏳ Timer set for ${mins} minutes.`, ephemeral: true });
        setTimeout(() => {
            interaction.channel.send({ content: `🔔 <@${interaction.user.id}> ${note}` });
        }, mins * 60000);
    }
};
