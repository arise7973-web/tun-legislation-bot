// config.js
// Lets other files easily read or change settings in config.json
// using a simple "dot path" like "roles.admin" or "quorumPercent".

const { readConfig, writeConfig } = require('./storage');

function getConfig() {
  return readConfig();
}

function getValue(pathStr) {
  const config = readConfig();
  return pathStr.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), config);
}

function setValue(pathStr, value) {
  const config = readConfig();
  const keys = pathStr.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof obj[keys[i]] !== 'object' || obj[keys[i]] === null) {
      obj[keys[i]] = {};
    }
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  writeConfig(config);
  return config;
}

module.exports = { getConfig, getValue, setValue };
