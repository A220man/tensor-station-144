#!/usr/bin/env node
/**
 * Tests for validate-mcp.mjs
 * Tests MCP config validation and placeholder checking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { validateMcp, findMcpConfigs, findPluginManifests, extractPlaceholders, checkPlaceholders, loadSchema, loadJson } from '../scripts/validate-mcp.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MCP_SCHEMA_PATH = path.resolve(__dirname, '../schemas/mcp.schema.json');
const PLUGIN_SCHEMA_PATH = path.resolve(__dirname, '../schemas/plugin.schema.json');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'validate-mcp');

function setupFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // Create a plugin with variables
  const pluginDir = path.join(FIXTURES_DIR, 'my-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      description: 'Test plugin with variables',
      variables: {
        API_KEY: { description: 'API key for the service', secret: true },
        ENDPOINT: { description: 'Service endpoint', default: 'https://api.example.com' }
      }
    }, null, 2)
  );

  // Create a valid mcp.json with placeholders
  fs.writeFileSync(
    path.join(pluginDir, 'mcp.json'),
    JSON.stringify({
      name: 'test-server',
      description: 'Test MCP server',
      command: 'node',
      args: ['server.js', '--api-key=${API_KEY}', '--endpoint=${ENDPOINT}'],
      env: {
        API_KEY: '${API_KEY}',
        CUSTOM_VAR: 'static-value'
      },
      transport: 'stdio'
    }, null, 2)
  );

  // Create a nested plugin without variables
  const nestedPluginDir = path.join(FIXTURES_DIR, 'nested', 'deep', 'nested-plugin');
  fs.mkdirSync(nestedPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(nestedPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'nested-plugin',
      version: '1.0.0',
      description: 'Nested plugin without variables'
    }, null, 2)
  );

  // Create a valid mcp.json without placeholders
  fs.writeFileSync(
    path.join(nestedPluginDir, 'mcp.json'),
    JSON.stringify({
      name: 'nested-server',
      command: 'python',
      args: ['-m', 'mcp_server'],
      env: {
        PYTHONPATH: '/usr/local/lib'
      },
      transport: 'stdio'
    }, null, 2)
  );

  // Create an mcp.json with undeclared placeholder
  const badPluginDir = path.join(FIXTURES_DIR, 'bad-plugin');
  fs.mkdirSync(badPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(badPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'bad-plugin',
      version: '1.0.0',
      description: 'Plugin with undeclared placeholder',
      variables: {
        DECLARED_VAR: { description: 'Declared variable' }
      }
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(badPluginDir, 'mcp.json'),
    JSON.stringify({
      name: 'bad-server',
      command: 'node',
      args: ['--token=${UNDECLARED_TOKEN}'],
      env: {
        TOKEN: '${UNDECLARED_TOKEN}'
      }
    }, null, 2)
  );

  // Create an mcp.json with invalid structure (missing required fields)
  const invalidPluginDir = path.join(FIXTURES_DIR, 'invalid-plugin');
  fs.mkdirSync(invalidPluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(invalidPluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'invalid-plugin',
      version: '1.0.0',
      description: 'Plugin with invalid mcp.json'
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(invalidPluginDir, 'mcp.json'),
    JSON.stringify({
      description: 'Missing name and command'
    }, null, 2)
  );

  // Create an mcp.json with invalid transport
  const invalidTransportDir = path.join(FIXTURES_DIR, 'invalid-transport');
  fs.mkdirSync(invalidTransportDir, { recursive: true });
  fs.writeFileSync(
    path.join(invalidTransportDir, 'plugin.json'),
    JSON.stringify({
      name: 'invalid-transport',
      version: '1.0.0',
      description: 'Plugin with invalid transport'
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(invalidTransportDir, 'mcp.json'),
    JSON.stringify({
      name: 'invalid-transport-server',
      command: 'node',
      transport: 'invalid-transport'
    }, null, 2)
  );
}

function cleanupFixtures() {
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  }
}

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

    // Test extractPlaceholders
    test('extractPlaceholders finds variables in strings', () => {
      const str = 'Hello ${API_KEY} and ${ENDPOINT}';
      const placeholders = extractPlaceholders(str);
      assertDeepEqual([...placeholders].sort(), ['API_KEY', 'ENDPOINT']);
    });

    test('extractPlaceholders returns empty set for no placeholders', () => {
      const str = 'no variables here';
      const placeholders = extractPlaceholders(str);
      assertEqual(placeholders.size, 0);
    });

    test('extractPlaceholders ignores malformed placeholders', () => {
      const str = '${lowercase} and ${123INVALID} and ${VALID_VAR}';
      const placeholders = extractPlaceholders(str);
      assertDeepEqual([...placeholders].sort(), ['VALID_VAR']);
    });

    // Test checkPlaceholders
    test('checkPlaceholders passes when all placeholders declared', () => {
      const mcpConfig = {
        command: 'node',
        args: ['--key=${API_KEY}'],
        env: { TOKEN: '${API_KEY}' }
      };
      const declared = new Set(['API_KEY']);
      const errors = checkPlaceholders(mcpConfig, declared);
      assertEqual(errors.length, 0);
    });

    test('checkPlaceholders fails for undeclared placeholders', () => {
      const mcpConfig = {
        command: 'node',
        args: ['--key=${UNDECLARED}'],
        env: { TOKEN: '${UNDECLARED}' }
      };
      const declared = new Set(['API_KEY']);
      const errors = checkPlaceholders(mcpConfig, declared);
      assertEqual(errors.length, 1);
      assertEqual(errors[0].includes('UNDECLARED'), true);
    });

    test('checkPlaceholders checks command, args, env, url, headers', () => {
      const mcpConfig = {
        command: '${CMD}',
        args: ['${ARG}'],
        env: { VAR: '${ENV}' },
        url: 'https://${HOST}/api',
        headers: { Authorization: 'Bearer ${TOKEN}' }
      };
      const declared = new Set(['CMD', 'ARG', 'ENV', 'HOST', 'TOKEN']);
      const errors = checkPlaceholders(mcpConfig, declared);
      assertEqual(errors.length, 0);
    });

    // Test validateMcp
    test('validateMcp validates valid mcp.json', () => {
      const mcpPath = path.join(FIXTURES_DIR, 'my-plugin', 'mcp.json');
      const pluginVars = new Set(['API_KEY', 'ENDPOINT']);
      const result = validateMcp(mcpPath, pluginVars);
      assertEqual(result.valid, true);
      assertEqual(result.errors.length, 0);
      assertEqual(result.config.name, 'test-server');
    });

    test('validateMcp fails for missing required fields', () => {
      const mcpPath = path.join(FIXTURES_DIR, 'invalid-plugin', 'mcp.json');
      const result = validateMcp(mcpPath, new Set());
      assertEqual(result.valid, false);
      assertEqual(result.errors.length > 0, true);
    });

    test('validateMcp fails for invalid transport enum', () => {
      const mcpPath = path.join(FIXTURES_DIR, 'invalid-transport', 'mcp.json');
      const result = validateMcp(mcpPath, new Set());
      assertEqual(result.valid, false);
      assertEqual(result.errors.some(e => e.includes('transport')), true);
    });

    test('validateMcp fails for undeclared placeholder', () => {
      const mcpPath = path.join(FIXTURES_DIR, 'bad-plugin', 'mcp.json');
      const pluginVars = new Set(['DECLARED_VAR']);
      const result = validateMcp(mcpPath, pluginVars);
      assertEqual(result.valid, false);
      assertEqual(result.errors.some(e => e.includes('UNDECLARED_TOKEN')), true);
    });

    test('validateMcp passes for mcp.json without plugin variables', () => {
      const mcpPath = path.join(FIXTURES_DIR, 'nested', 'deep', 'nested-plugin', 'mcp.json');
      const result = validateMcp(mcpPath, new Set());
      assertEqual(result.valid, true);
    });

    // Test findMcpConfigs
    test('findMcpConfigs finds all mcp.json files', () => {
      const manifests = findMcpConfigs(FIXTURES_DIR);
      const names = manifests.map(p => path.basename(path.dirname(p))).sort();
      assertDeepEqual(names, ['bad-plugin', 'invalid-plugin', 'invalid-transport', 'my-plugin', 'nested-plugin']);
    });

    // Test findPluginManifests
    test('findPluginManifests finds all plugin.json files', () => {
      const manifests = findPluginManifests(FIXTURES_DIR);
      const names = manifests.map(p => path.basename(path.dirname(p))).sort();
      assertDeepEqual(names, ['bad-plugin', 'invalid-plugin', 'invalid-transport', 'my-plugin', 'nested-plugin']);
    });

    // Test loadSchema
    test('loadSchema returns a validator function', () => {
      const validate = loadSchema(MCP_SCHEMA_PATH);
      assertEqual(typeof validate, 'function');
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
