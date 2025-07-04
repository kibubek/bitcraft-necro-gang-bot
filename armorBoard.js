// armorBoard.js
const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

module.exports = function initArmorBoard({ client, db, DEV, ARMOR_CHANNEL_ID, getMeta, setMeta }) {
    // Helper to fetch all armor rows
    async function fetchAllArmor() {
        return new Promise((res, rej) => {
            db.all(`SELECT user_id,material,piece,tier,rarity FROM armor`, [], (e, rows) => {
                if (e) return rej(e);
                const m = {};
                rows.forEach(r => {
                    m[r.user_id] = m[r.user_id] || {};
                    m[r.user_id][`${r.material}:${r.piece}`] = {
                        material: r.material,
                        piece: r.piece,
                        tier: r.tier,
                        rarity: r.rarity
                    };
                });
                res(m);
            });
        });
    }

    // Renders the armor embed into the configured channel
    // replace your updateArmorEmbed with this version:

    async function updateArmorEmbed(guild) {
        if (DEV) {
            console.log('[DEV] skip armor embed');
            return;
        }

        try {
            const armorMap = await fetchAllArmor();
            const channel = await client.channels.fetch(ARMOR_CHANNEL_ID);
            let message;
            const stored = await getMeta('armor_message_id');
            if (stored) {
                try { message = await channel.messages.fetch(stored); }
                catch { }
            }
            if (!message) {
                const init = new EmbedBuilder()
                    .setTitle('🛡️ Armor Board')
                    .setDescription('*Initializing…*')
                    .setColor(0x00AEFF);
                message = await channel.send({ embeds: [init] });
                await setMeta('armor_message_id', message.id);
            }

            const embed = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setColor(0x00AEFF)
                .setDescription('*Cloth & Leather only*');
            for (const [uid, userArmor] of Object.entries(armorMap)) {
                // Cloth lines
                const clothLines = Object.values(userArmor)
                    .filter(a => a.material === 'Cloth')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                // Leather lines
                const leatherLines = Object.values(userArmor)
                    .filter(a => a.material === 'Leather')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                embed.addFields(
                    { name: 'User', value: `<@${uid}>`, inline: true },
                    { name: '🧵 Cloth', value: clothLines, inline: true },
                    { name: '🥾 Leather', value: leatherLines, inline: true }
                );

                // Discord caps at 25 fields (so ~8 users); break if near limit
                if (embed.data.fields.length >= 24) break;
            }

            await message.edit({ embeds: [embed] });
            console.log('[Armor] board updated (3-column layout)');
        } catch (err) {
            console.error('[Armor] update error', err);
        }
    }


    // Slash‐command definitions for setarmor/removearmor
    const armorCommands = [
        {
            builder: new StringSelectMenuBuilder(),  // placeholder, will be added in index.js
            name: 'setarmor',
            description: 'Assign a Cloth/Leather armor piece',
            options: [
                { name: 'material', choices: ['Leather', 'Cloth'] },
                { name: 'piece', choices: ['Head', 'Chestplate', 'Leggings', 'Boots', 'Gloves', 'Belt'] },
                { name: 'tier', choices: Array.from({ length: 10 }, (_, i) => `T${i + 1}`) }
            ]
        },
        {
            name: 'removearmor',
            description: 'Remove a Cloth/Leather armor piece',
            options: [
                { name: 'material', choices: ['Leather', 'Cloth'] },
                { name: 'piece', choices: ['Head', 'Chestplate', 'Leggings', 'Boots', 'Gloves', 'Belt'] }
            ]
        }
    ];

    // Expose to index.js
    return { updateArmorEmbed, armorCommands };
};
