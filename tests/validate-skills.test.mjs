#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.resolve(__dirname, "../schemas/skill.schema.json");

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function extractFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { frontmatter: null, error: 'No frontmatter delimiter (---) found at start of file' };
  }
  const endDelimiterIndex = content.indexOf("\n---", 3);
  if (endDelimiterIndex === -1) {
    return { frontmatter: null, error: 'No closing frontmatter delimiter (---) found' };
  }
  const yamlContent = content.slice(3, endDelimiterIndex).trim();
  try {
    const frontmatter = yaml.load(yamlContent);
    if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
      return { frontmatter: null, error: 'Frontmatter must be a YAML object' };
    }
    return { frontmatter, error: null };
  } catch (err) {
    return { frontmatter: null, error: `Invalid YAML in frontmatter: ${err.message}` };
  }
}

function runTests() {
  const schema = loadJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let passed = 0;
  let failed = 0;

  function test(name, frontmatter, shouldPass, folderName) {
    const valid = validate(frontmatter);
    let errors = [];
    if (!valid) {
      for (const err of validate.errors || []) {
        errors.push(`${err.instancePath || "root"}: ${err.message}`);
      }
    }
    // Check name matches folder
    if (frontmatter.name && frontmatter.name !== folderName) {
      errors.push(`name: skill name "${frontmatter.name}" does not match folder name "${folderName}"`);
    }
    const testPassed = errors.length === 0 === shouldPass;
    if (testPassed) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      for (const err of errors) {
        console.log("  - " + err);
      }
      failed++;
    }
  }

  function testExtraction(name, content, shouldPass, expectedError = null) {
    const result = extractFrontmatter(content);
    const testPassed = (result.error === null) === shouldPass && (!shouldPass ? result.error?.includes(expectedError || "") : true);
    if (testPassed) {
      console.log("✓ " + name);
      passed++;
    } else {
      console.log("✗ " + name);
      console.log("  Expected error:", expectedError);
      console.log("  Got:", result.error);
      failed++;
    }
  }

  // Frontmatter extraction tests
  testExtraction("valid frontmatter", "---\nname: test-skill\ndescription: Test\n---\n\nContent", true);
  testExtraction("no frontmatter delimiter", "No frontmatter here", false, "No frontmatter delimiter");
  testExtraction("no closing delimiter", "---\nname: test\n\nContent", false, "No closing frontmatter delimiter");
  testExtraction("invalid YAML", "---\nname: test\n  invalid:\n---\n\nContent", false, "Invalid YAML");
  testExtraction("empty frontmatter", "---\n---\n\nContent", false, "Frontmatter must be a YAML object");
  testExtraction("frontmatter not object (array)", "---\n- item1\n- item2\n---\n\nContent", false, "Frontmatter must be a YAML object");
  testExtraction("frontmatter with only scalar", "---\njust-a-string\n---\n\nContent", false, "Frontmatter must be a YAML object");

  // Schema validation tests (using matching folder name)
  test("valid minimal skill", { name: "test-skill", description: "A test skill" }, true, "test-skill");
  test("valid full skill", { name: "full-skill", displayName: "Full Skill", description: "A full featured skill", paths: ["*.ts", "*.js"], "disable-model-invocation": true, icon: "code", color: "blue", mode: true, reminder: "Remember this", metadata: { "cursor-display-name": "Full Skill" } }, true, "full-skill");
  test("missing name", { description: "Missing name" }, false, "test-skill");
  test("missing description", { name: "test-skill" }, false, "test-skill");
  test("name with uppercase", { name: "Test-Skill", description: "Invalid" }, false, "test-skill");
  test("name with spaces", { name: "test skill", description: "Invalid" }, false, "test-skill");
  test("name with underscore", { name: "test_skill", description: "Invalid" }, false, "test-skill");
  test("name starting with hyphen", { name: "-test-skill", description: "Invalid" }, false, "test-skill");
  test("name ending with hyphen", { name: "test-skill-", description: "Invalid" }, false, "test-skill");
  test("name single char", { name: "a", description: "Test" }, true, "a");
  test("name with numbers", { name: "test123", description: "Test" }, true, "test123");
  test("name with hyphen", { name: "test-skill", description: "Test" }, true, "test-skill");
  test("description over 1024 chars", { name: "test-skill", description: "a".repeat(1025) }, false, "test-skill");
  test("name mismatch with folder", { name: "other-skill", description: "Test" }, false, "test-skill");
  test("name matches folder", { name: "test-skill", description: "Test" }, true, "test-skill");
  test("additional properties allowed", { name: "test-skill", description: "Test", customField: "value" }, true, "test-skill");

  console.log("\n" + passed + " passed, " + failed + " failed");
  return failed === 0;
}

const success = runTests();
process.exit(success ? 0 : 1);
