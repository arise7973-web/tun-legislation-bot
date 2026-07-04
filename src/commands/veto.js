// /veto command
// The Veto button on the Security Council voting card is the primary way
// to cast a veto, but this command gives Permanent Members a way to cast
// one with a written reason attached, and gives admins control over
// starting/closing override votes.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isAdmin, isSCPermanentMember } = require('../lib/permissions');
const { findResolution } = require('../lib/resolutions');
const { resolutionEmbed } = require('../lib/embeds');
const { castVeto, openOverrideVote, closeOverrideVote } = require('../lib/voting');

module.exports = {
  category: 'Security Council',
  data: new SlashCommandBuilder()
    .setName('veto')
    .setDescription('Veto controls')
    .addSubcommand((sub) =>
      sub
        .setName('cast')
        .setDescription('Cast a veto on a resolution currently being voted on by the Security Council')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the veto (optional)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Check whether a resolution has been vetoed')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('override-start')
        .setDescription('Start a veto override vote (admin only)')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('override-close')
        .setDescription('Manually close a veto override vote (admin only)')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    ),

  async execute(interaction) {
    const config = getConfig();
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getString('number');
    const resolution = findResolution(number);

    if (!resolution) {
      return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
    }

    if (sub === 'cast') {
      if (!isSCPermanentMember(interaction.member, config)) {
        return interaction.reply({ content: '❌ Only Permanent Security Council Members may cast a veto.', ephemeral: true });
      }
      const track = resolution.tracks && resolution.tracks.SC;
      if (!track || track.closed) {
        return interaction.reply({ content: '❌ There is no open Security Council vote on this resolution.', ephemeral: true });
      }
      const reason = interaction.options.getString('reason');

      await interaction.reply({ content: `🚫 You have cast a veto on **${resolution.number}**.`, ephemeral: true });
      castVeto(interaction.client, resolution, interaction.member, reason).catch((err) => console.error('Failed to process veto:', err));
      return;
    }

    if (sub === 'status') {
      const scTrack = resolution.tracks && resolution.tracks.SC;
      if (!scTrack || !scTrack.vetoedBy) {
        return interaction.reply({ content: `**${resolution.number}** has not been vetoed.`, ephemeral: true });
      }
      return interaction.reply({ embeds: [resolutionEmbed(resolution)], ephemeral: true });
    }

    if (sub === 'override-start') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      try {
        await interaction.deferReply({ ephemeral: true });
        await openOverrideVote(interaction.client, resolution);
        return interaction.editReply({ content: `✅ Veto override vote started for **${resolution.number}**.` });
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    }

    if (sub === 'override-close') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      if (resolution.status !== 'Veto Override Vote') {
        return interaction.reply({ content: `❌ This resolution does not have an active override vote (status: ${resolution.status}).`, ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const updated = await closeOverrideVote(interaction.client, resolution);
      return interaction.editReply({ content: `✅ Override vote closed for **${updated.number}**. Result: **${updated.status}**.` });
    }
  },
};
