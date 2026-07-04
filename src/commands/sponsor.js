// /sponsor command
// Lets eligible members endorse (sponsor) a resolution that is still
// collecting sponsors. Once enough sponsors have joined, the resolution
// automatically moves into Administrative Review.

const { SlashCommandBuilder } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isSponsorEligible } = require('../lib/permissions');
const { findResolution, upsertResolution } = require('../lib/resolutions');
const { resolutionEmbed } = require('../lib/embeds');
const { logAudit, dmUser } = require('../lib/audit');

module.exports = {
  category: 'Legislation',
  data: new SlashCommandBuilder()
    .setName('sponsor')
    .setDescription('Add or remove your sponsorship of a resolution')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Sponsor a resolution')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number, e.g. UNGA/2026/001').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Withdraw your sponsorship')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number').setRequired(true).setAutocomplete(true))
    ),

  async execute(interaction) {
    const config = getConfig();
    const number = interaction.options.getString('number');
    const resolution = findResolution(number);

    if (!resolution) {
      return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
    }

    if (resolution.status !== 'Awaiting Sponsors' && resolution.status !== 'Draft') {
      return interaction.reply({ content: `❌ This resolution is no longer accepting sponsors (status: ${resolution.status}).`, ephemeral: true });
    }

    if (!isSponsorEligible(interaction.member, config)) {
      return interaction.reply({ content: '❌ You are not eligible to sponsor resolutions.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      if (resolution.sponsors.includes(interaction.user.id)) {
        return interaction.reply({ content: 'You have already sponsored this resolution.', ephemeral: true });
      }
      resolution.sponsors.push(interaction.user.id);

      const reachedThreshold = resolution.sponsors.length >= config.sponsorsRequired;
      resolution.status = reachedThreshold ? 'Under Administrative Review' : 'Awaiting Sponsors';
      upsertResolution(resolution);

      await interaction.reply({
        content: `✅ You are now sponsoring **${resolution.number}**. (${resolution.sponsors.length}/${config.sponsorsRequired} sponsors)`,
        embeds: [resolutionEmbed(resolution)],
        ephemeral: true,
      });

      logAudit(interaction.client, 'Sponsor Added', `${interaction.user.tag} sponsored ${resolution.number}.`).catch((err) => console.error(err));

      if (resolution.submittedBy !== interaction.user.id) {
        dmUser(
          interaction.client,
          resolution.submittedBy,
          `📌 **${interaction.user.tag}** has sponsored your resolution **${resolution.number}** (${resolution.sponsors.length}/${config.sponsorsRequired} sponsors).`
        );
      }
      if (reachedThreshold) {
        dmUser(interaction.client, resolution.submittedBy, `✅ Your resolution **${resolution.number}** now has enough sponsors and has moved to Administrative Review.`);
      }
      return;
    }

    if (sub === 'remove') {
      if (!resolution.sponsors.includes(interaction.user.id)) {
        return interaction.reply({ content: 'You are not currently sponsoring this resolution.', ephemeral: true });
      }
      resolution.sponsors = resolution.sponsors.filter((id) => id !== interaction.user.id);
      if (resolution.sponsors.length < config.sponsorsRequired) {
        resolution.status = 'Awaiting Sponsors';
      }
      upsertResolution(resolution);

      await interaction.reply({ content: `✅ You have withdrawn your sponsorship of **${resolution.number}**.`, ephemeral: true });

      logAudit(interaction.client, 'Sponsor Removed', `${interaction.user.tag} withdrew sponsorship of ${resolution.number}.`).catch((err) => console.error(err));
      return;
    }
  },
};
