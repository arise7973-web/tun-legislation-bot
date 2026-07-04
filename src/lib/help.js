// help.js
// Builds the /help embeds by reading whatever commands are currently loaded
// in the bot (client.commands) plus their "category" tag. This means /help
// NEVER needs manual updates - add a new command file with a `category`
// property and it automatically shows up here, correctly grouped and paged.

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MAX_FIELDS_PER_PAGE = 20; // stay safely under Discord's 25-field limit
const MAX_CHARS_PER_PAGE = 5000; // stay safely under Discord's 6000-char embed limit
const DEFAULT_CATEGORY = 'General';

// ApplicationCommandOptionType.Subcommand === 1
function getSubcommands(commandJSON) {
  if (!commandJSON.options) return [];
  return commandJSON.options
    .filter((o) => o.type === 1)
    .map((o) => ({ name: o.name, description: o.description }));
}

function buildCommandField(command) {
  const json = command.data.toJSON();
  const subcommands = getSubcommands(json);

  let value = json.description || 'No description provided.';
  if (subcommands.length > 0) {
    value += '\n' + subcommands.map((s) => `• \`${json.name} ${s.name}\` — ${s.description}`).join('\n');
  }
  value = value.slice(0, 1024); // Discord field value limit

  return { name: `/${json.name}`, value, inline: false };
}

// Groups commands by category, then splits each category into one or more
// pages so we never exceed Discord's embed size limits, no matter how many
// commands get added in the future.
function buildCategoryPages(client) {
  const byCategory = new Map();

  for (const command of client.commands.values()) {
    const category = command.category || DEFAULT_CATEGORY;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(buildCommandField(command));
  }

  const categoryNames = [...byCategory.keys()].sort();
  const pagesByCategory = new Map();

  for (const category of categoryNames) {
    const fields = byCategory.get(category);
    const pages = [];
    let currentFields = [];
    let currentChars = 0;

    for (const field of fields) {
      const fieldChars = field.name.length + field.value.length;
      const wouldOverflow =
        currentFields.length >= MAX_FIELDS_PER_PAGE || currentChars + fieldChars > MAX_CHARS_PER_PAGE;

      if (wouldOverflow && currentFields.length > 0) {
        pages.push(currentFields);
        currentFields = [];
        currentChars = 0;
      }
      currentFields.push(field);
      currentChars += fieldChars;
    }
    if (currentFields.length > 0) pages.push(currentFields);

    pagesByCategory.set(category, pages);
  }

  return { categoryNames, pagesByCategory };
}

function buildHelpEmbed(category, pageFields, pageIndex, totalPages) {
  return new EmbedBuilder()
    .setTitle(`📖 TUN Bot — ${category} Commands`)
    .setColor(0x5865f2)
    .setDescription('Every command currently available in this bot, generated live from what is installed.')
    .addFields(pageFields)
    .setFooter({ text: `Page ${pageIndex + 1} of ${totalPages} — category: ${category}` });
}

// Builds the dropdown (to jump between categories) and Prev/Next buttons
// (to page through a long category). State is encoded right into the
// customId, so no separate memory/database is needed to track "where" a
// user is in the menu.
function buildHelpComponents(categoryNames, activeCategory, pageIndex, totalPages) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Jump to a category...')
    .addOptions(
      categoryNames.slice(0, 25).map((name) => ({
        label: name,
        value: name,
        default: name === activeCategory,
      }))
    );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_nav_${encodeURIComponent(activeCategory)}_${pageIndex - 1}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`help_nav_${encodeURIComponent(activeCategory)}_${pageIndex + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= totalPages - 1)
  );

  const rows = [new ActionRowBuilder().addComponents(select)];
  if (totalPages > 1) rows.push(navRow);
  return rows;
}

// One-stop function: given a client and desired category/page, returns the
// {embed, components} ready to send or edit into a message. Always rebuilt
// fresh from client.commands, so it reflects whatever commands exist right now.
function renderHelpPage(client, requestedCategory, requestedPageIndex) {
  const { categoryNames, pagesByCategory } = buildCategoryPages(client);

  const category = categoryNames.includes(requestedCategory) ? requestedCategory : categoryNames[0];
  const pages = pagesByCategory.get(category) || [[]];
  const pageIndex = Math.min(Math.max(requestedPageIndex, 0), pages.length - 1);

  const embed = buildHelpEmbed(category, pages[pageIndex], pageIndex, pages.length);
  const components = buildHelpComponents(categoryNames, category, pageIndex, pages.length);

  return { embed, components };
}

module.exports = { buildCategoryPages, buildHelpEmbed, buildHelpComponents, renderHelpPage };
