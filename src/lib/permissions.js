// permissions.js
// Simple helper functions to check whether a member is allowed to do something.
// Each "role" setting can hold either a single role ID (old configs) or a
// list of role IDs (current configs, so an alliance can have e.g. multiple
// Admin roles) - toArray() below normalizes either shape.

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hasAnyRole(member, roleIdsOrId) {
  return toArray(roleIdsOrId).some((id) => member.roles.cache.has(id));
}

function isAdmin(member, config) {
  if (member.permissions.has('Administrator')) return true; // Server admins can always use the bot.
  return hasAnyRole(member, config.roles.admin);
}

function isEligibleVoter(member, config) {
  return hasAnyRole(member, config.roles.gaVoter);
}

function isSponsorEligible(member, config) {
  const roles = toArray(config.roles.sponsorEligible);
  if (roles.length === 0) return true; // If not configured, anyone can sponsor.
  return hasAnyRole(member, roles);
}

function isSCMember(member, config) {
  return hasAnyRole(member, config.securityCouncil.roles.member);
}

function isSCPermanentMember(member, config) {
  return hasAnyRole(member, config.securityCouncil.roles.permanentMember);
}

// Who may approve/reject/return a resolution at the review stage depends on
// which body it belongs to: General Assembly resolutions are reviewed by
// the configured GA reviewer role(s) (e.g. GA President), Security Council
// resolutions by the configured SC reviewer role(s) (e.g. UNSC Chair). A
// resolution requiring Both may be reviewed by either. Admins can always
// review anything, regardless of body.
function isReviewer(member, config, body) {
  if (isAdmin(member, config)) return true;
  if (body === 'SC') return hasAnyRole(member, config.securityCouncil.roles.reviewer);
  if (body === 'Both') {
    return hasAnyRole(member, config.roles.gaReviewer) || hasAnyRole(member, config.securityCouncil.roles.reviewer);
  }
  return hasAnyRole(member, config.roles.gaReviewer); // GA (default)
}

// Looks at all of a member's roles and finds the highest configured vote weight.
// If none of their roles have a configured weight, they get 1 vote by default.
function getVoteWeight(member, config) {
  const weights = config.voteWeights || {};
  let best = null;
  for (const [roleId, weight] of Object.entries(weights)) {
    if (member.roles.cache.has(roleId)) {
      if (best === null || weight > best) best = weight;
    }
  }
  return best === null ? 1 : best;
}

module.exports = { isAdmin, isEligibleVoter, isSponsorEligible, isSCMember, isSCPermanentMember, isReviewer, getVoteWeight, toArray, hasAnyRole };
