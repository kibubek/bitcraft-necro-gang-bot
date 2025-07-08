const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { professions, levels } = require('../constants');

module.exports = {
    match: i => i.isStringSelectMenu() && i.customId === 'select_profession',
    async execute(interaction) {
        const prof = interaction.values[0];
        const embed = new EmbedBuilder().setTitle(`Profession: ${prof}`).setColor(0xFFD700);
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`select_level_${prof}`)
            .setPlaceholder('Level…')
            .addOptions(levels.map(l => ({ label: `Level ${l}`, value: l })));
        await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }
};
