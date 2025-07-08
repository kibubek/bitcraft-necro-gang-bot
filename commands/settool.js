const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { toolsList, tiers, validRaritiesForTier } = require('../constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settool')
        .setDescription('Assign a tool + tier')
        .addStringOption(o =>
            o.setName('tool')
                .setDescription('Tool')
                .setRequired(true)
                .addChoices(...toolsList.map(t => ({ name: t, value: t })))
        )
        .addStringOption(o =>
            o.setName('tier')
                .setDescription('Tier')
                .setRequired(true)
                .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
        ),
    async execute(interaction) {
        const tool = interaction.options.getString('tool');
        const tier = parseInt(interaction.options.getString('tier'), 10);
        const valid = validRaritiesForTier(tier);
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`tool:${tool.replace(/\s+/g, '_')}:${tier}`)
            .setPlaceholder('Select rarity…')
            .addOptions(valid.map(r => ({ label: `${r} T${tier}`, value: r })));
        const embed = new EmbedBuilder()
            .setTitle(`Choose rarity for ${tool} T${tier}`)
            .setColor(0xFFD700);
        await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
};
