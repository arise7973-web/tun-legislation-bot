// /debate command
// Debate opens automatically when a resolution is approved (see review.js)
// and closes automatically once its timer runs out (see scheduler.js).
// This command lets an admin close debate early and move straight to voting.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isAdmin } = require('../lib/permissions');
const { findResolution } = require('../lib/resolutions');
const { openVoting } = require('../lib/voting');
const { hasOpenAmendments } = require('../lib/amendments');

module.exports = {
  category: 'Legislation',
  data: new SlashCommandBuilder()
    .setName('debate')
    .setDescription('Debate controls (admin only)')
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Close debate early and open voting')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const config = getConfig();
    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const number = interaction.options.getString('number');
    const resolution = findResolution(number);
    if (!resolution) {
      return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
    }
    if (resolution.status !== 'Debate') {
      return interaction.reply({ content: `❌ This resolution is not currently in debate (status: ${resolution.status}).`, ephemeral: true });
    }
    if (hasOpenAmendments(resolution)) {
      return interaction.reply({ content: `❌ **${resolution.number}** still has amendments in Debate or Voting. Resolve those first with \`/amendment\` before closing debate.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    await openVoting(interaction.client, resolution);
    return interaction.editReply({ content: `✅ Debate closed early for **${resolution.number}**. Voting is now open.` });
  },
};
