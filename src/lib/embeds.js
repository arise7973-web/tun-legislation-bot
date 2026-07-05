// embeds.js
// Builds the nicely formatted Discord embed "cards" the bot posts.

const { EmbedBuilder } = require('discord.js');

const STATUS_COLORS = {
  Draft: 0x99aab5,
  'Awaiting Sponsors': 0xf1c40f,
  'Under Administrative Review': 0xf1c40f,
  'Returned for Revision': 0xe67e22,
  Debate: 0x3498db,
  Voting: 0x9b59b6,
  'Veto Override Vote': 0x9b59b6,
  Passed: 0x2ecc71,
  Failed: 0xe74c3c,
  Vetoed: 0xe74c3c,
  Withdrawn: 0x95a5a6,
  Expired: 0x95a5a6,
  Archived: 0x2c3e50,
};

function resolutionEmbed(resolution) {
  const embed = new EmbedBuilder()
    .setTitle(`${resolution.number} — ${resolution.title}`)
    .setColor(STATUS_COLORS[resolution.status] || 0x2c3e50)
    .addFields(
      { name: 'Category', value: resolution.templateName, inline: true },
      ...(resolution.subcategory ? [{ name: 'Sub-category', value: resolution.subcategory, inline: true }] : []),
      { name: 'Status', value: resolution.status, inline: true },
      { name: 'Body', value: resolution.body === 'Both' ? 'General Assembly + Security Council' : resolution.body === 'SC' ? 'Security Council' : 'General Assembly', inline: true },
      { name: 'Sponsors', value: resolution.sponsors.length ? resolution.sponsors.map((s) => `<@${s}>`).join(', ') : 'None yet', inline: false }
    )
    .setFooter({ text: `Submitted by ${resolution.submittedByTag}` })
    .setTimestamp(new Date(resolution.createdAt));

  for (const [fieldName, value] of Object.entries(resolution.fields)) {
    embed.addFields({ name: fieldName, value: value?.toString().slice(0, 1024) || '—', inline: false });
  }

  // If this resolution went through voting, show each body's result.
  if (resolution.tracks) {
    for (const [body, track] of Object.entries(resolution.tracks)) {
      if (!track.closed) continue;
      let value = `Result: **${track.result}**`;
      if (track.tally) {
        value += `\nWeighted Yes: ${track.tally.weightedYes} | Weighted No: ${track.tally.weightedNo} | Participation: ${track.tally.participation.toFixed(1)}%`;
      }
      embed.addFields({ name: `${track.label} Vote`, value, inline: false });
    }
  }

  // Veto details, if this resolution was vetoed.
  const scTrack = resolution.tracks && resolution.tracks.SC;
  if (scTrack && scTrack.vetoedBy) {
    embed.addFields({
      name: '🚫 Vetoed',
      value: `By: <@${scTrack.vetoedBy.id}>\nDate: <t:${Math.floor(scTrack.vetoedBy.timestamp / 1000)}:f>\nReason: ${scTrack.vetoedBy.reason || 'Not given'}`,
      inline: false,
    });
  }
  if (resolution.overrideNote) {
    embed.addFields({ name: 'Veto Override', value: resolution.overrideNote, inline: false });
  }

  return embed;
}

// Renders the interactive voting card for ONE track (body) of a resolution,
// e.g. the General Assembly vote or the Security Council vote.
function trackEmbed(resolution, body, track) {
  const ballots = Object.values(track.ballots || {});
  const yes = ballots.filter((v) => v.choice === 'yes');
  const no = ballots.filter((v) => v.choice === 'no');
  const abstain = ballots.filter((v) => v.choice === 'abstain');

  const rawYes = yes.length;
  const rawNo = no.length;
  const rawAbstain = abstain.length;
  const weightedYes = yes.reduce((s, v) => s + v.weight, 0);
  const weightedNo = no.reduce((s, v) => s + v.weight, 0);
  const weightedAbstain = abstain.reduce((s, v) => s + v.weight, 0);

  const votesCast = ballots.length;
  const participation = track.eligibleCount > 0 ? ((votesCast / track.eligibleCount) * 100).toFixed(1) : '0.0';

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ [${track.label}] ${resolution.number} — ${resolution.title}`)
    .setColor(track.closed ? (track.result === 'Passed' ? 0x2ecc71 : 0xe74c3c) : 0x9b59b6)
    .addFields(
      { name: 'Status', value: track.closed ? `Closed — ${track.result}` : 'Voting Open', inline: false },
      {
        name: 'Rule',
        value: `${track.requiresSupermajority ? 'Supermajority' : 'Simple Majority'} (${track.thresholdPercent}%) + Quorum (${track.quorumPercent}%)`,
        inline: false,
      },
      { name: 'Deadline', value: `<t:${Math.floor(track.endsAt / 1000)}:R>`, inline: true },
      { name: 'Eligible Voters', value: `${track.eligibleCount}`, inline: true },
      { name: 'Votes Cast', value: `${votesCast}`, inline: true },
      { name: 'Participation', value: `${participation}%`, inline: true },
      { name: '✅ Yes', value: `Raw: ${rawYes}  |  Weighted: ${weightedYes}`, inline: false },
      { name: '❌ No', value: `Raw: ${rawNo}  |  Weighted: ${weightedNo}`, inline: false },
      { name: '⚪ Abstain', value: `Raw: ${rawAbstain}  |  Weighted: ${weightedAbstain}`, inline: false }
    );

  if (track.vetoEnabled) {
    embed.addFields({ name: '🚫 Veto', value: 'Permanent Security Council Members may veto using the button below.', inline: false });
  }
  if (track.vetoedBy) {
    embed.addFields({ name: '🚫 Vetoed By', value: `<@${track.vetoedBy.id}>${track.vetoedBy.reason ? ` — ${track.vetoedBy.reason}` : ''}`, inline: false });
  }

  return embed;
}

module.exports = { resolutionEmbed, trackEmbed };
