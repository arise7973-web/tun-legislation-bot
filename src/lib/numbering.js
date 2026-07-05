// numbering.js
// Generates the next official resolution number, e.g. UNGA/2026/001
// based on the format the admin configured.

const { readJSON, writeJSON } = require('./storage');

function nextResolutionNumber(config) {
  const counters = readJSON('counters.json', {}) || {};
  const { prefix, format, resetYearly } = config.resolutionNumbering;
  const year = new Date().getFullYear();
  const key = resetYearly ? `${prefix}-${year}` : `${prefix}`;

  const seq = (counters[key] || 0) + 1;
  counters[key] = seq;
  writeJSON('counters.json', counters);

  const padded = String(seq).padStart(3, '0');
  const number = format
    .replace('{prefix}', prefix)
    .replace('{year}', String(year))
    .replace('{seq}', padded);

  return number;
}

module.exports = { nextResolutionNumber };
