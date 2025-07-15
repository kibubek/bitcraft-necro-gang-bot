const { EmbedBuilder } = require('discord.js');
const { log, error } = require('./logger');
const { fetchAllAssignments, fetchAllTools, fetchAllArmor, fetchAllRings, fetchAllHearts, getMeta, setMeta, DEV } = require('./db');
const { professions, rarities } = require('./constants');

const ASSIGNMENT_CHANNEL_ID = process.env.ASSIGNMENT_CHANNEL_ID;
const ARMOR_CHANNEL_ID = process.env.ARMOR_CHANNEL_ID;
const professionToolMap = require('./constants').professionToolMap;

async function updateAssignmentEmbed(client, guild) {
    if (DEV) {
        log('[DEV] skip assignment embed');
        return;
    }

    try {
        const [assignMap, toolMap] = await Promise.all([
            fetchAllAssignments(),
            fetchAllTools()
        ]);
        const channel = await guild.channels.fetch(ASSIGNMENT_CHANNEL_ID);
        const storedMulti = await getMeta('board_message_ids');
        const storedSingle = await getMeta('board_message_id');
        let ids = [];
        if (storedMulti) {
            try { ids = JSON.parse(storedMulti); } catch { ids = []; }
        } else if (storedSingle) {
            ids = [storedSingle];
        }
        const messages = [];
        for (const id of ids) {
            try {
                const m = await channel.messages.fetch(id);
                messages.push(m);
            } catch { }
        }
        if (messages.length === 0) {
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            const m = await channel.send({ embeds: [init] });
            messages.push(m);
        }

        const embeds = [];
        let cur = new EmbedBuilder().setTitle('📋 Assigned Professions').setColor(0x00AEFF);
        let buf = '';
        const MAX = 3000; // stay well under Discord's 4096 char limit

        function pushPage() {
            cur.setDescription(buf.trim());
            embeds.push(cur);
            cur = new EmbedBuilder()
                .setTitle('📋 Assigned Professions (cont’d)')
                .setColor(0x00AEFF);
            buf = '';
        }

        for (const prof of professions) {
            const users = Object.entries(assignMap)
                .filter(([, ps]) => ps.includes(prof))
                .map(([uid]) => uid);

            const header = `### ${prof}\n`;
            if (buf.length + header.length > MAX) pushPage();
            buf += header;

            if (!users.length) {
                const entry = '*No one assigned*\n\n';
                if (buf.length + entry.length > MAX) pushPage(), buf += header;
                buf += entry;
                continue;
            }

            const toolName = professionToolMap[prof];
            for (const uid of users) {
                const m = guild.members.cache.get(uid);
                if (!m) continue;
                const role = m.roles.cache.find(r => r.name.startsWith(`${prof}`));
                const profText = role ? role.name : prof;
                let toolText = '';
                if (toolName && toolMap[uid]?.[toolName]) {
                    const { tier, rarity } = toolMap[uid][toolName];
                    toolText = ` – ${rarity} T${tier} ${toolName}`;
                }
                const line = `- <@${uid}> – ${profText}${toolText}\n`;
                if (buf.length + line.length > MAX) {
                    pushPage();
                    buf += header;
                }
                buf += line;
            }

            if (buf.length + 1 > MAX) pushPage(), buf += header; // space before next section
            buf += '\n';
        }

        if (buf.trim()) {
            cur.setDescription(buf.trim());
            embeds.push(cur);
        }

        const newIds = [];
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            if (messages[i]) {
                await messages[i].edit({ embeds: [embed] });
            } else {
                const m = await channel.send({ embeds: [embed] });
                messages.push(m);
            }
            newIds.push(messages[i].id);
        }

        for (let i = embeds.length; i < messages.length; i++) {
            try { await messages[i].delete(); } catch { }
        }

        await setMeta('board_message_ids', JSON.stringify(newIds));
        await setMeta('board_message_id', newIds[0]);
        log(`[Embed] assignment updated (${embeds.length} pages)`);
    } catch (err) {
        error('[Embed] assignment error', err);
    }
}

async function updateArmorEmbed(client, guild) {
    if (DEV) {
        log('[DEV] skipping armor embed');
        return;
    }

    try {
        const [armorMap, ringMap, heartMap] = await Promise.all([
            fetchAllArmor(),
            fetchAllRings(),
            fetchAllHearts()
        ]);
        const channel = await client.channels.fetch(ARMOR_CHANNEL_ID);
        let msg;
        const stored = await getMeta('armor_message_id');
        if (stored) {
            try { msg = await channel.messages.fetch(stored); }
            catch { }
        }
        if (!msg) {
            const init = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            msg = await channel.send({ embeds: [init] });
            await setMeta('armor_message_id', msg.id);
        }

        const allFields = [];
        const userIds = new Set([
            ...Object.keys(armorMap),
            ...Object.keys(ringMap),
            ...Object.keys(heartMap)
        ]);
        for (const uid of userIds) {
            const userArmor = armorMap[uid] || {};
            const cloth = Object.values(userArmor)
                .filter(a => a.material === 'Cloth')
                .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                .join('\n') || '*(none)*';

            const leather = Object.values(userArmor)
                .filter(a => a.material === 'Leather')
                .map(a => `• ${a.piece}: ${a.rarity} T${a.tier}`)
                .join('\n') || '*(none)*';

            const ring = ringMap[uid] ? `T${ringMap[uid].tier}` : '*(none)*';
            const heart = heartMap[uid] ? `T${heartMap[uid].tier}` : '*(none)*';

            allFields.push(
                { name: 'User', value: `<@${uid}>\nRing: ${ring}\nHeart: ${heart}`, inline: true },
                { name: '🧵 Cloth', value: cloth, inline: true },
                { name: '🥾 Leather', value: leather, inline: true }
            );
        }

        const pages = [];
        // Use groups of 24 fields (8 user rows) so a user's entry never spans pages
        for (let i = 0; i < allFields.length; i += 24) {
            const slice = allFields.slice(i, i + 24);
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*Cloth, Leather, Rings & Hearts*')
                .setColor(0x00AEFF)
                .setTimestamp()
                .addFields(slice);
            pages.push(embed);
        }

        if (pages.length === 0) {
            pages.push(
                new EmbedBuilder()
                    .setTitle('🛡️ Armor Board')
                    .setDescription('*No armor, rings or hearts set yet.*')
                    .setColor(0x00AEFF)
            );
        }

        await msg.edit({ embeds: pages });
        log(`[Armor] board updated across ${pages.length} embed(s)`);
    } catch (err) {
        error('[Armor] update error', err);
    }
}

module.exports = { updateAssignmentEmbed, updateArmorEmbed };
