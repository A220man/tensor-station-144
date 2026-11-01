#!/usr/bin/env node
/**
 * Plugin manifest validator
 * Validates plugin.json files against the plugin schema
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.resolve(__dirname, '../schemas/plugin.schema.json');
const MARKETPLACE_PATH = path.resolve(__dirname, '../.cursor-plugin/marketplace.json');

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function validatePlugin(pluginPath, schema, marketplace) {
  const plugin = loadJson(pluginPath);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(plugin);

  const errors = [];
  if (!valid) {
    for (const err of validate.errors || []) {
      errors.push(`${err.instancePath || 'root'}: ${err.message}`);
    }
  }

  // Check name matches marketplace entry if marketplace exists
  if (marketplace && plugin.name) {
    const entry = marketplace.plugins?.find(p => p.name === plugin.name);
    if (!entry) {
      errors.push(`root: plugin name "${plugin.name}" not found in marketplace.json`);
    }
  }

  // Check that declared component paths exist
  const pluginDir = path.dirname(pluginPath);
  const pathChecks = [
    { field: 'skills', type: 'directory' },
    { field: 'agents', type: 'directory' },
    { field: 'commands', type: 'directory' },
    { field: 'hooks', type: 'file' },
    { field: 'mcpServers', type: 'file' },
    { field: 'logo', type: 'file', isArray: false },
    { field: 'icon', type: 'file', isArray: false }
  ];

  for (const check of pathChecks) {
    const paths = plugin[check.field];
    if (!paths) continue;
    
    // Handle both arrays (skills, agents, etc.) and strings (logo, icon)
    const pathArray = Array.isArray(paths) ? paths : [paths];
    for (const relPath of pathArray) {
      const fullPath = path.join(pluginDir, relPath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`${check.field}: path "${relPath}" does not exist (expected at ${fullPath})`);
      } else if (check.type === 'directory' && !fs.statSync(fullPath).isDirectory()) {
        errors.push(`${check.field}: path "${relPath}" exists but is not a directory`);
      } else if (check.type === 'file' && !fs.statSync(fullPath).isFile()) {
        errors.push(`${check.field}: path "${relPath}" exists but is not a file`);
      }
    }
  }

  return { valid: errors.length === 0, errors, plugin };
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
  const schema = loadJson(SCHEMA_PATH);
  let marketplace = null;

  if (fs.existsSync(MARKETPLACE_PATH)) {
    marketplace = loadJson(MARKETPLACE_PATH);
  }

  const manifests = findPluginManifests(rootDir);
  let allValid = true;

  for (const manifestPath of manifests) {
    const result = validatePlugin(manifestPath, schema, marketplace);

    const relPath = path.relative(rootDir, manifestPath);
    if (result.valid) {
      console.log(`✓ ${relPath}`);
    } else {
      allValid = false;
      console.log(`✗ ${relPath}`);
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
  }

  if (!allValid) {
    console.error('\nValidation failed for one or more plugins');
    process.exit(1);
  } else {
    console.log('\nAll plugins validated successfully');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});