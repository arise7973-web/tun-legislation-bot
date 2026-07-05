// mentions.js
// Builds the optional @everyone / @role mention prefix used on important
// public announcements (debate opened, voting opened, results announced),
// based on admin-configured settings. Returns '' (no mention) whenever
// mentions are disabled, or nothing is configured for the relevant body.

function getMentionPrefix(config, body) {
  const settings = config.announcements;
  if (!settings || !settings.mentionsEnabled) return '';

  const bodies = body === 'Both' ? ['GA', 'SC'] : [body || 'GA'];
  const prefixes = new Set();

  for (const b of bodies) {
    const target = b === 'SC' ? settings.sc : settings.ga;
    if (!target || target.mentionType === 'none') continue;
    if (target.mentionType === 'everyone') prefixes.add('@everyone');
    else if (target.mentionType === 'role' && target.roleId) prefixes.add(`<@&${target.roleId}>`);
  }

  return prefixes.size ? `${[...prefixes].join(' ')} ` : '';
}

module.exports = { getMentionPrefix };
