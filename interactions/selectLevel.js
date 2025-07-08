const { EmbedBuilder } = require('discord.js');
const { updateAssignmentEmbed } = require('../boards');
const { log } = require('../logger');

module.exports = {
    match: i => i.isStringSelectMenu() && i.customId.startsWith('select_level_'),
    async execute(interaction) {
        const prof = interaction.customId.replace('select_level_', '');
        const lvl = interaction.values[0];
        log(`[Select] ${interaction.user.tag} → level ${lvl} for ${prof}`);
        const mem = await interaction.guild.members.fetch(interaction.user.id);
        const old = mem.roles.cache.find(r => r.name.startsWith(`${prof} `));
        if (old) await mem.roles.remove(old);
        let role = interaction.guild.roles.cache.find(r => r.name === `${prof} ${lvl}`);
        if (!role) {
            role = await interaction.guild.roles.create({
                name: `${prof} ${lvl}`,
                color: 0x3498db,
                hoist: true,
                mentionable: true,
                reason: `Created for ${prof} ${lvl}`
            });
        }
        await mem.roles.add(role);
        await updateAssignmentEmbed(interaction.client, interaction.guild);
        await interaction.update({ content: `✅ Assigned **${prof} ${lvl}**!`, embeds: [], components: [] });
    }
};
