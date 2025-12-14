require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Collection, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Configuration from .env
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    MAIN_SERVER_ID: process.env.MAIN_SERVER_ID,
    SYNC_SERVERS: process.env.SYNC_SERVERS ? process.env.SYNC_SERVERS.split(',') : [],
    MODLOG_CHANNEL_ID: process.env.MODLOG_CHANNEL_ID,
    MODERATOR_ROLE_ID: process.env.MODERATOR_ROLE_ID
};

// Store for mute timeouts
const muteTimeouts = new Collection();

// Slash Commands (with spaces in names)
const commands = [
    {
        name: 'global ban',
        description: 'Ban a user from all synced servers',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to ban globally',
                required: true
            },
            {
                name: 'reason',
                type: 3, // STRING
                description: 'Reason for the global ban',
                required: false
            }
        ]
    },
    {
        name: 'global mute',
        description: 'Mute a user in all synced servers',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to mute globally',
                required: true
            },
            {
                name: 'duration',
                type: 3, // STRING
                description: 'Duration (e.g., 1h, 30m, 1d)',
                required: true
            },
            {
                name: 'reason',
                type: 3, // STRING
                description: 'Reason for the global mute',
                required: false
            }
        ]
    },
    {
        name: 'global unmute',
        description: 'Unmute a user in all synced servers',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to unmute globally',
                required: true
            }
        ]
    },
    {
        name: 'global unban',
        description: 'Unban a user from all synced servers',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to unban globally',
                required: true
            }
        ]
    },
    {
        name: 'sync status',
        description: 'Check sync status across all servers'
    }
];

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

async function registerCommands() {
    try {
        console.log('🔧 Registering slash commands...');
        
        // Register commands globally
        await rest.put(
            Routes.applicationCommands(CONFIG.CLIENT_ID),
            { body: commands }
        );
        
        console.log('✅ Slash commands registered globally!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    console.log(`🔄 Monitoring ${CONFIG.SYNC_SERVERS.length} servers for synchronization`);
    console.log(`👮 Moderator Role ID: ${CONFIG.MODERATOR_ROLE_ID}`);
    
    // Set bot activity
    client.user.setActivity({
        name: `${CONFIG.SYNC_SERVERS.length} servers`,
        type: ActivityType.Watching
    });
    
    await registerCommands();
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    // Check if command is used in a synced server
    if (!CONFIG.SYNC_SERVERS.includes(interaction.guild.id) && interaction.guild.id !== CONFIG.MAIN_SERVER_ID) {
        return interaction.reply({
            content: '❌ This server is not configured for global moderation.',
            ephemeral: true
        });
    }

    // Check if user has moderator role
    if (!await hasModeratorRole(interaction.member)) {
        return interaction.reply({
            content: '❌ You need the moderator role to use this command.',
            ephemeral: true
        });
    }

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'global ban':
                await handleGlobalBan(interaction, options);
                break;
            case 'global mute':
                await handleGlobalMute(interaction, options);
                break;
            case 'global unmute':
                await handleGlobalUnmute(interaction, options);
                break;
            case 'global unban':
                await handleGlobalUnban(interaction, options);
                break;
            case 'sync status':
                await handleSyncStatus(interaction);
                break;
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);
        await interaction.reply({
            content: '❌ An error occurred while processing the command.',
            ephemeral: true
        });
    }
});

// Check if user has moderator role
async function hasModeratorRole(member) {
    // If no moderator role is set, fall back to permission check
    if (!CONFIG.MODERATOR_ROLE_ID) {
        return member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
    }
    
    return member.roles.cache.has(CONFIG.MODERATOR_ROLE_ID);
}

// Global Ban Handler
async function handleGlobalBan(interaction, options) {
    await interaction.deferReply();
    
    const targetUser = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';
    const moderator = interaction.user;

    // Validation checks
    if (targetUser.id === client.user.id) {
        return interaction.editReply('❌ I cannot ban myself.');
    }

    if (targetUser.id === moderator.id) {
        return interaction.editReply('❌ You cannot ban yourself.');
    }

    // Check if target has moderator role (if they're in the current server)
    try {
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && await hasModeratorRole(targetMember)) {
            return interaction.editReply('❌ You cannot ban another moderator.');
        }
    } catch (error) {
        // User not in current server, continue
    }

    const results = [];
    const allServers = [CONFIG.MAIN_SERVER_ID, ...CONFIG.SYNC_SERVERS];

    for (const serverId of allServers) {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            results.push({ server: `Unknown (${serverId})`, status: 'bot_not_in_server' });
            continue;
        }

        try {
            // Check bot permissions
            const botMember = await guild.members.fetch(client.user.id);
            if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                results.push({ server: guild.name, status: 'no_permission' });
                continue;
            }

            // Check if user is in server and has moderator role
            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            
            if (member) {
                // Check if target is a moderator in this server
                if (await hasModeratorRole(member)) {
                    results.push({ server: guild.name, status: 'target_is_moderator' });
                    continue;
                }

                await guild.members.ban(targetUser.id, { 
                    reason: `Global ban by ${moderator.tag} (${moderator.id}): ${reason}` 
                });
                results.push({ server: guild.name, status: 'banned' });
            } else {
                results.push({ server: guild.name, status: 'not_in_server' });
            }

        } catch (error) {
            results.push({ server: guild.name, status: 'error', error: error.message });
        }
    }

    // Send results
    const embed = createActionEmbed('BAN', targetUser, moderator, reason, results);
    await interaction.editReply({ embeds: [embed] });

    // Log to modlog
    await logToModlog(embed);
}

// Global Mute Handler
async function handleGlobalMute(interaction, options) {
    await interaction.deferReply();
    
    const targetUser = options.getUser('user');
    const duration = options.getString('duration');
    const reason = options.getString('reason') || 'No reason provided';
    const moderator = interaction.user;

    // Parse duration
    const durationMs = parseDuration(duration);
    if (!durationMs) {
        return interaction.editReply('❌ Invalid duration format. Use: 1h, 30m, 1d, etc.');
    }

    // Validation checks
    if (targetUser.id === client.user.id) {
        return interaction.editReply('❌ I cannot mute myself.');
    }

    if (targetUser.id === moderator.id) {
        return interaction.editReply('❌ You cannot mute yourself.');
    }

    // Check if target has moderator role (if they're in the current server)
    try {
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && await hasModeratorRole(targetMember)) {
            return interaction.editReply('❌ You cannot mute another moderator.');
        }
    } catch (error) {
        // User not in current server, continue
    }

    const results = [];
    const allServers = [CONFIG.MAIN_SERVER_ID, ...CONFIG.SYNC_SERVERS];

    for (const serverId of allServers) {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            results.push({ server: `Unknown (${serverId})`, status: 'bot_not_in_server' });
            continue;
        }

        try {
            // Check bot permissions
            const botMember = await guild.members.fetch(client.user.id);
            if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                results.push({ server: guild.name, status: 'no_permission' });
                continue;
            }

            // Check if user is in server and has moderator role
            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            
            if (member) {
                // Check if target is a moderator in this server
                if (await hasModeratorRole(member)) {
                    results.push({ server: guild.name, status: 'target_is_moderator' });
                    continue;
                }

                await member.timeout(durationMs, `Global mute by ${moderator.tag} (${moderator.id}): ${reason}`);
                results.push({ server: guild.name, status: 'muted' });

                // Store timeout for auto-unmute
                const timeoutKey = `${guild.id}-${targetUser.id}`;
                const timeout = setTimeout(async () => {
                    try {
                        await member.timeout(null);
                        muteTimeouts.delete(timeoutKey);
                        
                        // Log auto-unmute
                        const unmuteEmbed = createActionEmbed('AUTO UNMUTE', targetUser, client.user, 'Mute duration expired', [
                            { server: guild.name, status: 'unmuted' }
                        ]);
                        await logToModlog(unmuteEmbed);
                    } catch (error) {
                        console.error(`Auto-unmute failed in ${guild.name}:`, error);
                    }
                }, durationMs);

                muteTimeouts.set(timeoutKey, timeout);
            } else {
                results.push({ server: guild.name, status: 'not_in_server' });
            }

        } catch (error) {
            results.push({ server: guild.name, status: 'error', error: error.message });
        }
    }

    // Send results
    const embed = createActionEmbed('MUTE', targetUser, moderator, reason, results, duration);
    await interaction.editReply({ embeds: [embed] });

    // Log to modlog
    await logToModlog(embed);
}

// Global Unmute Handler
async function handleGlobalUnmute(interaction, options) {
    await interaction.deferReply();
    
    const targetUser = options.getUser('user');
    const moderator = interaction.user;

    const results = [];
    const allServers = [CONFIG.MAIN_SERVER_ID, ...CONFIG.SYNC_SERVERS];

    for (const serverId of allServers) {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            results.push({ server: `Unknown (${serverId})`, status: 'bot_not_in_server' });
            continue;
        }

        try {
            // Check bot permissions
            const botMember = await guild.members.fetch(client.user.id);
            if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                results.push({ server: guild.name, status: 'no_permission' });
                continue;
            }

            // Check if user is in server
            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            
            if (member && member.isCommunicationDisabled()) {
                await member.timeout(null, `Global unmute by ${moderator.tag} (${moderator.id})`);
                results.push({ server: guild.name, status: 'unmuted' });

                // Clear any existing timeout
                const timeoutKey = `${guild.id}-${targetUser.id}`;
                const existingTimeout = muteTimeouts.get(timeoutKey);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    muteTimeouts.delete(timeoutKey);
                }
            } else if (member) {
                results.push({ server: guild.name, status: 'not_muted' });
            } else {
                results.push({ server: guild.name, status: 'not_in_server' });
            }

        } catch (error) {
            results.push({ server: guild.name, status: 'error', error: error.message });
        }
    }

    // Send results
    const embed = createActionEmbed('UNMUTE', targetUser, moderator, 'Manual unmute', results);
    await interaction.editReply({ embeds: [embed] });

    // Log to modlog
    await logToModlog(embed);
}

// Global Unban Handler
async function handleGlobalUnban(interaction, options) {
    await interaction.deferReply();
    
    const targetUser = options.getUser('user');
    const moderator = interaction.user;

    const results = [];
    const allServers = [CONFIG.MAIN_SERVER_ID, ...CONFIG.SYNC_SERVERS];

    for (const serverId of allServers) {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            results.push({ server: `Unknown (${serverId})`, status: 'bot_not_in_server' });
            continue;
        }

        try {
            // Check bot permissions
            const botMember = await guild.members.fetch(client.user.id);
            if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                results.push({ server: guild.name, status: 'no_permission' });
                continue;
            }

            // Check if user is banned
            const banList = await guild.bans.fetch();
            const isBanned = banList.has(targetUser.id);
            
            if (isBanned) {
                await guild.bans.remove(targetUser.id, `Global unban by ${moderator.tag} (${moderator.id})`);
                results.push({ server: guild.name, status: 'unbanned' });
            } else {
                results.push({ server: guild.name, status: 'not_banned' });
            }

        } catch (error) {
            results.push({ server: guild.name, status: 'error', error: error.message });
        }
    }

    // Send results
    const embed = createActionEmbed('UNBAN', targetUser, moderator, 'Manual unban', results);
    await interaction.editReply({ embeds: [embed] });

    // Log to modlog
    await logToModlog(embed);
}

// Sync Status Handler
async function handleSyncStatus(interaction) {
    await interaction.deferReply();

    const statusEmbed = new EmbedBuilder()
        .setTitle('🔄 Global Sync Status')
        .setColor(0x00AE86)
        .setTimestamp();

    const allServers = [CONFIG.MAIN_SERVER_ID, ...CONFIG.SYNC_SERVERS];
    const statusFields = [];

    for (const serverId of allServers) {
        const guild = client.guilds.cache.get(serverId);
        
        if (guild) {
            const botMember = await guild.members.fetch(client.user.id);
            const hasBanPerms = botMember.permissions.has(PermissionsBitField.Flags.BanMembers);
            const hasMutePerms = botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers);
            
            statusFields.push({
                name: guild.name,
                value: `✅ Connected\n🔨 Ban: ${hasBanPerms ? '✅' : '❌'}\n🔇 Mute: ${hasMutePerms ? '✅' : '❌'}`,
                inline: true
            });
        } else {
            statusFields.push({
                name: `Unknown (${serverId})`,
                value: '❌ Bot not in server',
                inline: true
            });
        }
    }

    statusEmbed.addFields(statusFields);
    await interaction.editReply({ embeds: [statusEmbed] });
}

// Helper Functions
function createActionEmbed(action, targetUser, moderator, reason, results, duration = null) {
    const color = {
        'BAN': 0xFF0000,
        'MUTE': 0xFFA500,
        'UNMUTE': 0x00FF00,
        'UNBAN': 0x00FF00,
        'AUTO UNMUTE': 0x00FF00
    }[action] || 0x000000;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🔨 ${action}`)
        .setDescription(`**Target:** ${targetUser.tag} (${targetUser.id})`)
        .addFields(
            { name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
            { name: 'Reason', value: reason, inline: true }
        )
        .setTimestamp();

    if (duration) {
        embed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    // Add results
    const resultText = results.map(result => {
        const statusIcons = {
            'banned': '✅ Banned',
            'muted': '🔇 Muted', 
            'unmuted': '✅ Unmuted',
            'unbanned': '✅ Unbanned',
            'not_in_server': 'ℹ️ Not in server',
            'not_banned': 'ℹ️ Not banned',
            'not_muted': 'ℹ️ Not muted',
            'no_permission': '❌ No permission',
            'bot_not_in_server': '❌ Bot not in server',
            'target_is_moderator': '🚫 Target is moderator',
            'error': '⚠️ Error'
        };
        return `${statusIcons[result.status] || '❓ Unknown'} - ${result.server}${result.error ? `\n   ${result.error}` : ''}`;
    }).join('\n');

    embed.addFields({ name: 'Results', value: resultText || 'No results' });

    return embed;
}

function parseDuration(duration) {
    const units = {
        's': 1000,
        'm': 1000 * 60,
        'h': 1000 * 60 * 60,
        'd': 1000 * 60 * 60 * 24
    };

    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2];

    return amount * units[unit];
}

async function logToModlog(embed) {
    if (!CONFIG.MODLOG_CHANNEL_ID) return;

    try {
        const modlogChannel = client.channels.cache.get(CONFIG.MODLOG_CHANNEL_ID);
        if (modlogChannel) {
            await modlogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error sending to modlog:', error);
    }
}

client.login(CONFIG.TOKEN);
