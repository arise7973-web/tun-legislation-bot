// defaultConfig.js
// The full "shape" of config.json with sensible defaults. Used two ways:
//   1. To create a brand-new config.json from scratch (e.g. on a fresh
//      Railway volume that starts completely empty).
//   2. To fill in any settings a saved config.json is missing - so when a
//      future update adds a new setting, existing configs pick it up
//      automatically instead of needing to be hand-edited.
//
// getDefaultConfig() returns a brand-new copy every time it's called, so
// nothing accidentally shares/mutates the same nested objects.
function getDefaultConfig() {
  return {
    roles: {
      admin: [],
      gaVoter: [],
      sponsorEligible: [],
      gaReviewer: [],
    },
    channels: {
      review: '',
      debate: '',
      voting: '',
      archive: '',
      audit: '',
      notifications: '',
    },
    voteWeights: {},
    quorumPercent: 50,
    majorityPercent: 50,
    supermajorityPercent: 66.7,
    debateDurationMinutes: 1440,
    votingDurationMinutes: 1440,
    sponsorsRequired: 2,
    allowVoteChanges: true,
    publicVoting: true,
    liveResultsDuringVote: true,
    dmNotifications: true,
    oneResolutionPerMember: true,
    amendments: {
      enabled: true,
      debateDurationMinutes: 360,
      votingDurationMinutes: 360,
      quorumPercent: 50,
      majorityPercent: 50,
    },
    resolutionNumbering: {
      prefix: 'UNGA',
      format: '{prefix}/{year}/{seq}',
      resetYearly: true,
    },
    securityCouncil: {
      roles: {
        member: [],
        permanentMember: [],
        reviewer: [],
      },
      channels: {
        review: '',
        debate: '',
        voting: '',
        archive: '',
      },
      quorumPercent: 50,
      majorityPercent: 50,
      supermajorityPercent: 66.7,
      debateDurationMinutes: 1440,
      votingDurationMinutes: 1440,
      veto: {
        enabled: true,
        immediatelyTerminates: true,
        allowOverride: false,
        overrideThresholdPercent: 66.7,
        overrideVotingDurationMinutes: 1440,
      },
    },
  };
}

module.exports = { getDefaultConfig };
