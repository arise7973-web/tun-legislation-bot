// amendments.js
// Members can propose amendments to a resolution's text while it's in
// Debate. Each amendment gets its own optional debate window and its own
// vote (same eligible voters as whichever body - GA or SC - is voting on
// the resolution itself). If an amendment is Approved, the change is
// applied automatically to the resolution's working text (its `fields`)
// BEFORE the main vote opens - matching real legislative amendment
// procedure. The full amendment history stays on the resolution forever,
// so it's archived right along with it.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getConfig } = require('./config');
const { upsertResolution } = require('./resolutions');
const { isEligibleVoter, isSCMember } = require('./permissions');
const { amendmentEmbed } = require('./embeds');
const { logAudit, notify, dmUser } = require('./audit');

const AMENDMENT_TYPE_LABELS = {
  add: 'Add Text',
  remove: 'Remove Text',
  replace: 'Replace Text',
  format: 'Correct Formatting',
  reference: 'Correct References',
};

// What the two free-text modal inputs should be labeled/required as, per
// amendment type - decided once, at modal-build time, so Discord enforces
// the right fields are filled in without us needing to validate afterward.
const AMENDMENT_TYPE_MODAL_CONFIG = {
  add: { originalLabel: 'Context (optional)', originalRequired: false, newLabel: 'New Text to Add', newRequired: true },
  remove: { originalLabel: 'Exact Text to Remove', originalRequired: true, newLabel: 'Replacement Text (optional)', newRequired: false },
  replace: { originalLabel: 'Exact Original Text', originalRequired: true, newLabel: 'Replacement Text', newRequired: true },
  format: { originalLabel: 'Text Being Corrected (optional)', originalRequired: false, newLabel: 'Corrected Text', newRequired: true },
  reference: { originalLabel: 'Text Being Corrected (optional)', originalRequired: false, newLabel: 'Corrected Text', newRequired: true },
};

function getAmendmentVoterRole(resolution, config) {
  return resolution.body === 'SC' ? config.securityCouncil.roles.member : config.roles.gaVoter;
}

function isAmendmentEligibleVoter(member, resolution, config) {
  return resolution.body === 'SC' ? isSCMember(member, config) : isEligibleVoter(member, config);
}

// True if this resolution has any amendment still in Debate or Voting.
// Used to hold off opening the resolution's main vote until every
// amendment has been resolved, so the "working copy" is finished first.
function hasOpenAmendments(resolution) {
  return (resolution.amendments || []).some((a) => a.status === 'Debate' || a.status === 'Voting');
}

function buildAmendmentButtons(resolutionNumber, amendmentId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`amendvote_${amendmentId}_yes_${resolutionNumber}`).setLabel('Yes').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`amendvote_${amendmentId}_no_${resolutionNumber}`).setLabel('No').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`amendvote_${amendmentId}_abstain_${resolutionNumber}`).setLabel('Abstain').setEmoji('⚪').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

function createAmendment(resolution, { type, targetField, originalText, newText, sponsorId }) {
  const config = getConfig();
  resolution.amendments = resolution.amendments || [];

  const id = `A${resolution.amendments.length + 1}`;
  const amendment = {
    id,
    type,
    targetField,
    originalText: originalText || null,
    newText: newText || null,
    sponsor: sponsorId,
    status: 'Debate',
    createdAt: Date.now(),
    debate: { startedAt: Date.now(), endsAt: Date.now() + config.amendments.debateDurationMinutes * 60000, closed: false },
    vote: null,
  };

  resolution.amendments.push(amendment);
  upsertResolution(resolution);
  return amendment;
}

async function refreshAmendmentMessage(client, resolution, amendment) {
  if (!amendment.vote || !amendment.vote.channelId || !amendment.vote.messageId) return;
  const channel = await client.channels.fetch(amendment.vote.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(amendment.vote.messageId).catch(() => null);
  if (!message) return;

  const embed = amendmentEmbed(resolution, amendment);
  const row = buildAmendmentButtons(resolution.number, amendment.id, amendment.vote.closed);
  await message.edit({ embeds: [embed], components: [row] }).catch((err) => console.error('Failed to refresh amendment message:', err));
}

async function openAmendmentVote(client, resolution, amendment) {
  const config = getConfig();
  // Imported lazily to avoid a circular require (voting.js doesn't need
  // amendments.js, but amendments.js needs a couple of its helpers).
  const { getEligibleCount, getDebateInfo } = require('./voting');

  const roleId = getAmendmentVoterRole(resolution, config);
  const eligibleCount = await getEligibleCount(client, roleId);

  amendment.status = 'Voting';
  amendment.vote = {
    ballots: {},
    eligibleCount,
    quorumPercent: config.amendments.quorumPercent,
    thresholdPercent: config.amendments.majorityPercent,
    startedAt: Date.now(),
    endsAt: Date.now() + config.amendments.votingDurationMinutes * 60000,
    closed: false,
    result: null,
    messageId: null,
    channelId: null,
  };

  const debateInfo = getDebateInfo(resolution, config);
  const channelId = debateInfo.channelIds[0]; // Amendments happen during debate, so post there.
  if (channelId) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const embed = amendmentEmbed(resolution, amendment);
      const row = buildAmendmentButtons(resolution.number, amendment.id, false);
      const message = await channel.send({ embeds: [embed], components: [row] });
      amendment.vote.messageId = message.id;
      amendment.vote.channelId = channel.id;
    }
  }

  upsertResolution(resolution);
  await logAudit(client, 'Amendment Voting Opened', `**${resolution.number}** ${amendment.id} (${AMENDMENT_TYPE_LABELS[amendment.type]}) — voting has opened.`);
  return amendment;
}

// Applies an Approved amendment to the resolution's working text. Returns
// true if applied cleanly, false if it had to fall back to appending
// because the original text wasn't found verbatim (still applied, just
// flagged so the change is easy to spot).
function applyAmendment(resolution, amendment) {
  const field = amendment.targetField;
  if (!(field in resolution.fields)) return false;

  const current = resolution.fields[field] || '';

  if (amendment.type === 'add') {
    resolution.fields[field] = amendment.newText ? `${current}\n${amendment.newText}`.trim() : current;
    return true;
  }

  if (amendment.type === 'remove') {
    if (amendment.originalText && current.includes(amendment.originalText)) {
      resolution.fields[field] = current.split(amendment.originalText).join('').trim();
      return true;
    }
    amendment.appliedNote = 'Text to remove was not found verbatim - no change made.';
    return false;
  }

  // replace / format / reference all follow the same pattern.
  if (amendment.originalText && current.includes(amendment.originalText)) {
    resolution.fields[field] = current.split(amendment.originalText).join(amendment.newText || '');
    return true;
  }
  if (amendment.newText) {
    resolution.fields[field] = `${current}\n${amendment.newText}`.trim();
    amendment.appliedNote = 'Original text was not found verbatim - new text was appended instead.';
    return true;
  }
  return false;
}

async function closeAmendmentVote(client, resolution, amendment) {
  const ballots = Object.values(amendment.vote.ballots || {});
  const votesCast = ballots.length;
  const participation = amendment.vote.eligibleCount > 0 ? (votesCast / amendment.vote.eligibleCount) * 100 : 0;
  const weightedYes = ballots.filter((v) => v.choice === 'yes').reduce((s, v) => s + v.weight, 0);
  const weightedNo = ballots.filter((v) => v.choice === 'no').reduce((s, v) => s + v.weight, 0);
  const decisive = weightedYes + weightedNo;
  const yesShare = decisive > 0 ? (weightedYes / decisive) * 100 : 0;

  let result;
  if (participation < amendment.vote.quorumPercent) result = 'Failed';
  else if (yesShare >= amendment.vote.thresholdPercent) result = 'Approved';
  else result = 'Failed';

  amendment.vote.closed = true;
  amendment.vote.tally = { votesCast, participation, weightedYes, weightedNo };
  amendment.status = result;

  if (result === 'Approved') {
    applyAmendment(resolution, amendment);
  }

  upsertResolution(resolution);
  await refreshAmendmentMessage(client, resolution, amendment);

  await logAudit(client, 'Amendment Vote Closed', `**${resolution.number}** ${amendment.id} — Result: ${result}`);
  await notify(client, `📝 Amendment ${amendment.id} on **${resolution.number}** has closed. Result: **${result}**.`);

  dmUser(client, amendment.sponsor, `📝 Your amendment ${amendment.id} to **${resolution.number}** has closed. Result: **${result}**.`);
  if (resolution.submittedBy !== amendment.sponsor) {
    dmUser(client, resolution.submittedBy, `📝 An amendment (${amendment.id}) to your resolution **${resolution.number}** has closed. Result: **${result}**.`);
  }

  return amendment;
}

module.exports = {
  AMENDMENT_TYPE_LABELS,
  AMENDMENT_TYPE_MODAL_CONFIG,
  getAmendmentVoterRole,
  isAmendmentEligibleVoter,
  hasOpenAmendments,
  buildAmendmentButtons,
  createAmendment,
  openAmendmentVote,
  closeAmendmentVote,
  refreshAmendmentMessage,
};
