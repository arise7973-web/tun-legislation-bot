// /amendment command
// Lets members propose text amendments to a resolution while it's in
// Debate. Proposing an amendment is a two-step flow: pick which field to
// amend from a dropdown, then fill in the text via a pop-up form. Amendment
// votes use whichever body (GA or SC) the resolution itself belongs to.

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isAdmin, isSponsorEligible } = require('../lib/permissions');
const { findResolution, upsertResolution } = require('../lib/resolutions');
const { resolutionEmbed } = require('../lib/embeds');
const { AMENDMENT_TYPE_LABELS, openAmendmentVote, closeAmendmentVote } = require('../lib/amendments');

module.exports = {
  category: 'Amendments',
  data: new SlashCommandBuilder()
    .setName('amendment')
    .setDescription('Propose, review, and vote on amendments to a resolution under debate')
    .addSubcommand((sub) =>
      sub
        .setName('propose')
        .setDescription('Propose an amendment to a resolution currently in Debate')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Type of amendment')
            .setRequired(true)
            .addChoices(
              { name: 'Add Text', value: 'add' },
              { name: 'Remove Text', value: 'remove' },
              { name: 'Replace Text', value: 'replace' },
              { name: 'Correct Formatting', value: 'format' },
              { name: 'Correct References', value: 'reference' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all amendments on a resolution')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('vote-start')
        .setDescription('Manually open voting on an amendment (admin only)')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('amendment_id').setDescription('Amendment ID, e.g. A1').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('vote-close')
        .setDescription('Manually close voting on an amendment (admin only)')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('amendment_id').setDescription('Amendment ID, e.g. A1').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('withdraw')
        .setDescription('Withdraw an amendment before its vote closes')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('amendment_id').setDescription('Amendment ID, e.g. A1').setRequired(true).setAutocomplete(true))
    ),

  async execute(interaction) {
    const config = getConfig();
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getString('number');
    const resolution = findResolution(number);

    if (!resolution) {
      return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
    }

    if (sub === 'propose') {
      if (!config.amendments.enabled) {
        return interaction.reply({ content: '❌ Amendments are currently disabled.', ephemeral: true });
      }
      if (resolution.status !== 'Debate') {
        return interaction.reply({ content: `❌ Amendments can only be proposed while a resolution is in Debate (status: ${resolution.status}).`, ephemeral: true });
      }
      if (!isSponsorEligible(interaction.member, config)) {
        return interaction.reply({ content: '❌ You are not eligible to propose amendments.', ephemeral: true });
      }

      const type = interaction.options.getString('type');
      const fieldNames = Object.keys(resolution.fields);

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`amendment_select_field_${type}_${encodeURIComponent(resolution.number)}`)
        .setPlaceholder('Which part of the resolution does this amend?')
        .addOptions(fieldNames.slice(0, 25).map((f) => ({ label: f, value: f })));

      return interaction.reply({
        content: `Which field of **${resolution.number}** does this ${AMENDMENT_TYPE_LABELS[type]} amendment apply to?`,
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const amendments = resolution.amendments || [];
      if (amendments.length === 0) {
        return interaction.reply({ content: `**${resolution.number}** has no amendments yet.`, ephemeral: true });
      }
      const lines = amendments.map((a) => {
        const label = AMENDMENT_TYPE_LABELS[a.type] || a.type;
        return `**${a.id}** — ${label} → ${a.targetField.slice(0, 60)} — by <@${a.sponsor}> — **${a.status}**`;
      });
      const listEmbed = new EmbedBuilder()
        .setTitle(`📝 Amendments on ${resolution.number}`)
        .setColor(0x5865f2)
        .setDescription(lines.join('\n').slice(0, 4000));

      return interaction.reply({ embeds: [listEmbed, resolutionEmbed(resolution)], ephemeral: true });
    }

    // Everything below requires finding the specific amendment.
    const amendmentId = interaction.options.getString('amendment_id');
    const amendment = (resolution.amendments || []).find((a) => a.id === amendmentId);
    if (!amendment) {
      return interaction.reply({ content: `❌ No amendment **${amendmentId}** found on **${resolution.number}**.`, ephemeral: true });
    }

    if (sub === 'vote-start') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      if (amendment.status !== 'Debate') {
        return interaction.reply({ content: `❌ This amendment is not awaiting a vote (status: ${amendment.status}).`, ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      await openAmendmentVote(interaction.client, resolution, amendment);
      return interaction.editReply({ content: `✅ Voting opened on amendment **${amendment.id}**.` });
    }

    if (sub === 'vote-close') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
      if (amendment.status !== 'Voting') {
        return interaction.reply({ content: `❌ This amendment is not currently being voted on (status: ${amendment.status}).`, ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const updated = await closeAmendmentVote(interaction.client, resolution, amendment);
      return interaction.editReply({ content: `✅ Voting closed on amendment **${updated.id}**. Result: **${updated.status}**.` });
    }

    if (sub === 'withdraw') {
      const canWithdraw = isAdmin(interaction.member, config) || amendment.sponsor === interaction.user.id;
      if (!canWithdraw) {
        return interaction.reply({ content: "❌ Only the amendment's sponsor or an admin can withdraw it.", ephemeral: true });
      }
      if (amendment.status !== 'Debate' && amendment.status !== 'Voting') {
        return interaction.reply({ content: `❌ This amendment can no longer be withdrawn (status: ${amendment.status}).`, ephemeral: true });
      }
      amendment.status = 'Withdrawn';
      if (amendment.debate) amendment.debate.closed = true;
      if (amendment.vote) amendment.vote.closed = true;
      upsertResolution(resolution);
      return interaction.reply({ content: `✅ Amendment **${amendment.id}** withdrawn.`, ephemeral: true });
    }
  },
};
