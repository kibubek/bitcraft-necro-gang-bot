const { EmbedBuilder } = require('discord.js');
const { log, error } = require('./logger');
const { fetchAllAssignments, fetchAllTools, fetchAllArmor, fetchAllRings, getMeta, setMeta, DEV } = require('./db');
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
        let msg = null;
        const stored = await getMeta('board_message_id');
        if (stored) {
            try { msg = await channel.messages.fetch(stored); }
            catch { }
        }
        if (!msg) {
            const init = new EmbedBuilder()
                .setTitle('📋 Assigned Professions')
                .setDescription('*Initializing…*')
                .setColor(0x00AEFF);
            msg = await channel.send({ embeds: [init] });
            await setMeta('board_message_id', msg.id);
        }

        const sections = professions.map(prof => {
            const users = Object.entries(assignMap)
                .filter(([, ps]) => ps.includes(prof))
                .map(([uid]) => uid);
            if (!users.length) return `### ${prof}\n*No one assigned*`;

            const toolName = professionToolMap[prof];
            const lines = users.map(uid => {
                const m = guild.members.cache.get(uid);
                if (!m) return null;
                const role = m.roles.cache.find(r => r.name.startsWith(`${prof}`));
                const profText = role ? role.name : prof;
                let toolText = '';
                if (toolName && toolMap[uid]?.[toolName]) {
                    const { tier, rarity } = toolMap[uid][toolName];
                    toolText = ` – ${rarity} T${tier} ${toolName}`;
                }
                return `- <@${uid}> – ${profText}${toolText}`;
            }).filter(Boolean);

            return `### ${prof}\n${lines.join('\n')}`;
        });

        const embeds = [];
        let cur = new EmbedBuilder().setTitle('📋 Assigned Professions').setColor(0x00AEFF);
        let buf = '';
        const MAX = 3000;
        for (const sec of sections) {
            if (buf.length + sec.length > MAX) {
                cur.setDescription(buf.trim());
                embeds.push(cur);
                cur = new EmbedBuilder().setTitle('📋 Assigned Professions (cont’d)').setColor(0x00AEFF);
                buf = '';
            }
            buf += sec + '\n\n';
        }
        if (buf) {
            cur.setDescription(buf.trim());
            embeds.push(cur);
        }

        await msg.edit({ embeds });
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
        const [armorMap, ringMap] = await Promise.all([
            fetchAllArmor(),
            fetchAllRings()
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
            ...Object.keys(ringMap)
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

            allFields.push(
                { name: 'User', value: `<@${uid}>\nRing: ${ring}`, inline: true },
                { name: '🧵 Cloth', value: cloth, inline: true },
                { name: '🥾 Leather', value: leather, inline: true }
            );
        }

        const pages = [];
        for (let i = 0; i < allFields.length; i += 25) {
            const slice = allFields.slice(i, i + 25);
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Armor Board')
                .setDescription('*Cloth, Leather & Ring*')
                .setColor(0x00AEFF)
                .setTimestamp()
                .addFields(slice);
            pages.push(embed);
        }

        if (pages.length === 0) {
            pages.push(
                new EmbedBuilder()
                    .setTitle('🛡️ Armor Board')
                    .setDescription('*No armor or rings set yet.*')
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
