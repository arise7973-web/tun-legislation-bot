// voting.js
// Shared logic for opening/closing legislative votes.
//
// A resolution can require a vote in the General Assembly ("GA"), the
// Security Council ("SC"), or Both. Each body is called a "track" - each
// track has its own eligible voters, quorum, majority rule, channel, and
// voting card, and they run independently and simultaneously.
//
// The Security Council track can also carry a veto: Permanent Members can
// click a Veto button, which either ends that vote immediately or simply
// overturns a "Passed" result once voting closes, depending on config.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getConfig } = require('./config');
const { upsertResolution, findTemplate } = require('./resolutions');
const { trackEmbed, resolutionEmbed } = require('./embeds');
const { logAudit, notify, dmUser } = require('./audit');

function bodiesFor(resolution) {
  return resolution.body === 'Both' ? ['GA', 'SC'] : [resolution.body || 'GA'];
}

// Everything about HOW a given body votes: which role counts, which channel
// it posts to, and what quorum/majority rule applies.
function getTrackSettings(body, config, template) {
  if (body === 'SC') {
    const sc = config.securityCouncil;
    return {
      label: 'Security Council',
      roleId: sc.roles.member,
      channelId: sc.channels.voting,
      quorumPercent: sc.quorumPercent,
      thresholdPercent: template.requiresSupermajority ? sc.supermajorityPercent : sc.majorityPercent,
      requiresSupermajority: !!template.requiresSupermajority,
      votingDurationMinutes: sc.votingDurationMinutes,
      vetoEnabled: !!(sc.veto.enabled && template.vetoable !== false),
    };
  }
  if (body === 'OVERRIDE') {
    const sc = config.securityCouncil;
    return {
      label: 'Veto Override Vote (General Assembly)',
      roleId: config.roles.gaVoter,
      channelId: config.channels.voting,
      quorumPercent: config.quorumPercent,
      thresholdPercent: sc.veto.overrideThresholdPercent,
      requiresSupermajority: true,
      votingDurationMinutes: sc.veto.overrideVotingDurationMinutes,
      vetoEnabled: false,
    };
  }
  // Default: GA
  return {
    label: 'General Assembly',
    roleId: config.roles.gaVoter,
    channelId: config.channels.voting,
    quorumPercent: config.quorumPercent,
    thresholdPercent: template.requiresSupermajority ? config.supermajorityPercent : config.majorityPercent,
    requiresSupermajority: !!template.requiresSupermajority,
    votingDurationMinutes: config.votingDurationMinutes,
    vetoEnabled: false,
  };
}

// Used right when a resolution is submitted - decides which review
// channel(s) to post it to, based on which body(s) will vote on it.
function getReviewChannelIds(resolution, config) {
  const bodies = bodiesFor(resolution);
  const channelIds = new Set();
  if (bodies.includes('GA') && config.channels.review) channelIds.add(config.channels.review);
  if (bodies.includes('SC') && config.securityCouncil.channels.review) channelIds.add(config.securityCouncil.channels.review);
  return [...channelIds];
}

// Used when opening debate (see review.js) - decides which debate channel(s)
// to announce in and how long debate should run for, based on which body(s)
// will vote on this resolution.
function getDebateInfo(resolution, config) {
  const bodies = bodiesFor(resolution);
  const channelIds = new Set();
  let durationMinutes = config.debateDurationMinutes;

  if (bodies.includes('GA') && config.channels.debate) channelIds.add(config.channels.debate);
  if (bodies.includes('SC') && config.securityCouncil.channels.debate) channelIds.add(config.securityCouncil.channels.debate);

  if (bodies.length > 1) {
    durationMinutes = Math.max(config.debateDurationMinutes, config.securityCouncil.debateDurationMinutes);
  } else if (bodies[0] === 'SC') {
    durationMinutes = config.securityCouncil.debateDurationMinutes;
  }

  return { channelIds: [...channelIds], durationMinutes };
}

function buildVoteButtons(number, body, disabled = false, includeVeto = false) {
  const buttons = [
    new ButtonBuilder().setCustomId(`vote_${body}_yes_${number}`).setLabel('Yes').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`vote_${body}_no_${number}`).setLabel('No').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`vote_${body}_abstain_${number}`).setLabel('Abstain').setEmoji('⚪').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  ];
  if (includeVeto) {
    buttons.push(
      new ButtonBuilder().setCustomId(`vote_${body}_veto_${number}`).setLabel('Veto').setEmoji('🚫').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
  }
  return new ActionRowBuilder().addComponents(buttons);
}

// Fetching the FULL member list from Discord is a "heavy" gateway request
// (opcode 8) that Discord rate-limits. Re-fetching it every time a vote
// opens can trip that limit and, if not handled carefully, leave the bot
// hanging. We cache the result for a few minutes and fall back to whatever
// is already cached if a fresh fetch fails or is rate-limited.
let memberCacheTimestamp = 0;
const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getGuildMembers(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return null;

  const isFresh = Date.now() - memberCacheTimestamp < MEMBER_CACHE_TTL_MS;
  if (isFresh && guild.members.cache.size > 0) {
    return guild.members.cache;
  }

  try {
    const fetched = await guild.members.fetch();
    memberCacheTimestamp = Date.now();
    return fetched;
  } catch (err) {
    console.error('Member list fetch failed (likely rate-limited) - using cached member list instead:', err.message);
    return guild.members.cache; // Better an approximate count than a hang or crash.
  }
}

async function getEligibleCount(client, roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds : roleIds ? [roleIds] : [];
  if (ids.length === 0) return 0;
  const members = await getGuildMembers(client);
  if (!members) return 0;
  return members.filter((m) => ids.some((id) => m.roles.cache.has(id))).size;
}

async function refreshTrackMessage(client, resolution, body) {
  const track = resolution.tracks && resolution.tracks[body];
  if (!track || !track.channelId || !track.messageId) return;
  const channel = await client.channels.fetch(track.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(track.messageId).catch(() => null);
  if (!message) return;

  const embed = trackEmbed(resolution, body, track);
  const row = buildVoteButtons(resolution.number, body, track.closed, track.vetoEnabled);
  await message.edit({ embeds: [embed], components: [row] }).catch((err) => console.error('Failed to refresh vote message:', err));
}

async function openTrackVote(client, resolution, body) {
  const config = getConfig();
  const template = findTemplate(resolution.templateName) || {};
  const settings = getTrackSettings(body, config, template);
  const eligibleCount = await getEligibleCount(client, settings.roleId);

  const track = {
    label: settings.label,
    ballots: {},
    eligibleCount,
    quorumPercent: settings.quorumPercent,
    thresholdPercent: settings.thresholdPercent,
    requiresSupermajority: settings.requiresSupermajority,
    vetoEnabled: settings.vetoEnabled,
    startedAt: Date.now(),
    endsAt: Date.now() + settings.votingDurationMinutes * 60000,
    closed: false,
    result: null,
    vetoedBy: null,
    channelId: null,
    messageId: null,
  };

  if (settings.channelId) {
    const channel = await client.channels.fetch(settings.channelId).catch(() => null);
    if (channel) {
      const embed = trackEmbed(resolution, body, track);
      const row = buildVoteButtons(resolution.number, body, false, settings.vetoEnabled);
      const message = await channel.send({ embeds: [embed], components: [row] });
      track.messageId = message.id;
      track.channelId = channel.id;
    }
  }

  resolution.tracks = resolution.tracks || {};
  resolution.tracks[body] = track;
  return track;
}

async function openVoting(client, resolution) {
  const bodies = bodiesFor(resolution);
  resolution.status = 'Voting';

  for (const body of bodies) {
    await openTrackVote(client, resolution, body);
  }

  upsertResolution(resolution);
  await logAudit(client, 'Vote Opened', `**${resolution.number}** — ${resolution.title} (${bodies.join(' + ')})`);
  await notify(client, `🗳️ Voting is now open for **${resolution.number}** — ${resolution.title}`);

  for (const body of bodies) {
    const track = resolution.tracks[body];
    dmUser(
      client,
      resolution.submittedBy,
      `🗳️ Voting has opened for your resolution **${resolution.number}** — ${resolution.title} (${track.label}). It closes <t:${Math.floor(track.endsAt / 1000)}:f>.`
    );
  }

  return resolution;
}

function tallyTrack(track) {
  const ballots = Object.values(track.ballots || {});
  const votesCast = ballots.length;
  const participation = track.eligibleCount > 0 ? (votesCast / track.eligibleCount) * 100 : 0;
  const weightedYes = ballots.filter((v) => v.choice === 'yes').reduce((s, v) => s + v.weight, 0);
  const weightedNo = ballots.filter((v) => v.choice === 'no').reduce((s, v) => s + v.weight, 0);
  const weightedAbstain = ballots.filter((v) => v.choice === 'abstain').reduce((s, v) => s + v.weight, 0);
  const decisive = weightedYes + weightedNo;
  const yesShare = decisive > 0 ? (weightedYes / decisive) * 100 : 0;
  return { votesCast, participation, weightedYes, weightedNo, weightedAbstain, yesShare };
}

async function closeTrackVote(client, resolution, body) {
  const track = resolution.tracks[body];
  if (!track || track.closed) return;

  const tally = tallyTrack(track);
  let result;
  if (track.vetoedBy) {
    result = 'Vetoed';
  } else if (tally.participation < track.quorumPercent) {
    result = 'Failed';
  } else if (tally.yesShare >= track.thresholdPercent) {
    result = 'Passed';
  } else {
    result = 'Failed';
  }

  track.closed = true;
  track.result = result;
  track.tally = tally;

  await refreshTrackMessage(client, resolution, body);
}

async function finalizeIfDone(client, resolution) {
  const bodies = bodiesFor(resolution);
  const allClosed = bodies.every((b) => resolution.tracks[b] && resolution.tracks[b].closed);

  if (!allClosed) {
    upsertResolution(resolution);
    return resolution;
  }

  const results = bodies.map((b) => resolution.tracks[b].result);
  let overall;
  if (results.includes('Vetoed')) overall = 'Vetoed';
  else if (results.every((r) => r === 'Passed')) overall = 'Passed';
  else overall = 'Failed';

  resolution.status = overall;
  resolution.archivedAt = Date.now();
  upsertResolution(resolution);

  const config = getConfig();
  const archiveChannelIds = new Set();
  if (bodies.includes('GA') && config.channels.archive) archiveChannelIds.add(config.channels.archive);
  if (bodies.includes('SC') && config.securityCouncil.channels.archive) archiveChannelIds.add(config.securityCouncil.channels.archive);

  for (const channelId of archiveChannelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.send({ embeds: [resolutionEmbed(resolution)] }).catch((err) => console.error(err));
  }

  const summary = bodies.map((b) => `${resolution.tracks[b].label}: ${resolution.tracks[b].result}`).join(' | ');
  await logAudit(client, 'Vote Closed', `**${resolution.number}** — Final Result: ${overall}\n${summary}`);
  await notify(client, `📜 Voting has closed for **${resolution.number}** — Result: **${overall}**`);
  dmUser(client, resolution.submittedBy, `📜 Your resolution **${resolution.number}** — ${resolution.title} has closed. Result: **${overall}**.`);

  return resolution;
}

// Closes one specific track (body) if given, otherwise closes every track
// this resolution has open, then certifies the overall outcome once all
// applicable tracks are closed.
async function closeVoting(client, resolution, body = null) {
  const bodies = body ? [body] : bodiesFor(resolution);
  for (const b of bodies) {
    if (resolution.tracks[b] && !resolution.tracks[b].closed) {
      await closeTrackVote(client, resolution, b);
    }
  }
  return finalizeIfDone(client, resolution);
}

// A Permanent Security Council Member clicked the Veto button (or used
// /veto cast).
async function castVeto(client, resolution, member, reason) {
  const config = getConfig();
  const track = resolution.tracks.SC;
  if (!track || track.closed) return;

  track.vetoedBy = {
    id: member.id,
    tag: member.user ? member.user.tag : member.tag,
    reason: reason || null,
    timestamp: Date.now(),
  };

  if (config.securityCouncil.veto.immediatelyTerminates) {
    track.closed = true;
    track.result = 'Vetoed';
    track.tally = tallyTrack(track);
    await refreshTrackMessage(client, resolution, 'SC');

    // If a General Assembly track is still open on the same resolution, a
    // Security Council veto makes it moot - close it without tallying.
    if (resolution.tracks.GA && !resolution.tracks.GA.closed) {
      resolution.tracks.GA.closed = true;
      resolution.tracks.GA.result = 'Moot (Vetoed by Security Council)';
      await refreshTrackMessage(client, resolution, 'GA');
    }

    await finalizeIfDone(client, resolution);
  } else {
    upsertResolution(resolution);
    await refreshTrackMessage(client, resolution, 'SC');
  }

  await logAudit(
    client,
    'Veto Cast',
    `**${resolution.number}** — Vetoed by ${track.vetoedBy.tag}${reason ? `\nReason: ${reason}` : ''}`
  );
  await notify(client, `🚫 **${resolution.number}** has been vetoed by a Permanent Security Council Member.`);
  dmUser(client, resolution.submittedBy, `🚫 Your resolution **${resolution.number}** — ${resolution.title} has been vetoed by a Permanent Security Council Member.${reason ? ` Reason: ${reason}` : ''}`);
}

async function openOverrideVote(client, resolution) {
  const config = getConfig();
  if (resolution.status !== 'Vetoed') throw new Error('This resolution is not currently vetoed.');
  if (!config.securityCouncil.veto.allowOverride) throw new Error('Veto overrides are disabled in configuration.');

  resolution.status = 'Veto Override Vote';
  await openTrackVote(client, resolution, 'OVERRIDE');
  upsertResolution(resolution);

  await logAudit(client, 'Veto Override Started', `**${resolution.number}** — override vote opened.`);
  await notify(client, `⚖️ A veto override vote has opened for **${resolution.number}**.`);
  return resolution;
}

async function closeOverrideVote(client, resolution) {
  await closeTrackVote(client, resolution, 'OVERRIDE');
  const track = resolution.tracks.OVERRIDE;

  if (track.result === 'Passed') {
    resolution.status = 'Passed';
    resolution.overrideNote = 'Veto overridden by Assembly vote.';
  } else {
    resolution.status = 'Vetoed';
    resolution.overrideNote = 'Veto override failed; original veto stands.';
  }
  resolution.archivedAt = Date.now();
  upsertResolution(resolution);

  const config = getConfig();
  if (config.channels.archive) {
    const channel = await client.channels.fetch(config.channels.archive).catch(() => null);
    if (channel) await channel.send({ embeds: [resolutionEmbed(resolution)] }).catch((err) => console.error(err));
  }

  await logAudit(client, 'Veto Override Closed', `**${resolution.number}** — Result: ${resolution.status}`);
  await notify(client, `⚖️ Veto override vote closed for **${resolution.number}** — Result: **${resolution.status}**`);
  dmUser(client, resolution.submittedBy, `⚖️ The veto override vote on your resolution **${resolution.number}** has closed. Result: **${resolution.status}**.`);
  return resolution;
}

module.exports = {
  bodiesFor,
  getTrackSettings,
  getDebateInfo,
  getReviewChannelIds,
  buildVoteButtons,
  getEligibleCount,
  refreshTrackMessage,
  openVoting,
  closeVoting,
  castVeto,
  openOverrideVote,
  closeOverrideVote,
};
