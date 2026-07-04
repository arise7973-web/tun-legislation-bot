// /resolution command
// Lets anyone look up a resolution by number, or list recent ones.

const { SlashCommandBuilder } = require('discord.js');
const { getAllResolutions, findResolution } = require('../lib/resolutions');
const { resolutionEmbed } = require('../lib/embeds');

module.exports = {
  category: 'Legislation',
  data: new SlashCommandBuilder()
    .setName('resolution')
    .setDescription('View resolutions')
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View a specific resolution')
        .addStringOption((o) => o.setName('number').setDescription('Resolution number, e.g. UNGA/2026/001').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List the most recent resolutions')
        .addStringOption((o) =>
          o
            .setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: 'Draft', value: 'Draft' },
              { name: 'Awaiting Sponsors', value: 'Awaiting Sponsors' },
              { name: 'Under Administrative Review', value: 'Under Administrative Review' },
              { name: 'Debate', value: 'Debate' },
              { name: 'Voting', value: 'Voting' },
              { name: 'Passed', value: 'Passed' },
              { name: 'Failed', value: 'Failed' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const number = interaction.options.getString('number');
      const resolution = findResolution(number);
      if (!resolution) {
        return interaction.reply({ content: `❌ No resolution found with number **${number}**.`, ephemeral: true });
      }
      return interaction.reply({ embeds: [resolutionEmbed(resolution)] });
    }

    if (sub === 'list') {
      const statusFilter = interaction.options.getString('status');
      let list = getAllResolutions();
      if (statusFilter) list = list.filter((r) => r.status === statusFilter);
      list = list.slice(-15).reverse();

      if (list.length === 0) {
        return interaction.reply({ content: 'No resolutions found.', ephemeral: true });
      }

      const lines = list.map((r) => `**${r.number}** — ${r.title} — *${r.status}*`);
      return interaction.reply({ content: lines.join('\n') });
    }
  },
};
