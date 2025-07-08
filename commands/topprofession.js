const { SlashCommandBuilder } = require('discord.js');
const { professions } = require('../constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topprofession')
        .setDescription('Show top member of a profession')
        .addStringOption(o =>
            o.setName('profession')
                .setDescription('Profession')
                .setRequired(true)
                .addChoices(...professions.map(p => ({ name: p, value: p })))
        ),
    async execute(interaction) {
        const prof = interaction.options.getString('profession');

        await interaction.guild.members.fetch();
        const candidates = interaction.guild.members.cache
            .map(member => {
                const role = member.roles.cache.find(r => r.name.startsWith(`${prof} `));
                if (!role) return null;
                const lvl = parseInt(role.name.split(' ')[1], 10);
                return { member, level: lvl };
            })
            .filter(x => x !== null)
            .sort((a, b) => b.level - a.level)
            .slice(0, 5);

        if (candidates.length === 0) {
            await interaction.reply({
                content: `❌ No one has any **${prof}** role yet.`,
                ephemeral: true
            });
            return;
        }

        const list = candidates
            .map((c, i) => `**${i + 1}.** <@${c.member.id}> — Level ${c.level}`)
            .join('\n');
        await interaction.reply({
            content: `🏆 **Top 5 ${prof}:**\n${list}`,
            ephemeral: true
        });
    }
};
