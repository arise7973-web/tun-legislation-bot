// storage.js
// This file is our "database". Instead of a complicated database program,
// we save everything as simple .json files inside the /data folder.
//
// This layer is self-healing: it creates the /data folder and any missing
// or corrupted JSON files automatically, seeding them with sensible
// defaults. This matters a lot on hosts like Railway, where a freshly
// mounted persistent volume starts completely EMPTY (it replaces whatever
// was in the repo's data/ folder) - without this, the bot would crash with
// "ENOENT: no such file or directory" on first boot after attaching a
// volume. It also means that whenever a future update adds a new config
// setting, existing config.json files quietly pick up the new default
// instead of needing to be hand-edited.

const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('./defaultConfig');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Recursively fills in anything `current` is missing using `defaults`,
// while always keeping whatever `current` already has. Builds entirely new
// objects/arrays at every level, so nothing ends up sharing a reference
// with the defaults template (which would risk one config's edits leaking
// into another's, or into the template itself).
function deepMergeWithDefaults(defaults, current) {
  if (!isPlainObject(defaults)) {
    if (current !== undefined) return current;
    return Array.isArray(defaults) ? [...defaults] : defaults;
  }

  const result = {};
  const keys = new Set([...Object.keys(defaults), ...(isPlainObject(current) ? Object.keys(current) : [])]);

  for (const key of keys) {
    const defaultVal = defaults[key];
    const currentVal = isPlainObject(current) ? current[key] : undefined;

    if (isPlainObject(defaultVal)) {
      result[key] = deepMergeWithDefaults(defaultVal, currentVal);
    } else if (currentVal !== undefined) {
      result[key] = currentVal;
    } else {
      result[key] = Array.isArray(defaultVal) ? [...defaultVal] : defaultVal;
    }
  }

  return result;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created missing data directory at ${DATA_DIR}`);
  }
}

// Reads a JSON file from /data. If it's missing, empty, or corrupted, it is
// (re)created with `defaultValue` instead of throwing - pass the shape you
// want that file to default to (e.g. [] for a list, {} for a map).
function readJSON(filename, defaultValue = null) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    if (defaultValue !== null) {
      writeJSON(filename, defaultValue);
      console.log(`${filename} was missing - created it with default values.`);
    }
    return defaultValue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    if (defaultValue !== null) writeJSON(filename, defaultValue);
    return defaultValue;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`${filename} contained invalid JSON and could not be read - resetting it to default values:`, err.message);
    if (defaultValue !== null) writeJSON(filename, defaultValue);
    return defaultValue;
  }
}

function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// config.json gets special handling: rather than just seeding it once, we
// deep-merge it against the full default shape on every read. That means a
// missing file gets created from scratch, and an existing file automatically
// gains any new settings a future update adds, without losing anything the
// admin already configured.
function readConfig() {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, 'config.json');

  let current = null;
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.trim()) {
      try {
        current = JSON.parse(raw);
      } catch (err) {
        console.error('config.json contained invalid JSON and could not be read - rebuilding it from defaults:', err.message);
        current = null;
      }
    }
  }

  const merged = deepMergeWithDefaults(getDefaultConfig(), current || {});

  // Only write back to disk if something actually changed (file was
  // missing/empty/corrupted, or defaults just filled in a new setting) -
  // avoids needless disk writes on every single read.
  const changed = !current || JSON.stringify(current) !== JSON.stringify(merged);
  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
    if (!current) console.log('config.json was missing - created it with default values.');
  }

  return merged;
}

function writeConfig(config) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

// Called once at startup so every expected file exists right away (and gets
// logged), rather than being created lazily on whatever command happens to
// touch it first.
function initializeDataFiles() {
  ensureDataDir();
  readConfig();
  readJSON('resolutions.json', []);
  readJSON('templates.json', []);
  readJSON('counters.json', {});
}

module.exports = { readJSON, writeJSON, readConfig, writeConfig, initializeDataFiles, ensureDataDir };
