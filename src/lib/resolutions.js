// resolutions.js
// Helper functions to read/write resolutions (data/resolutions.json)
// and templates (data/templates.json).

const { readJSON, writeJSON } = require('./storage');

// A resolution counts as "active" (still in progress, not yet finished)
// if its status is one of these. Used to enforce "one resolution at a time
// per member" and for autocomplete filtering.
const ACTIVE_STATUSES = [
  'Draft',
  'Awaiting Sponsors',
  'Under Administrative Review',
  'Returned for Revision',
  'Debate',
  'Voting',
  'Veto Override Vote',
];

function findActiveResolutionByMember(userId) {
  return getAllResolutions().find((r) => r.submittedBy === userId && ACTIVE_STATUSES.includes(r.status)) || null;
}

function getAllResolutions() {
  return readJSON('resolutions.json') || [];
}

function saveAllResolutions(list) {
  writeJSON('resolutions.json', list);
}

function findResolution(number) {
  return getAllResolutions().find((r) => r.number === number) || null;
}

function upsertResolution(resolution) {
  const list = getAllResolutions();
  const idx = list.findIndex((r) => r.number === resolution.number);
  if (idx === -1) list.push(resolution);
  else list[idx] = resolution;
  saveAllResolutions(list);
  return resolution;
}

function getAllTemplates() {
  return readJSON('templates.json') || [];
}

function saveAllTemplates(list) {
  writeJSON('templates.json', list);
}

function findTemplate(name) {
  return getAllTemplates().find((t) => t.name.toLowerCase() === name.toLowerCase()) || null;
}

module.exports = {
  getAllResolutions,
  saveAllResolutions,
  findResolution,
  upsertResolution,
  getAllTemplates,
  saveAllTemplates,
  findTemplate,
  ACTIVE_STATUSES,
  findActiveResolutionByMember,
};
