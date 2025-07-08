const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchAllAssignments, fetchAllTools } = require('../db');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show full profile info for a user')
        .addUserOption(o =>
            o.setName('target')
                .setDescription('User')
                .setRequired(true)
        ),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        log(`[Cmd] ${interaction.user.tag} → /info ${target.tag}`);
        const uid = target.id;
        const avatar = target.displayAvatarURL({ dynamic: true });

        const assignMap = await fetchAllAssignments();
        const pros = assignMap[uid] || [];
        const mainProf = pros[0] || 'None';
        const otherProf = pros.slice(1);

        const tmap = (await fetchAllTools())[uid] || {};
        const toolsList = Object.entries(tmap).map(([tool, { tier, rarity }]) => `${rarity} T${tier} ${tool}`);

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Profile`)
            .setThumbnail(avatar)
            .addFields(
                { name: 'Main Profession', value: mainProf, inline: true },
                { name: 'Other Professions', value: otherProf.length ? otherProf.join(', ') : 'None', inline: true },
                { name: 'Tools', value: toolsList.length ? toolsList.join('\n') : 'None', inline: false }
            )
            .setColor(0x00AEFF)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
