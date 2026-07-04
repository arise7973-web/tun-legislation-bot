// /propose command
// A member runs this to start writing a new resolution.
// Step 1: they see a dropdown of available templates (handled here).
// Step 2: picking one opens a pop-up form (modal) - handled in src/index.js
//         because Discord sends that as a separate "select menu" interaction.

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getConfig } = require('../lib/config');
const { getAllTemplates, findActiveResolutionByMember } = require('../lib/resolutions');

module.exports = {
  category: 'Legislation',
  data: new SlashCommandBuilder()
    .setName('propose')
    .setDescription('Start drafting a new resolution from an approved template'),

  async execute(interaction) {
    const config = getConfig();

    if (config.oneResolutionPerMember) {
      const existing = findActiveResolutionByMember(interaction.user.id);
      if (existing) {
        return interaction.reply({
          content: `❌ You already have an active resolution: **${existing.number}** — ${existing.title} (status: ${existing.status}). You can propose a new one once it's resolved.`,
          ephemeral: true,
        });
      }
    }

    const templates = getAllTemplates().filter((t) => t.enabled);

    const usable = templates.filter((t) => !t.allowedRole || interaction.member.roles.cache.has(t.allowedRole));

    if (usable.length === 0) {
      return interaction.reply({
        content: '❌ There are no resolution templates available to you right now. Ask an administrator to create one with `/template create`.',
        ephemeral: true,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('propose_select_template')
      .setPlaceholder('Choose a resolution category...')
      .addOptions(
        usable.slice(0, 25).map((t) => ({
          label: t.name,
          value: t.name,
          description: `Fields: ${t.fields.join(', ')}`.slice(0, 100),
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    return interaction.reply({
      content: 'Select the type of resolution you want to propose:',
      components: [row],
      ephemeral: true,
    });
  },
};
