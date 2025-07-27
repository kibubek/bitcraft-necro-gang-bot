require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { professions } = require('../constants');
const { log, error } = require('../logger');

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    log(`✅ Logged in as ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await guild.roles.fetch();
        for (const role of guild.roles.cache.values()) {
            for (const prof of professions) {
                if (new RegExp(`^${prof} \\d+$`).test(role.name)) {
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
    log('Cleanup finished');
    process.exit(0);
});

client.login(TOKEN);
