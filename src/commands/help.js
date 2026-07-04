// /help command
// Shows every command currently installed in the bot, grouped by category,
// with a dropdown to jump between categories and Previous/Next buttons if a
// category ever grows too long for one Discord embed. This list is built
// live every time from the bot's actual commands, so it always stays
// accurate automatically - you never have to edit this file when you add
// a new command elsewhere. Just give the new command a `category` property.

const { SlashCommandBuilder } = require('discord.js');
const { renderHelpPage } = require('../lib/help');

module.exports = {
  category: 'General',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available bot commands, organized by category'),

  async execute(interaction) {
    const { embed, components } = renderHelpPage(interaction.client, null, 0);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },
};
