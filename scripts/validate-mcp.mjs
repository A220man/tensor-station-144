#!/usr/bin/env node
/**
 * MCP server configuration validator
 * Validates mcp.json files against the MCP schema and checks placeholder variables
 * against declared variables in plugin.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MCP_SCHEMA_PATH = path.resolve(__dirname, '../schemas/mcp.schema.json');
const PLUGIN_SCHEMA_PATH = path.resolve(__dirname, '../schemas/plugin.schema.json');

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function loadSchema(schemaPath) {
  const schema = loadJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

// Extract placeholder variables from a string (e.g., ${VAR_NAME})
function extractPlaceholders(str) {
  const placeholders = new Set();
  const regex = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    placeholders.add(match[1]);
  }
  return placeholders;
}

// Check all placeholders in mcp config against declared variables
function checkPlaceholders(mcpConfig, declaredVariables) {
  const errors = [];
  const allPlaceholders = new Set();

  // Check env vars for placeholders
  if (mcpConfig.env && typeof mcpConfig.env === 'object') {
    for (const [key, value] of Object.entries(mcpConfig.env)) {
      if (typeof value === 'string') {
        const placeholders = extractPlaceholders(value);
        for (const ph of placeholders) {
          allPlaceholders.add(ph);
        }
      }
    }
  }

  // Check args for placeholders
  if (mcpConfig.args && Array.isArray(mcpConfig.args)) {
    for (const arg of mcpConfig.args) {
      if (typeof arg === 'string') {
        const placeholders = extractPlaceholders(arg);
        for (const ph of placeholders) {
          allPlaceholders.add(ph);
        }
      }
    }
  }

  // Check command for placeholders
  if (typeof mcpConfig.command === 'string') {
    const placeholders = extractPlaceholders(mcpConfig.command);
    for (const ph of placeholders) {
      allPlaceholders.add(ph);
    }
  }

  // Check url for placeholders
  if (typeof mcpConfig.url === 'string') {
    const placeholders = extractPlaceholders(mcpConfig.url);
    for (const ph of placeholders) {
      allPlaceholders.add(ph);
    }
  }

  // Check headers for placeholders
  if (mcpConfig.headers && typeof mcpConfig.headers === 'object') {
    for (const [key, value] of Object.entries(mcpConfig.headers)) {
      if (typeof value === 'string') {
        const placeholders = extractPlaceholders(value);
        for (const ph of placeholders) {
          allPlaceholders.add(ph);
        }
      }
    }
  }

  // Validate each placeholder is declared
  for (const placeholder of allPlaceholders) {
    if (!declaredVariables.has(placeholder)) {
      errors.push(`Placeholder "${placeholder}" used in mcp.json but not declared in plugin.json variables`);
    }
  }

  return errors;
}

function validateMcp(mcpPath, pluginVariables = {}) {
  const mcpConfig = loadJson(mcpPath);
  const validate = loadSchema(MCP_SCHEMA_PATH);
  const valid = validate(mcpConfig);

  const errors = [];
  if (!valid) {
    for (const err of validate.errors || []) {
      errors.push(`${err.instancePath || 'root'}: ${err.message}`);
    }
  }

  // Check placeholders against declared variables
  // Support both Set and object for pluginVariables
  const declaredVars = new Set(
    pluginVariables instanceof Set
      ? [...pluginVariables]
      : Object.keys(pluginVariables)
  );
  const placeholderErrors = checkPlaceholders(mcpConfig, declaredVars);
  errors.push(...placeholderErrors);

  return { valid: errors.length === 0, errors, config: mcpConfig };
}

function findMcpConfigs(rootDir) {
  const configs = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name === 'mcp.json') {
        configs.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return configs;
}

function findPluginManifests(rootDir) {
  const manifests = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name === 'plugin.json') {
        manifests.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return manifests;
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');

  console.log('Validating MCP configurations...\n');

  // First, find all plugin manifests to get declared variables
  const pluginManifests = findPluginManifests(rootDir);
  const pluginVariables = new Map(); // pluginDir -> Set of variable names

  for (const pluginPath of pluginManifests) {
    const pluginDir = path.dirname(pluginPath);
    const plugin = loadJson(pluginPath);
    if (plugin.variables && typeof plugin.variables === 'object') {
      const vars = new Set(Object.keys(plugin.variables));
      pluginVariables.set(pluginDir, vars);
    }
  }

  // Find all mcp.json files
  const mcpConfigs = findMcpConfigs(rootDir);

  if (mcpConfigs.length === 0) {
    console.log('No mcp.json files found.');
    return;
  }

  let totalValid = 0;
  let totalInvalid = 0;

  for (const mcpPath of mcpConfigs) {
    // Find the nearest plugin.json to get variables
    let pluginDir = path.dirname(mcpPath);
    let pluginVars = new Set();

    while (pluginDir !== rootDir && pluginDir !== path.parse(pluginDir).root) {
      if (pluginVariables.has(pluginDir)) {
        pluginVars = pluginVariables.get(pluginDir);
        break;
      }
      pluginDir = path.dirname(pluginDir);
    }

    const result = validateMcp(mcpPath, pluginVars);
    const relativePath = path.relative(rootDir, mcpPath);

    if (result.valid) {
      console.log(`✓ ${relativePath}`);
      totalValid++;
    } else {
      console.log(`✗ ${relativePath}`);
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
      totalInvalid++;
    }
  }

  console.log(`\n${totalValid} valid, ${totalInvalid} invalid`);

  if (totalInvalid > 0) {
    process.exit(1);
  }
}

// Only run main if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { validateMcp, findMcpConfigs, findPluginManifests, extractPlaceholders, checkPlaceholders, loadSchema, loadJson };
