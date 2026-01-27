// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for resolving symlinked packages
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

config.watchFolders = [
  projectRoot,
  monorepoRoot,
];

config.resolver = {
  ...config.resolver,
  // Ensure symlinked packages are resolved correctly
  unstable_enableSymlinks: true,
  // Explicitly resolve the local package
  extraNodeModules: {
    'react-native-android-auto': path.resolve(monorepoRoot, 'react-native-android-auto'),
  },
};

module.exports = config;
