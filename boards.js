const { EmbedBuilder } = require('discord.js');
const { log, error } = require('./logger');
const { getMeta, setMeta, DEV } = require('./db');
const { fetchAllAssignments, getMeta, setMeta, DEV } = require('./db');
const { professions } = require('./constants');

const ASSIGNMENT_CHANNEL_ID = process.env.ASSIGNMENT_CHANNEL_ID;

async function updateAssignmentEmbed(client, guild) {
    if (DEV) {
        log('[DEV] skip assignment embed');
        return;
    }

    try {
        const assignMap = {};
        for (const member of guild.members.cache.values()) {
            for (const prof of professions) {
                if (member.roles.cache.some(r => r.name === prof)) {
                    assignMap[member.id] = assignMap[member.id] || [];
                    assignMap[member.id].push(prof);
                }
            }
        }

        const assignMap = await fetchAllAssignments();
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

            for (const uid of users) {
                const m = guild.members.cache.get(uid);
                if (!m) continue;
                const role = m.roles.cache.find(r => r.name === prof);
                const profText = role ? role.name : prof;
                const line = `- <@${uid}> – ${profText}\n`;
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

        await msg.edit({ embeds });
        log(`[Embed] assignment updated (${embeds.length} pages)`);
    } catch (err) {
        error('[Embed] assignment error', err);
    }
}

module.exports = { updateAssignmentEmbed };
