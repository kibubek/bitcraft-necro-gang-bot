const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchAllAssignments, fetchAllTools, fetchAllArmor, fetchAllRings, fetchAllHearts } = require('../db');
const { professions } = require('../constants');
const { log } = require('../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show full profile info for a user')
        .addUserOption(o =>
            o.setName('target')
                .setDescription('User')
                .setRequired(true)
        ),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        log(`[Cmd] ${interaction.user.tag} → /info ${target.tag}`);
        const uid = target.id;
        const avatar = target.displayAvatarURL({ dynamic: true });

        const [assignMap, toolMap, armorMap, ringMap, heartMap] = await Promise.all([
            fetchAllAssignments(),
            fetchAllTools(),
            fetchAllArmor(),
            fetchAllRings(),
            fetchAllHearts()
        ]);

        const pros = assignMap[uid] || [];
        const focusedText = pros.length ? pros.join(', ') : 'None';

        const tmap = toolMap[uid] || {};
        const toolsList = Object.entries(tmap)
            .map(([tool, { tier, rarity }]) => `${rarity} T${tier} ${tool}`);

        const armors = Object.values(armorMap[uid] || {})
            .map(a => `${a.material} ${a.piece}: ${a.rarity} T${a.tier}`);

        const ringText = ringMap[uid] ? `T${ringMap[uid].tier}` : 'None';
        const heartText = heartMap[uid] ? `T${heartMap[uid].tier}` : 'None';

        const member = await interaction.guild.members.fetch(uid);
        const profLevels = professions
            .map(p => {
                const role = member.roles.cache.find(r => r.name.startsWith(`${p} `));
                if (!role) return null;
                const lvl = role.name.split(' ')[1];
                return `${p} ${lvl}`;
            })
            .filter(Boolean);

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Profile`)
            .setThumbnail(avatar)
            .addFields(
                { name: 'Focused Professions', value: focusedText, inline: false },
                { name: 'Profession Levels', value: profLevels.length ? profLevels.join(', ') : 'None', inline: false },
                { name: 'Tools', value: toolsList.length ? toolsList.join('\n') : 'None', inline: false },
                { name: 'Ring', value: ringText, inline: true },
                { name: 'Heart', value: heartText, inline: true },
                { name: 'Armor', value: armors.length ? armors.join('\n') : 'None', inline: false }
            )
            .setColor(0x00AEFF)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
