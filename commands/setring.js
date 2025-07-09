const { SlashCommandBuilder } = require('discord.js');
const { tiers } = require('../constants');
const { db } = require('../db');
const { updateArmorEmbed } = require('../boards');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setring')
        .setDescription('Set your ring tier')
        .addStringOption(o =>
            o.setName('tier')
                .setDescription('Tier')
                .setRequired(true)
                .addChoices(...tiers.map(t => ({ name: `T${t}`, value: t })))
        ),
    async execute(interaction) {
        const tier = parseInt(interaction.options.getString('tier'), 10);
        log(`[Cmd] ${interaction.user.tag} → /setring T${tier}`);
        await new Promise((res, rej) => db.run(
            `INSERT INTO rings(user_id,tier)
             VALUES(?,?)
             ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier`,
            [interaction.user.id, tier],
            e => e ? rej(e) : res()
        ));
        await updateArmorEmbed(interaction.client, interaction.guild);
        await interaction.reply({ content: `✅ Ring set to T${tier}.`, ephemeral: true });
    }
};
