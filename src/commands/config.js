// /config command
// This is the heart of "nothing is hardcoded". Admins use this to set
// roles, channels, quorum %, majority %, durations, vote weights, etc.

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, setValue, getValue } = require('../lib/config');
const { isAdmin } = require('../lib/permissions');

const ROLE_KEY_CHOICES = [
  { name: 'Admin', value: 'roles.admin' },
  { name: 'General Assembly Voter', value: 'roles.gaVoter' },
  { name: 'General Assembly Reviewer (e.g. GA President)', value: 'roles.gaReviewer' },
  { name: 'Sponsor Eligible', value: 'roles.sponsorEligible' },
  { name: 'Security Council Member', value: 'securityCouncil.roles.member' },
  { name: 'Security Council Permanent Member', value: 'securityCouncil.roles.permanentMember' },
  { name: 'Security Council Reviewer (e.g. UNSC Chair)', value: 'securityCouncil.roles.reviewer' },
];

// Role settings can hold multiple roles (e.g. two different Admin roles).
// This always returns the current list as an array, even if an older config
// still has a single role ID saved as a plain string.
function getRoleArray(key) {
  const value = getValue(key);
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

module.exports = {
  category: 'Administration',
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or change TUN bot configuration (admin only)')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Show the current configuration')
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-role')
        .setDescription('Add a role to a role setting (settings can hold more than one role)')
        .addStringOption((opt) => opt.setName('key').setDescription('Which role setting to add to').setRequired(true).addChoices(...ROLE_KEY_CHOICES))
        .addRoleOption((opt) => opt.setName('role').setDescription('The Discord role to add').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-role')
        .setDescription('Remove a role from a role setting')
        .addStringOption((opt) => opt.setName('key').setDescription('Which role setting to remove from').setRequired(true).addChoices(...ROLE_KEY_CHOICES))
        .addRoleOption((opt) => opt.setName('role').setDescription('The Discord role to remove').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('list-roles')
        .setDescription('Show every role currently assigned to a role setting')
        .addStringOption((opt) => opt.setName('key').setDescription('Which role setting to view').setRequired(true).addChoices(...ROLE_KEY_CHOICES))
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-channel')
        .setDescription('Set a channel used by the bot')
        .addStringOption((opt) =>
          opt
            .setName('key')
            .setDescription('Which channel to set')
            .setRequired(true)
            .addChoices(
              { name: 'Review', value: 'channels.review' },
              { name: 'Debate', value: 'channels.debate' },
              { name: 'Voting', value: 'channels.voting' },
              { name: 'Archive', value: 'channels.archive' },
              { name: 'Audit Log', value: 'channels.audit' },
              { name: 'Notifications', value: 'channels.notifications' },
              { name: 'Security Council Review', value: 'securityCouncil.channels.review' },
              { name: 'Security Council Debate', value: 'securityCouncil.channels.debate' },
              { name: 'Security Council Voting', value: 'securityCouncil.channels.voting' },
              { name: 'Security Council Archive', value: 'securityCouncil.channels.archive' }
            )
        )
        .addChannelOption((opt) => opt.setName('channel').setDescription('The Discord channel').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-number')
        .setDescription('Set a numeric setting (percentages, durations, sponsor count)')
        .addStringOption((opt) =>
          opt
            .setName('key')
            .setDescription('Which setting to change')
            .setRequired(true)
            .addChoices(
              { name: 'Quorum %', value: 'quorumPercent' },
              { name: 'Majority %', value: 'majorityPercent' },
              { name: 'Supermajority %', value: 'supermajorityPercent' },
              { name: 'Debate duration (minutes)', value: 'debateDurationMinutes' },
              { name: 'Voting duration (minutes)', value: 'votingDurationMinutes' },
              { name: 'Sponsors required', value: 'sponsorsRequired' },
              { name: 'SC Quorum %', value: 'securityCouncil.quorumPercent' },
              { name: 'SC Majority %', value: 'securityCouncil.majorityPercent' },
              { name: 'SC Supermajority %', value: 'securityCouncil.supermajorityPercent' },
              { name: 'SC Debate duration (minutes)', value: 'securityCouncil.debateDurationMinutes' },
              { name: 'SC Voting duration (minutes)', value: 'securityCouncil.votingDurationMinutes' },
              { name: 'Veto Override Threshold %', value: 'securityCouncil.veto.overrideThresholdPercent' },
              { name: 'Veto Override Voting duration (minutes)', value: 'securityCouncil.veto.overrideVotingDurationMinutes' },
              { name: 'Amendment Quorum %', value: 'amendments.quorumPercent' },
              { name: 'Amendment Majority %', value: 'amendments.majorityPercent' },
              { name: 'Amendment Debate duration (minutes)', value: 'amendments.debateDurationMinutes' },
              { name: 'Amendment Voting duration (minutes)', value: 'amendments.votingDurationMinutes' }
            )
        )
        .addNumberOption((opt) => opt.setName('value').setDescription('New numeric value').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-toggle')
        .setDescription('Turn a yes/no setting on or off')
        .addStringOption((opt) =>
          opt
            .setName('key')
            .setDescription('Which setting to change')
            .setRequired(true)
            .addChoices(
              { name: 'Allow vote changes', value: 'allowVoteChanges' },
              { name: 'Public voting', value: 'publicVoting' },
              { name: 'Live results during vote', value: 'liveResultsDuringVote' },
              { name: 'DM Notifications to Proposer', value: 'dmNotifications' },
              { name: 'One resolution per member at a time', value: 'oneResolutionPerMember' },
              { name: 'Veto Enabled', value: 'securityCouncil.veto.enabled' },
              { name: 'Veto Immediately Ends Vote', value: 'securityCouncil.veto.immediatelyTerminates' },
              { name: 'Allow Veto Override', value: 'securityCouncil.veto.allowOverride' },
              { name: 'Amendments Enabled', value: 'amendments.enabled' }
            )
        )
        .addBooleanOption((opt) => opt.setName('value').setDescription('On (true) or off (false)').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-weight')
        .setDescription('Set how many votes a role is worth in legislative votes')
        .addRoleOption((opt) => opt.setName('role').setDescription('The role').setRequired(true))
        .addIntegerOption((opt) => opt.setName('weight').setDescription('Vote weight (0 or more)').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('numbering')
        .setDescription('Configure resolution numbering format')
        .addStringOption((opt) => opt.setName('prefix').setDescription('e.g. UNGA').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('format')
            .setDescription('Use {prefix} {year} {seq}, e.g. {prefix}/{year}/{seq}')
            .setRequired(true)
        )
        .addBooleanOption((opt) => opt.setName('reset_yearly').setDescription('Restart numbering each year?').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const config = getConfig();

    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      return interaction.reply({
        content: '```json\n' + JSON.stringify(config, null, 2).slice(0, 1900) + '\n```',
        ephemeral: true,
      });
    }

    if (sub === 'add-role') {
      const key = interaction.options.getString('key');
      const role = interaction.options.getRole('role');
      const current = getRoleArray(key);
      if (current.includes(role.id)) {
        return interaction.reply({ content: `<@&${role.id}> is already set for **${key}**.`, ephemeral: true });
      }
      current.push(role.id);
      setValue(key, current);
      return interaction.reply({
        content: `✅ Added <@&${role.id}> to **${key}**. Current roles: ${current.map((id) => `<@&${id}>`).join(', ')}`,
        ephemeral: true,
      });
    }

    if (sub === 'remove-role') {
      const key = interaction.options.getString('key');
      const role = interaction.options.getRole('role');
      const current = getRoleArray(key);
      if (!current.includes(role.id)) {
        return interaction.reply({ content: `<@&${role.id}> is not currently set for **${key}**.`, ephemeral: true });
      }
      const updated = current.filter((id) => id !== role.id);
      setValue(key, updated);
      return interaction.reply({
        content: `✅ Removed <@&${role.id}> from **${key}**. ${updated.length ? `Remaining roles: ${updated.map((id) => `<@&${id}>`).join(', ')}` : 'No roles remain set for this key.'}`,
        ephemeral: true,
      });
    }

    if (sub === 'list-roles') {
      const key = interaction.options.getString('key');
      const current = getRoleArray(key);
      return interaction.reply({
        content: current.length ? `**${key}**: ${current.map((id) => `<@&${id}>`).join(', ')}` : `**${key}** has no roles set yet. Use \`/config add-role\`.`,
        ephemeral: true,
      });
    }

    if (sub === 'set-channel') {
      const key = interaction.options.getString('key');
      const channel = interaction.options.getChannel('channel');
      setValue(key, channel.id);
      return interaction.reply({ content: `✅ Set **${key}** to <#${channel.id}>.`, ephemeral: true });
    }

    if (sub === 'set-number') {
      const key = interaction.options.getString('key');
      const value = interaction.options.getNumber('value');
      setValue(key, value);
      return interaction.reply({ content: `✅ Set **${key}** to **${value}**.`, ephemeral: true });
    }

    if (sub === 'set-toggle') {
      const key = interaction.options.getString('key');
      const value = interaction.options.getBoolean('value');
      setValue(key, value);
      return interaction.reply({ content: `✅ Set **${key}** to **${value}**.`, ephemeral: true });
    }

    if (sub === 'set-weight') {
      const role = interaction.options.getRole('role');
      const weight = interaction.options.getInteger('weight');
      const updated = getConfig();
      updated.voteWeights[role.id] = weight;
      setValue('voteWeights', updated.voteWeights);
      return interaction.reply({ content: `✅ <@&${role.id}> now has vote weight **${weight}**.`, ephemeral: true });
    }

    if (sub === 'numbering') {
      const prefix = interaction.options.getString('prefix');
      const format = interaction.options.getString('format');
      const resetYearly = interaction.options.getBoolean('reset_yearly');
      setValue('resolutionNumbering', { prefix, format, resetYearly });
      return interaction.reply({ content: `✅ Numbering format updated: \`${format}\``, ephemeral: true });
    }
  },
};
