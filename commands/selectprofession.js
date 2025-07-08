const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { professions } = require('../constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('selectprofession')
        .setDescription('Choose a profession'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Choose a profession')
            .setColor(0x00AEFF);
        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_profession')
            .setPlaceholder('Profession...')
            .addOptions(professions.map(p => ({ label: p, value: p })));
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
};
