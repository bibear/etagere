// Expo's default Metro config (monorepo-aware), ignoring macOS AppleDouble files (`._*`).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const appleDouble = /(^|[\\/])\._[^\\/]*$/;
const previous = config.resolver.blockList;
config.resolver.blockList = previous
  ? [...(Array.isArray(previous) ? previous : [previous]), appleDouble]
  : [appleDouble];

module.exports = config;
