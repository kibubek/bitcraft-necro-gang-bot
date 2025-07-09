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
            console.log('[DEV] skipping armor embed');
            return;
        }

        try {
            const armorMap = await fetchAllArmor();
            const channel = await client.channels.fetch(ARMOR_CHANNEL_ID);

            // fetch or initialize the message
            let msg;
            const stored = await getMeta('armor_message_id');
            if (stored) {
                try { msg = await channel.messages.fetch(stored); }
                catch { /* create below */ }
            }
            if (!msg) {
                const init = new EmbedBuilder()
                    .setTitle('🛡️ Armor Board')
                    .setDescription('*Initializing…*')
                    .setColor(0x00AEFF);
                msg = await channel.send({ embeds: [init] });
                await setMeta('armor_message_id', msg.id);
            }

            // build pages of up to 25 fields each
            const allFields = [];
            for (const [uid, userArmor] of Object.entries(armorMap)) {
                const cloth = Object.values(userArmor)
                    .filter(a => a.material === 'Cloth')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                const leather = Object.values(userArmor)
                    .filter(a => a.material === 'Leather')
                    .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                    .join('\n') || '*(none)*';

                allFields.push(
                    { name: 'User', value: `<@${uid}>`, inline: true },
                    { name: '🧵 Cloth', value: cloth, inline: true },
                    { name: '🥾 Leather', value: leather, inline: true }
                );
            }

            // chunk into groups of 24 (8 user rows) to avoid splitting a row across pages
            const pages = [];
            for (let i = 0; i < allFields.length; i += 24) {
                const slice = allFields.slice(i, i + 24);
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Armor Board')
                    .setDescription('*Cloth & Leather only*')
                    .setColor(0x00AEFF)
                    .setTimestamp()
                    .addFields(slice);
                pages.push(embed);
            }

            // if there were no users, show an empty placeholder
            if (pages.length === 0) {
                pages.push(
                    new EmbedBuilder()
                        .setTitle('🛡️ Armor Board')
                        .setDescription('*No Cloth or Leather set yet.*')
                        .setColor(0x00AEFF)
                );
            }

            await msg.edit({ embeds: pages });
            console.log(`[Armor] board updated across ${pages.length} embed(s)`);
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
