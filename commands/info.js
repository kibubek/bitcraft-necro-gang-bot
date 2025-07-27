const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchAllAssignments } = require('../db');
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
        const focusedText = pros.length ? pros.join(', ') : 'None';

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Profile`)
            .setThumbnail(avatar)
            .addFields(
                { name: 'Professions', value: focusedText, inline: false }
            )
            .setColor(0x00AEFF)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
