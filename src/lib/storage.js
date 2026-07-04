// storage.js
// This file is our "database". Instead of a complicated database program,
// we save everything as simple .json files inside the /data folder.
// Every time we need to read or save data, we use the functions below.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ROOT_DIR = path.join(__dirname, '..', '..');

function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim() ? JSON.parse(raw) : null;
}

function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readConfig() {
  const filePath = path.join(ROOT_DIR, 'config.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(config) {
  const filePath = path.join(ROOT_DIR, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { readJSON, writeJSON, readConfig, writeConfig };
