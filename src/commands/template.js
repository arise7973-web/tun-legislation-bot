// /template command
// Admins define the "forms" members fill out to propose resolutions.
// Example: a "Military Intervention" template with fields Target, Purpose, Duration...
// NOTE: Discord popup forms (modals) support a maximum of 5 fields, so each
// template can have up to 5 fields for now.
//
// Templates can optionally have SUBCATEGORIES - e.g. an "Economic Policy"
// template with subcategories "Tax Changes", "Grant Policy", "Bank Policy".
// If a template has subcategories, members pick one from a dropdown right
// after choosing the template in /propose, and it's recorded on the
// resolution and shown wherever the resolution is displayed.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../lib/config');
const { isAdmin } = require('../lib/permissions');
const { getAllTemplates, saveAllTemplates, findTemplate } = require('../lib/resolutions');

module.exports = {
  category: 'Administration',
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Manage resolution templates (admin only)')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new resolution template')
        .addStringOption((o) => o.setName('name').setDescription('Template name, e.g. Economic Policy').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('fields')
            .setDescription('Comma-separated field names (max 5), e.g. Target,Purpose,Duration,Funding,Notes')
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName('subcategories')
            .setDescription('Optional: comma-separated sub-categories, e.g. Tax Changes,Grant Policy,Bank Policy')
            .setRequired(false)
        )
        .addBooleanOption((o) => o.setName('supermajority').setDescription('Require supermajority instead of simple majority?').setRequired(false))
        .addRoleOption((o) => o.setName('restrict_to_role').setDescription('Only members with this role may use this template').setRequired(false))
        .addStringOption((o) =>
          o
            .setName('body')
            .setDescription('Which body votes on this? Default: General Assembly')
            .setRequired(false)
            .addChoices(
              { name: 'General Assembly only', value: 'GA' },
              { name: 'Security Council only', value: 'SC' },
              { name: 'Both (GA and SC must both approve)', value: 'Both' }
            )
        )
        .addBooleanOption((o) => o.setName('vetoable').setDescription('Can Permanent SC Members veto this? Default: true (only matters if body includes SC)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List all templates')
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable a template')
        .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled?').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a template')
        .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-subcategory')
        .setDescription('Add a sub-category to an existing template')
        .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
        .addStringOption((o) => o.setName('subcategory').setDescription('Sub-category to add, e.g. Tax Changes').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-subcategory')
        .setDescription('Remove a sub-category from a template')
        .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
        .addStringOption((o) => o.setName('subcategory').setDescription('Sub-category to remove').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const config = getConfig();
    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const fieldsRaw = interaction.options.getString('fields');
      const fields = fieldsRaw.split(',').map((f) => f.trim()).filter(Boolean);

      if (fields.length === 0 || fields.length > 5) {
        return interaction.reply({ content: '❌ Please provide between 1 and 5 field names, separated by commas.', ephemeral: true });
      }
      if (findTemplate(name)) {
        return interaction.reply({ content: `❌ A template named **${name}** already exists.`, ephemeral: true });
      }

      const subcategoriesRaw = interaction.options.getString('subcategories');
      const subcategories = subcategoriesRaw
        ? subcategoriesRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      if (subcategories.length > 25) {
        return interaction.reply({ content: '❌ A template can have at most 25 sub-categories (a Discord dropdown limit).', ephemeral: true });
      }

      const supermajority = interaction.options.getBoolean('supermajority') || false;
      const restrictRole = interaction.options.getRole('restrict_to_role');
      const body = interaction.options.getString('body') || 'GA';
      const vetoable = interaction.options.getBoolean('vetoable');

      const templates = getAllTemplates();
      templates.push({
        name,
        fields,
        subcategories,
        enabled: true,
        requiresSupermajority: supermajority,
        allowedRole: restrictRole ? restrictRole.id : null,
        body,
        vetoable: vetoable === null ? true : vetoable,
      });
      saveAllTemplates(templates);

      return interaction.reply({
        content: `✅ Template **${name}** created with fields: ${fields.join(', ')}.${
          subcategories.length ? ` Sub-categories: ${subcategories.join(', ')}.` : ''
        } Body: ${body}${body !== 'GA' ? ` (vetoable: ${vetoable === null ? true : vetoable})` : ''}`,
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const templates = getAllTemplates();
      if (templates.length === 0) {
        return interaction.reply({ content: 'No templates exist yet. Use `/template create` to add one.', ephemeral: true });
      }
      const lines = templates.map(
        (t) =>
          `**${t.name}** — ${t.enabled ? '✅ enabled' : '⛔ disabled'} — fields: ${t.fields.join(', ')}${
            t.subcategories && t.subcategories.length ? ` — sub-categories: ${t.subcategories.join(', ')}` : ''
          }${t.requiresSupermajority ? ' — requires supermajority' : ''}${
            t.allowedRole ? ` — restricted to <@&${t.allowedRole}>` : ''
          } — body: ${t.body || 'GA'}${(t.body || 'GA') !== 'GA' ? ` (vetoable: ${t.vetoable !== false})` : ''}`
      );
      return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    if (sub === 'toggle') {
      const name = interaction.options.getString('name');
      const enabled = interaction.options.getBoolean('enabled');
      const templates = getAllTemplates();
      const t = templates.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!t) return interaction.reply({ content: `❌ No template named **${name}**.`, ephemeral: true });
      t.enabled = enabled;
      saveAllTemplates(templates);
      return interaction.reply({ content: `✅ Template **${name}** is now ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const templates = getAllTemplates();
      const filtered = templates.filter((x) => x.name.toLowerCase() !== name.toLowerCase());
      if (filtered.length === templates.length) {
        return interaction.reply({ content: `❌ No template named **${name}**.`, ephemeral: true });
      }
      saveAllTemplates(filtered);
      return interaction.reply({ content: `🗑️ Template **${name}** deleted.`, ephemeral: true });
    }

    if (sub === 'add-subcategory') {
      const name = interaction.options.getString('name');
      const subcategory = interaction.options.getString('subcategory').trim();
      const templates = getAllTemplates();
      const t = templates.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!t) return interaction.reply({ content: `❌ No template named **${name}**.`, ephemeral: true });

      t.subcategories = t.subcategories || [];
      if (t.subcategories.includes(subcategory)) {
        return interaction.reply({ content: `**${subcategory}** is already a sub-category of **${name}**.`, ephemeral: true });
      }
      if (t.subcategories.length >= 25) {
        return interaction.reply({ content: '❌ A template can have at most 25 sub-categories (a Discord dropdown limit).', ephemeral: true });
      }

      t.subcategories.push(subcategory);
      saveAllTemplates(templates);
      return interaction.reply({ content: `✅ Added sub-category **${subcategory}** to **${name}**. Current: ${t.subcategories.join(', ')}`, ephemeral: true });
    }

    if (sub === 'remove-subcategory') {
      const name = interaction.options.getString('name');
      const subcategory = interaction.options.getString('subcategory').trim();
      const templates = getAllTemplates();
      const t = templates.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!t) return interaction.reply({ content: `❌ No template named **${name}**.`, ephemeral: true });

      t.subcategories = t.subcategories || [];
      if (!t.subcategories.includes(subcategory)) {
        return interaction.reply({ content: `**${subcategory}** is not currently a sub-category of **${name}**.`, ephemeral: true });
      }

      t.subcategories = t.subcategories.filter((s) => s !== subcategory);
      saveAllTemplates(templates);
      return interaction.reply({
        content: `✅ Removed sub-category **${subcategory}** from **${name}**. ${t.subcategories.length ? `Remaining: ${t.subcategories.join(', ')}` : 'No sub-categories remain.'}`,
        ephemeral: true,
      });
    }
  },
};
