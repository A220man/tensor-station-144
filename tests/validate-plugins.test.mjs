#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, "../schemas/plugin.schema.json");
const TEST_FIXTURES_DIR = path.resolve(__dirname, "..");

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
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
    { field: 'logo', type: 'file' },
    { field: 'icon', type: 'file' }
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

function runSchemaTests() {
  const schema = loadJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let passed = 0;
  let failed = 0;

  function test(name, plugin, shouldPass) {
    const valid = validate(plugin);
    const passed_ = valid === shouldPass;
    if (passed_) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      if (!valid) {
        for (const err of validate.errors || []) {
          console.log("  - " + (err.instancePath || "root") + ": " + err.message);
        }
      }
      failed++;
    }
  }

  test("valid minimal plugin", { name: "test-plugin", version: "1.0.0", description: "A test plugin" }, true);
  test("valid full plugin", { name: "full-plugin", displayName: "Full Plugin", version: "2.1.0", description: "A full featured plugin", author: "Test Author", repository: "https://github.com/test/full-plugin", license: "MIT", skills: ["skills/skill1"], agents: ["agents/agent1"], commands: ["commands/cmd1"], hooks: ["hooks/hooks.json"], mcpServers: ["mcp/server.json"], variables: { API_KEY: { description: "API key", secret: true } }, logo: "assets/logo.png", icon: "assets/icon.png" }, true);
  test("missing name", { version: "1.0.0", description: "Missing name" }, false);
  test("missing version", { name: "test-plugin", description: "Missing version" }, false);
  test("missing description", { name: "test-plugin", version: "1.0.0" }, false);
  test("name with uppercase", { name: "Test-Plugin", version: "1.0.0", description: "Invalid" }, false);
  test("name with spaces", { name: "test plugin", version: "1.0.0", description: "Invalid" }, false);
  test("name starting with hyphen", { name: "-test-plugin", version: "1.0.0", description: "Invalid" }, false);
  test("name ending with hyphen", { name: "test-plugin-", version: "1.0.0", description: "Invalid" }, false);
  test("invalid version format", { name: "test-plugin", version: "1.0", description: "Invalid" }, false);
  test("version with letters", { name: "test-plugin", version: "1.0.0-alpha", description: "Invalid" }, false);
  test("description over 1024 chars", { name: "test-plugin", version: "1.0.0", description: "a".repeat(1025) }, false);
  test("variable name lowercase", { name: "test-plugin", version: "1.0.0", description: "Test", variables: { api_key: { description: "Lowercase" } } }, false);
  test("invalid repository URI", { name: "test-plugin", version: "1.0.0", description: "Test", repository: "not-a-uri" }, false);
  test("additional properties rejected", { name: "test-plugin", version: "1.0.0", description: "Test", unknownField: "value" }, false);
  test("name single char", { name: "a", version: "1.0.0", description: "Test" }, true);
  test("name with dot", { name: "test.plugin", version: "1.0.0", description: "Test" }, true);
  test("name with hyphen", { name: "test-plugin", version: "1.0.0", description: "Test" }, true);
  test("name with numbers", { name: "test123", version: "1.0.0", description: "Test" }, true);

  console.log("\nSchema tests: " + passed + " passed, " + failed + " failed");
  return failed === 0;
}

function runPathTests() {
  const schema = loadJson(SCHEMA_PATH);
  let passed = 0;
  let failed = 0;

  function test(name, pluginPath, marketplace, shouldPass) {
    const result = validatePlugin(pluginPath, schema, marketplace);
    const passed_ = result.valid === shouldPass;
    if (passed_) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      console.log("  Expected valid:", shouldPass, "got:", result.valid);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.log("  - " + err);
        }
      }
      failed++;
    }
  }

  const testPluginPath = path.join(TEST_FIXTURES_DIR, "test-plugin", "plugin.json");
  const testPluginWithPathsPath = path.join(TEST_FIXTURES_DIR, "test-plugin-with-paths", "plugin.json");
  const testPluginMissingPathPath = path.join(TEST_FIXTURES_DIR, "test-plugin-missing-path", "plugin.json");
  const marketplace = loadJson(path.join(TEST_FIXTURES_DIR, ".cursor-plugin", "marketplace.json"));

  test(
    "valid plugin with no component paths",
    testPluginPath,
    marketplace,
    true
  );

  test(
    "valid plugin with all component paths present",
    testPluginWithPathsPath,
    marketplace,
    true
  );

  test(
    "plugin with missing skills path",
    testPluginMissingPathPath,
    marketplace,
    false
  );

  // Test specific path validation errors
  const missingResult = validatePlugin(testPluginMissingPathPath, schema, marketplace);
  const missingErrors = missingResult.errors;

  function testError(name, errorPattern, shouldFind) {
    const found = missingErrors.some(e => e.includes(errorPattern));
    if (found === shouldFind) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      console.log("  Expected to " + (shouldFind ? "find" : "not find") + " error containing:", errorPattern);
      console.log("  Actual errors:", missingErrors);
      failed++;
    }
  }

  testError("reports missing skills path", 'skills: path "skills/missing-skill" does not exist', true);
  testError("reports missing agents path", 'agents: path "agents/missing-agent" does not exist', true);
  testError("reports missing commands path", 'commands: path "commands/missing-cmd" does not exist', true);
  testError("reports missing hooks path", 'hooks: path "hooks/missing.json" does not exist', true);
  testError("reports missing mcpServers path", 'mcpServers: path "mcp/missing.json" does not exist', true);
  testError("reports missing logo path", 'logo: path "assets/missing-logo.png" does not exist', true);
  testError("reports missing icon path", 'icon: path "assets/missing-icon.png" does not exist', true);

  // Test that existing paths don't trigger errors
  const validResult = validatePlugin(testPluginWithPathsPath, schema, marketplace);
  function testNoError(name, errorPattern) {
    const found = validResult.errors.some(e => e.includes(errorPattern));
    if (!found) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      console.log("  Unexpected error:", validResult.errors.find(e => e.includes(errorPattern)));
      failed++;
    }
  }

  testNoError("no error for existing skills path", "skills:");
  testNoError("no error for existing agents path", "agents:");
  testNoError("no error for existing commands path", "commands:");
  testNoError("no error for existing hooks path", "hooks:");
  testNoError("no error for existing mcpServers path", "mcpServers:");
  testNoError("no error for existing logo path", "logo:");
  testNoError("no error for existing icon path", "icon:");

  console.log("\nPath tests: " + passed + " passed, " + failed + " failed");
  return failed === 0;
}

const schemaSuccess = runSchemaTests();
const pathSuccess = runPathTests();

console.log("\n=== SUMMARY ===");
console.log("Schema tests:", schemaSuccess ? "PASSED" : "FAILED");
console.log("Path tests:", pathSuccess ? "PASSED" : "FAILED");

process.exit(schemaSuccess && pathSuccess ? 0 : 1);
