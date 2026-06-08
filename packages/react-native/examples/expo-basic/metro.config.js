// metro.config.js — required for local file: symlinks to work in Expo Go.
// Both @relaya-chat/react-native and @relaya-chat/core are installed via
// "file:" references, which npm resolves as symlinks. Metro doesn't follow
// symlinks that point outside the project root unless they are listed here.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Resolve the physical locations of the two symlinked packages.
const rnPackageRoot = path.resolve(projectRoot, '../../');         // sdk/packages/react-native/
const corePackageRoot = path.resolve(projectRoot, '../../../core'); // sdk/packages/core/

const config = getDefaultConfig(projectRoot);

config.watchFolders = [rnPackageRoot, corePackageRoot];

// When Metro processes files from watchFolders outside the project root,
// it resolves their dependencies relative to those external paths — missing
// @babel/runtime and other Expo/RN transitive deps that live in the app's
// own node_modules. Listing the app's node_modules here tells Metro to also
// look here when resolving modules from the watched external packages.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
