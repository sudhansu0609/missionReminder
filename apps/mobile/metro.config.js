// Metro has to be told about the workspace: the shared packages live outside
// this app's folder, and their dependencies resolve from the repo root.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays ON. npm does not always hoist to the repo root --
// expo-modules-core, for one, lands inside expo's own node_modules -- and
// without the upward walk Metro cannot see anything npm chose to nest.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
