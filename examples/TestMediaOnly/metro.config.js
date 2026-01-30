const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot, monorepoRoot];
config.resolver = {
  ...config.resolver,
  unstable_enableSymlinks: true,
  extraNodeModules: {
    'react-native-car-projection': path.resolve(monorepoRoot, 'react-native-car-projection'),
  },
};

module.exports = config;
