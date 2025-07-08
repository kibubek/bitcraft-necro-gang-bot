const { SlashCommandBuilder } = require('discord.js');
const { toolsList } = require('../constants');
const { db } = require('../db');
const { updateAssignmentEmbed } = require('../boards');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removetool')
        .setDescription('Remove a tool')
        .addStringOption(o =>
            o.setName('tool')
                .setDescription('Tool to remove')
                .setRequired(true)
                .addChoices(...toolsList.map(t => ({ name: t, value: t })))
        ),
    async execute(interaction) {
        const tool = interaction.options.getString('tool');
        log(`[Cmd] ${interaction.user.tag} → /removetool ${tool}`);
        await new Promise((r, j) => db.run(
            `DELETE FROM tools WHERE user_id=? AND tool=?`,
            [interaction.user.id, tool], e => e ? j(e) : r()
        ));
        await updateAssignmentEmbed(interaction.client, interaction.guild);
        await interaction.reply({ content: `✅ Removed ${tool}.`, ephemeral: true });
    }
};
