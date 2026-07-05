// audit.js
// Sends a permanent record of important actions to your configured audit-log channel.

const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./config');
const { getMentionPrefix } = require('./mentions');

async function logAudit(client, title, description) {
  try {
    const config = getConfig();
    const channelId = config.channels.audit;
    if (!channelId) return; // Admin hasn't set an audit channel yet, so skip silently.

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📋 ${title}`)
      .setDescription(description)
      .setColor(0x5865f2)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// Sends a public heads-up message. If `body` is given ('GA', 'SC', or
// 'Both'), the message goes to that body's own notifications channel (so
// General Assembly and Security Council announcements don't have to share
// one channel) and gets the configured @everyone/@role mention prepended,
// if admins have turned that on. Omitting `body` keeps the old behavior:
// General Assembly's notifications channel, no mention.
async function notify(client, message, body) {
  try {
    const config = getConfig();
    const bodies = body === 'Both' ? ['GA', 'SC'] : [body || 'GA'];
    const channelIds = new Set();

    for (const b of bodies) {
      const channelId = b === 'SC' ? config.securityCouncil.channels.notifications : config.channels.notifications;
      if (channelId) channelIds.add(channelId);
    }

    const prefix = body ? getMentionPrefix(config, body) : '';

    for (const channelId of channelIds) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) await channel.send(`${prefix}${message}`);
    }
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

// Sends a direct message to a specific member - used to keep the proposer
// of a resolution personally updated as it moves through each stage.
// Silently does nothing if DMs are disabled in config, or if the member
// has their DMs closed (very common - we never want this to error loudly).
async function dmUser(client, userId, message) {
  try {
    const config = getConfig();
    if (!config.dmNotifications) return;
    if (!userId) return;

    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    await user.send(message).catch(() => {
      // Most likely their DMs are closed to non-friends - nothing we can do.
    });
  } catch (err) {
    console.error('Failed to DM user:', err);
  }
}

module.exports = { logAudit, notify, dmUser };
