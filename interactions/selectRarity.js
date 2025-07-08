const { db } = require('../db');
const { updateAssignmentEmbed, updateArmorEmbed } = require('../boards');
const { log } = require('../logger');

module.exports = {
    match: i => i.isStringSelectMenu() && (i.customId.startsWith('tool:') || i.customId.startsWith('armor:')),
    async execute(interaction) {
        const [type, k1, k2, k3] = interaction.customId.split(':');
        const uid = interaction.user.id;
        log(`[Select] ${interaction.user.tag} → ${interaction.customId}`);

        if (type === 'tool') {
            const tier = parseInt(k2, 10);
            const tool = k1.replace(/_/g, ' ');
            const rarity = interaction.values[0];
            await new Promise((res, rej) => db.run(
                `INSERT INTO tools(user_id,tool,tier,rarity)
       VALUES(?,?,?,?)
       ON CONFLICT(user_id,tool) DO UPDATE SET
         tier=excluded.tier,rarity=excluded.rarity`,
                [uid, tool, tier, rarity],
                e => e ? rej(e) : res()
            ));
            await updateAssignmentEmbed(interaction.client, interaction.guild);
        }

        if (type === 'armor') {
            const material = k1, piece = k2, tier = parseInt(k3, 10);
            const rarity = interaction.values[0];
            await new Promise((res, rej) => db.run(
                `INSERT INTO armor(user_id,material,piece,tier,rarity)
       VALUES(?,?,?,?,?)
       ON CONFLICT(user_id,material,piece) DO UPDATE SET
         tier=excluded.tier,rarity=excluded.rarity`,
                [uid, material, piece, tier, rarity],
                e => e ? rej(e) : res()
            ));
            await updateAssignmentEmbed(interaction.client, interaction.guild);
            await updateArmorEmbed(interaction.client, interaction.guild);
        }

        await interaction.update({
            content: `✅ Set **${type === 'tool'
                ? k1.replace(/_/g, ' ')
                : `${k1} ${k2}`
                }**!`,
            embeds: [], components: []
        });
    }
};
