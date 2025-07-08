const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { materials, pieces, tiers, validRaritiesForTier } = require('../constants');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setarmor')
        .setDescription('Assign an armor piece')
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
        )
        .addStringOption(o =>
            o.setName('tier')
                .setDescription('Tier')
                .setRequired(true)
                .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
        ),
    async execute(interaction) {
        const mat = interaction.options.getString('material');
        const piece = interaction.options.getString('piece');
        const tier = parseInt(interaction.options.getString('tier'), 10);
        log(`[Cmd] ${interaction.user.tag} → /setarmor ${mat} ${piece} T${tier}`);
        const valid = validRaritiesForTier(tier);
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`armor:${mat}:${piece}:${tier}`)
            .setPlaceholder('Select rarity…')
            .addOptions(valid.map(r => ({ label: `${r} T${tier}`, value: r })));
        const embed = new EmbedBuilder()
            .setTitle(`Choose rarity for ${mat} ${piece} T${tier}`)
            .setColor(0xFFD700);
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
};
