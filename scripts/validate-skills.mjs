#!/usr/bin/env node
/**
 * Skill frontmatter validator
 * Parses SKILL.md files, extracts YAML frontmatter, and validates against the skill schema
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.resolve(__dirname, '../schemas/skill.schema.json');

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Check for frontmatter delimiter (---)
  if (!content.startsWith('---')) {
    return { frontmatter: null, error: 'No frontmatter delimiter (---) found at start of file' };
  }
  
  // Find the closing delimiter
  const endDelimiterIndex = content.indexOf('\n---', 3);
  if (endDelimiterIndex === -1) {
    return { frontmatter: null, error: 'No closing frontmatter delimiter (---) found' };
  }
  
  // Extract YAML content between delimiters
  const yamlContent = content.slice(3, endDelimiterIndex).trim();
  
  try {
    const frontmatter = yaml.load(yamlContent);
    if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
      return { frontmatter: null, error: 'Frontmatter must be a YAML object' };
    }
    return { frontmatter, error: null };
  } catch (err) {
    return { frontmatter: null, error: `Invalid YAML in frontmatter: ${err.message}` };
  }
}

function validateSkill(skillPath, validate, skillFolderName) {
  const { frontmatter, error } = extractFrontmatter(skillPath);
  
  if (error) {
    return { valid: false, errors: [error], frontmatter: null };
  }
  
  if (!frontmatter) {
    return { valid: false, errors: ['No frontmatter found'], frontmatter: null };
  }
  
  const valid = validate(frontmatter);
  
  const errors = [];
  if (!valid) {
    for (const err of validate.errors || []) {
      errors.push(`${err.instancePath || 'root'}: ${err.message}`);
    }
  }
  
  // Validate name matches folder name
  if (frontmatter.name && frontmatter.name !== skillFolderName) {
    errors.push(`name: skill name "${frontmatter.name}" does not match folder name "${skillFolderName}"`);
  }
  
  return { valid: errors.length === 0, errors, frontmatter };
}

function findSkillManifests(rootDir) {
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
      } else if (entry.name === 'SKILL.md') {
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
  
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  
  const manifests = findSkillManifests(rootDir);
  let allValid = true;
  
  for (const manifestPath of manifests) {
    const skillFolderName = path.basename(path.dirname(manifestPath));
    const { frontmatter, errors } = validateSkill(manifestPath, validate, skillFolderName);
    
    const relPath = path.relative(rootDir, manifestPath);
    if (errors.length === 0) {
      console.log(`✓ ${relPath}`);
    } else {
      allValid = false;
      console.log(`✗ ${relPath}`);
      for (const err of errors) {
        console.log(`  - ${err}`);
      }
    }
  }
  
  if (!allValid) {
    console.error('\nValidation failed for one or more skills');
    process.exit(1);
  } else {
    if (manifests.length === 0) {
      console.log('\nNo SKILL.md files found');
    } else {
      console.log('\nAll skills validated successfully');
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});