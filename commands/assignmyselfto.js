const { SlashCommandBuilder } = require('discord.js');
const { professions } = require('../constants');
const { db } = require('../db');
const { updateAssignmentEmbed } = require('../boards');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assignmyselfto')
        .setDescription('Assign yourself to a profession')
        .addStringOption(o =>
            o.setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
        ),
    async execute(interaction) {
        const prof = interaction.options.getString('profession');
        log(`[Cmd] ${interaction.user.tag} → /assignmyselfto ${prof}`);
        await new Promise((r, j) => db.run(
            `INSERT OR IGNORE INTO assignments(user_id,profession) VALUES(?,?)`,
            [interaction.user.id, prof], e => e ? j(e) : r()
        ));
        const role = interaction.guild.roles.cache.find(r => r.name === prof);
        if (role) await interaction.guild.members.fetch(interaction.user.id).then(m => m.roles.add(role));
        await updateAssignmentEmbed(interaction.client, interaction.guild);
        await interaction.reply({ content: `✅ Assigned to **${prof}**.`, ephemeral: true });
    }
};
