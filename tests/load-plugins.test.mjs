#!/usr/bin/env node
/**
 * Tests for load-plugins.mjs
 * Tests symlink resolution and plugin discovery
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPlugins, discoverPluginsRecursive, resolveSymlink, isPluginDir, loadPluginManifest } from '../scripts/load-plugins.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'load-plugins');

function setupFixtures() {
  // Clean up any existing fixtures
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // Create a real plugin directory
  const realPluginDir = path.join(FIXTURES_DIR, 'real-plugin');
  fs.mkdirSync(realPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(realPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'real-plugin',
      version: '1.0.0',
      description: 'A real plugin directory',
      displayName: 'Real Plugin'
    }, null, 2)
  );

  // Create another real plugin
  const anotherPluginDir = path.join(FIXTURES_DIR, 'another-plugin');
  fs.mkdirSync(anotherPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(anotherPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'another-plugin',
      version: '2.0.0',
      description: 'Another real plugin',
      displayName: 'Another Plugin'
    }, null, 2)
  );

  // Create a symlink to the real plugin
  const symlinkPlugin = path.join(FIXTURES_DIR, 'symlinked-plugin');
  fs.symlinkSync(realPluginDir, symlinkPlugin, 'dir');

  // Create a nested structure with a symlink
  const nestedDir = path.join(FIXTURES_DIR, 'nested', 'deep');
  fs.mkdirSync(nestedDir, { recursive: true });
  const nestedPluginDir = path.join(nestedDir, 'nested-plugin');
  fs.mkdirSync(nestedPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(nestedPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'nested-plugin',
      version: '1.5.0',
      description: 'A nested plugin',
      displayName: 'Nested Plugin'
    }, null, 2)
  );

  // Symlink to nested plugin
  const symlinkNested = path.join(FIXTURES_DIR, 'symlink-to-nested');
  fs.symlinkSync(nestedPluginDir, symlinkNested, 'dir');

  // Create a directory without plugin.json (should be ignored)
  const noPluginDir = path.join(FIXTURES_DIR, 'no-plugin');
  fs.mkdirSync(noPluginDir, { recursive: true });
  fs.writeFileSync(path.join(noPluginDir, 'README.md'), 'Not a plugin');

  // Create a broken symlink
  const brokenSymlink = path.join(FIXTURES_DIR, 'broken-symlink');
  fs.symlinkSync('/nonexistent/path', brokenSymlink, 'dir');

  // Create a symlink to a file (not a directory)
  const fileTarget = path.join(FIXTURES_DIR, 'some-file.txt');
  fs.writeFileSync(fileTarget, 'just a file');
  const symlinkToFile = path.join(FIXTURES_DIR, 'symlink-to-file');
  fs.symlinkSync(fileTarget, symlinkToFile, 'file');
}

function cleanupFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
}

// Run tests
async function runTests() {
  setupFixtures();

  try {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
      try {
        fn();
        console.log('✓ ' + name);
        passed++;
      } catch (err) {
        console.log('✗ ' + name);
        console.log('  - ' + err.message);
        failed++;
      }
    }

    function assertEqual(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }

    function assertDeepEqual(actual, expected, msg) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(`${msg}: expected ${e}, got ${a}`);
      }
    }

    // Test resolveSymlink
    test('resolveSymlink returns real path for symlink', () => {
      const symlink = path.join(FIXTURES_DIR, 'symlinked-plugin');
      const resolved = resolveSymlink(symlink);
      const expected = fs.realpathSync(path.join(FIXTURES_DIR, 'real-plugin'));
      assertEqual(resolved, expected);
    });

    test('resolveSymlink returns original path for non-symlink', () => {
      const dir = path.join(FIXTURES_DIR, 'real-plugin');
      const resolved = resolveSymlink(dir);
      assertEqual(resolved, fs.realpathSync(dir));
    });

    test('resolveSymlink handles broken symlink', () => {
      const broken = path.join(FIXTURES_DIR, 'broken-symlink');
      const resolved = resolveSymlink(broken);
      // Should return original path when realpath fails
      assertEqual(resolved, broken);
    });

    // Test isPluginDir
    test('isPluginDir returns true for directory with plugin.json', () => {
      const dir = path.join(FIXTURES_DIR, 'real-plugin');
      assertEqual(isPluginDir(dir), true);
    });

    test('isPluginDir returns false for directory without plugin.json', () => {
      const dir = path.join(FIXTURES_DIR, 'no-plugin');
      assertEqual(isPluginDir(dir), false);
    });

    test('isPluginDir returns false for non-existent path', () => {
      const dir = path.join(FIXTURES_DIR, 'nonexistent');
      assertEqual(isPluginDir(dir), false);
    });

    // Test loadPluginManifest
    test('loadPluginManifest loads valid plugin.json', () => {
      const dir = path.join(FIXTURES_DIR, 'real-plugin');
      const manifest = loadPluginManifest(dir);
      assertEqual(manifest.name, 'real-plugin');
      assertEqual(manifest.version, '1.0.0');
      assertEqual(manifest.description, 'A real plugin directory');
    });

    test('loadPluginManifest returns null for missing plugin.json', () => {
      const dir = path.join(FIXTURES_DIR, 'no-plugin');
      const manifest = loadPluginManifest(dir);
      assertEqual(manifest, null);
    });

    // Test discoverPlugins (non-recursive)
    test('discoverPlugins finds real plugin directories', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      const names = plugins.map(p => p.name).sort();
      // Finds real-plugin, another-plugin, and nested-plugin (via symlink-to-nested)
      assertDeepEqual(names, ['another-plugin', 'nested-plugin', 'real-plugin']);
    });

    test('discoverPlugins resolves symlinks to plugins not present as real directories', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      // symlink-to-nested points to nested-plugin which is not a direct child
      const symlinked = plugins.find(p => p.path.includes('symlink-to-nested'));
      assertEqual(symlinked !== undefined, true);
      assertEqual(symlinked.name, 'nested-plugin');
      assertEqual(symlinked.isSymlink, true);
      assertEqual(symlinked.realPath, fs.realpathSync(path.join(FIXTURES_DIR, 'nested', 'deep', 'nested-plugin')));
    });

    test('discoverPlugins does not duplicate plugins when symlink points to same real path', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      const realPluginCount = plugins.filter(p => p.name === 'real-plugin').length;
      assertEqual(realPluginCount, 1);
    });

    test('discoverPlugins ignores directories without plugin.json', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      const noPlugin = plugins.find(p => p.name === 'no-plugin');
      assertEqual(noPlugin, undefined);
    });

    test('discoverPlugins ignores broken symlinks', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      const broken = plugins.find(p => p.path.includes('broken-symlink'));
      assertEqual(broken, undefined);
    });

    test('discoverPlugins ignores symlinks to files', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      const symlinkToFile = plugins.find(p => p.path.includes('symlink-to-file'));
      assertEqual(symlinkToFile, undefined);
    });

    test('discoverPlugins returns correct path and realPath for resolved symlinks', () => {
      const plugins = discoverPlugins(FIXTURES_DIR);
      // symlink-to-nested points to nested-plugin which is not a direct child
      const symlinked = plugins.find(p => p.name === 'nested-plugin' && p.isSymlink);
      assertEqual(symlinked !== undefined, true);
      assertEqual(symlinked.path, path.join(FIXTURES_DIR, 'symlink-to-nested'));
      assertEqual(symlinked.realPath, fs.realpathSync(path.join(FIXTURES_DIR, 'nested', 'deep', 'nested-plugin')));
    });

    // Test discoverPluginsRecursive
    test('discoverPluginsRecursive finds nested plugins', () => {
      const plugins = discoverPluginsRecursive(FIXTURES_DIR);
      const names = plugins.map(p => p.name).sort();
      assertDeepEqual(names, ['another-plugin', 'nested-plugin', 'real-plugin']);
    });

    test('discoverPluginsRecursive finds plugins via symlinks when real dir not walked first', () => {
      const plugins = discoverPluginsRecursive(FIXTURES_DIR);
      // The nested-plugin is found via its real directory (walked first)
      // The symlink symlink-to-nested is not added due to deduplication
      const nested = plugins.find(p => p.name === 'nested-plugin');
      assertEqual(nested !== undefined, true);
      assertEqual(nested.isSymlink, false); // Found via real directory
      assertEqual(nested.path, path.join(FIXTURES_DIR, 'nested', 'deep', 'nested-plugin'));
    });

    test('discoverPluginsRecursive does not duplicate plugins', () => {
      const plugins = discoverPluginsRecursive(FIXTURES_DIR);
      const nestedCount = plugins.filter(p => p.name === 'nested-plugin').length;
      assertEqual(nestedCount, 1);
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    cleanupFixtures();
  }
}

runTests();
