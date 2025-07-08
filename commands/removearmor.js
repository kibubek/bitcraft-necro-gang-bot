const { SlashCommandBuilder } = require('discord.js');
const { materials, pieces } = require('../constants');
const { db } = require('../db');
const { updateAssignmentEmbed, updateArmorEmbed } = require('../boards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removearmor')
        .setDescription('Remove an armor piece')
        .addStringOption(o =>
            o.setName('material')
                .setDescription('Leather|Cloth|Plate')
                .setRequired(true)
                .addChoices(...materials.map(m => ({ name: m, value: m })))
        )
        .addStringOption(o =>
            o.setName('piece')
                .setDescription('Head|Chestplate|Leggings|Boots|Gloves|Belt')
                .setRequired(true)
                .addChoices(...pieces.map(p => ({ name: p, value: p })))
        ),
    async execute(interaction) {
        const mat = interaction.options.getString('material');
        const piece = interaction.options.getString('piece');
        await new Promise((r, j) => db.run(
            `DELETE FROM armor WHERE user_id=? AND material=? AND piece=?`,
            [interaction.user.id, mat, piece], e => e ? j(e) : r()
        ));
        await updateAssignmentEmbed(interaction.client, interaction.guild);
        await updateArmorEmbed(interaction.client, interaction.guild);
        await interaction.reply({ content: `✅ Removed ${mat} ${piece}.`, ephemeral: true });
    }
};
