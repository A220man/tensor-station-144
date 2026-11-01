#!/usr/bin/env node
/**
 * Plugin loader with symlink resolution
 * Discovers plugins in a directory, resolving symlinks to find actual plugin manifests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves a path, following symlinks to their real path.
 * Returns the real path if it exists, otherwise the original path.
 */
function resolveSymlink(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Checks if a directory is a valid plugin directory by looking for plugin.json
 */
function isPluginDir(dirPath) {
  try {
    const pluginJsonPath = path.join(dirPath, 'plugin.json');
    return fs.existsSync(pluginJsonPath) && fs.statSync(pluginJsonPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Loads plugin manifest from a directory
 */
function loadPluginManifest(pluginDir) {
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  try {
    const content = fs.readFileSync(pluginJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Discovers plugins in a root directory, resolving symlinks.
 * Returns an array of plugin objects with resolved paths.
 */
function discoverPlugins(rootDir) {
  const plugins = [];
  const seenRealPaths = new Set();

  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return plugins;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    // Skip hidden directories and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    let realPath = entryPath;
    let isSymlink = false;

    // Resolve symlink if it's a symlink
    if (entry.isSymbolicLink()) {
      isSymlink = true;
      realPath = resolveSymlink(entryPath);
    } else if (entry.isDirectory()) {
      realPath = resolveSymlink(entryPath);
    }

    // Check if the resolved path is a valid plugin directory
    if (fs.existsSync(realPath) && fs.statSync(realPath).isDirectory() && isPluginDir(realPath)) {
      const realPathStr = fs.realpathSync(realPath);

      // Avoid duplicates (multiple symlinks pointing to same real plugin)
      if (seenRealPaths.has(realPathStr)) {
        continue;
      }
      seenRealPaths.add(realPathStr);

      const manifest = loadPluginManifest(realPath);
      if (manifest) {
        plugins.push({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          displayName: manifest.displayName,
          path: entryPath,           // Original path (may be symlink)
          realPath: realPathStr,     // Resolved real path
          isSymlink,
          manifest
        });
      }
    }
  }

  return plugins;
}

/**
 * Discovers plugins recursively in a directory tree, resolving symlinks.
 * Useful for finding plugins in nested structures.
 */
function discoverPluginsRecursive(rootDir) {
  const plugins = [];
  const seenRealPaths = new Set();

  function walk(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      // Skip hidden directories and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory() || entry.isSymbolicLink()) {
        let realPath = entryPath;
        let isSymlink = false;

        if (entry.isSymbolicLink()) {
          isSymlink = true;
          realPath = resolveSymlink(entryPath);
        } else {
          realPath = resolveSymlink(entryPath);
        }

        if (fs.existsSync(realPath) && fs.statSync(realPath).isDirectory()) {
          const realPathStr = fs.realpathSync(realPath);

          // Check if this directory contains a plugin.json
          if (isPluginDir(realPath)) {
            if (seenRealPaths.has(realPathStr)) {
              continue;
            }
            seenRealPaths.add(realPathStr);

            const manifest = loadPluginManifest(realPath);
            if (manifest) {
              plugins.push({
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                displayName: manifest.displayName,
                path: entryPath,
                realPath: realPathStr,
                isSymlink,
                manifest
              });
            }
          } else {
            // Recurse into subdirectories
            walk(realPath);
          }
        }
      }
    }
  }

  walk(rootDir);
  return plugins;
}

async function main() {
  const args = process.argv.slice(2);
  const rootDir = args[0] ? path.resolve(args[0]) : path.resolve(__dirname, '..');
  const recursive = args.includes('--recursive') || args.includes('-r');

  console.log(`Discovering plugins in: ${rootDir}`);
  console.log(`Recursive: ${recursive}\n`);

  const plugins = recursive
    ? discoverPluginsRecursive(rootDir)
    : discoverPlugins(rootDir);

  if (plugins.length === 0) {
    console.log('No plugins found.');
    return;
  }

  for (const plugin of plugins) {
    console.log(`Plugin: ${plugin.name} (${plugin.version})`);
    console.log(`  Display Name: ${plugin.displayName || plugin.name}`);
    console.log(`  Description: ${plugin.description}`);
    console.log(`  Path: ${plugin.path}`);
    console.log(`  Real Path: ${plugin.realPath}`);
    console.log(`  Is Symlink: ${plugin.isSymlink ? 'Yes' : 'No'}`);
    console.log('');
  }

  console.log(`Total: ${plugins.length} plugin(s) found.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

export { discoverPlugins, discoverPluginsRecursive, resolveSymlink, isPluginDir, loadPluginManifest };
