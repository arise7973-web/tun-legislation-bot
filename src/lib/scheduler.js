// scheduler.js
// Checks every minute whether any resolution's debate period or voting
// period(s) have run out, and automatically advances them to the next
// stage. This works even if the bot restarts, because it reads timestamps
// saved in resolutions.json rather than relying on setTimeout.

const { getAllResolutions } = require('./resolutions');
const { openVoting, closeVoting, closeOverrideVote } = require('./voting');

function startScheduler(client) {
  setInterval(async () => {
    try {
      const resolutions = getAllResolutions();
      const now = Date.now();

      for (const resolution of resolutions) {
        if (resolution.status === 'Debate' && resolution.debate && !resolution.debate.closed && now >= resolution.debate.endsAt) {
          resolution.debate.closed = true;
          await openVoting(client, resolution);
          continue;
        }

        if (resolution.status === 'Voting' && resolution.tracks) {
          for (const body of ['GA', 'SC']) {
            const track = resolution.tracks[body];
            if (track && !track.closed && now >= track.endsAt) {
              await closeVoting(client, resolution, body);
            }
          }
          continue;
        }

        if (
          resolution.status === 'Veto Override Vote' &&
          resolution.tracks &&
          resolution.tracks.OVERRIDE &&
          !resolution.tracks.OVERRIDE.closed &&
          now >= resolution.tracks.OVERRIDE.endsAt
        ) {
          await closeOverrideVote(client, resolution);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  }, 60 * 1000); // check every 60 seconds
}

module.exports = { startScheduler };
