const { SlashCommandBuilder } = require('discord.js');
const { professions } = require('../constants');
const { db } = require('../db');
const { updateAssignmentEmbed } = require('../boards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unassignmyselffrom')
        .setDescription('Unassign yourself from a profession')
        .addStringOption(o =>
            o.setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
        ),
    async execute(interaction) {
        const prof = interaction.options.getString('profession');
        await new Promise((r, j) => db.run(
            `DELETE FROM assignments WHERE user_id=? AND profession=?`,
            [interaction.user.id, prof], e => e ? j(e) : r()
        ));
        const role = interaction.guild.roles.cache.find(r => r.name === prof);
        if (role) await interaction.guild.members.fetch(interaction.user.id).then(m => m.roles.remove(role));
        await updateAssignmentEmbed(interaction.client, interaction.guild);
        await interaction.reply({ content: `✅ Unassigned from **${prof}**.`, ephemeral: true });
    }
};
