require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { professions, levels } = require('../constants');
const { log, error } = require('../logger');

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await guild.roles.fetch();
        for (const role of guild.roles.cache.values()) {
            for (const prof of professions) {
                for (const lvl of levels) {
                    if (role.name === `${prof} ${lvl}`) {
                        try {
                            await role.delete('Remove level-based profession role');
                            log(`[Cleanup] Deleted role ${role.name} in ${guild.name}`);
                        } catch (err) {
                            error('[Cleanup] Failed to delete role', err);
                        }
                    }
                }
            }
        }
    }
    log('Cleanup finished');
    process.exit(0);
});

client.login(TOKEN);
