// /review command
// Approves, rejects, or sends back a resolution for revision after it has
// enough sponsors. WHO can do this depends on the resolution's body:
// General Assembly resolutions are reviewed by the configured GA reviewer
// role(s) (e.g. GA President), Security Council resolutions by the
// configured SC reviewer role(s) (e.g. UNSC Chair). Admins can always
// review anything.

const { SlashCommandBuilder } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isReviewer } = require('../lib/permissions');
const { findResolution, upsertResolution } = require('../lib/resolutions');
const { resolutionEmbed } = require('../lib/embeds');
const { logAudit, notify, dmUser } = require('../lib/audit');
const { getDebateInfo } = require('../lib/voting');

module.exports = {
  category: 'Legislation',
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Approve, reject, or return a resolution for revision')
    .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    .addStringOption((o) =>
      o
        .setName('action')
        .setDescription('What to do with this resolution')
        .setRequired(true)
        .addChoices(
          { name: 'Approve (move to Debate)', value: 'approve' },
          { name: 'Reject', value: 'reject' },
          { name: 'Return for Revision', value: 'revise' }
        )
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for reject/revise)').setRequired(false)),

  async execute(interaction) {
    const config = getConfig();

    const number = interaction.options.getString('number');
    const action = interaction.options.getString('action');
    const reason = interaction.options.getString('reason') || 'No reason given.';

    const resolution = findResolution(number);
    if (!resolution) {
      return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
    }

    if (!isReviewer(interaction.member, config, resolution.body)) {
      const bodyLabel = resolution.body === 'SC' ? 'Security Council' : resolution.body === 'Both' ? 'General Assembly or Security Council' : 'General Assembly';
      return interaction.reply({ content: `❌ You do not have permission to review this resolution. It requires a ${bodyLabel} reviewer role.`, ephemeral: true });
    }

    if (resolution.status !== 'Under Administrative Review') {
      return interaction.reply({ content: `❌ This resolution is not awaiting review (status: ${resolution.status}).`, ephemeral: true });
    }

    let debateInfo = null;
    if (action === 'approve') {
      debateInfo = getDebateInfo(resolution, config);
      resolution.status = 'Debate';
      resolution.debate = { startedAt: Date.now(), endsAt: Date.now() + debateInfo.durationMinutes * 60000, closed: false };
    } else if (action === 'reject') {
      resolution.status = 'Withdrawn';
      resolution.reviewNote = reason;
    } else if (action === 'revise') {
      resolution.status = 'Returned for Revision';
      resolution.reviewNote = reason;
    }

    upsertResolution(resolution);

    // Reply immediately so we never risk missing Discord's 3-second window;
    // the slower follow-up actions happen right after.
    await interaction.reply({ content: `✅ Resolution **${resolution.number}** updated: ${resolution.status}.`, embeds: [resolutionEmbed(resolution)], ephemeral: true });

    logAudit(interaction.client, `Review: ${action}`, `**${resolution.number}** — ${resolution.title}\nBy: ${interaction.user.tag}\nReason: ${reason}`).catch((err) => console.error(err));

    if (action === 'approve') {
      dmUser(interaction.client, resolution.submittedBy, `✅ Your resolution **${resolution.number}** — ${resolution.title} has been approved and is now in Debate. Debate closes <t:${Math.floor(resolution.debate.endsAt / 1000)}:f>.`);
    } else if (action === 'reject') {
      dmUser(interaction.client, resolution.submittedBy, `❌ Your resolution **${resolution.number}** — ${resolution.title} was rejected. Reason: ${reason}`);
    } else if (action === 'revise') {
      dmUser(interaction.client, resolution.submittedBy, `🔁 Your resolution **${resolution.number}** — ${resolution.title} was returned for revision. Reason: ${reason}`);
    }

    if (action === 'approve' && debateInfo) {
      for (const channelId of debateInfo.channelIds) {
        interaction.client.channels
          .fetch(channelId)
          .then((channel) =>
            channel &&
            channel.send({
              content: `📣 Debate is now open for **${resolution.number}**. Debate closes <t:${Math.floor(resolution.debate.endsAt / 1000)}:R>.`,
              embeds: [resolutionEmbed(resolution)],
            })
          )
          .catch((err) => console.error('Failed to post to debate channel:', err));
      }
      notify(interaction.client, `📣 **${resolution.number}** has entered debate.`).catch((err) => console.error(err));
    }
  },
};
