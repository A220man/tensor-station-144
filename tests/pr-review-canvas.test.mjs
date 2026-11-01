#!/usr/bin/env node
/**
 * Tests for PR Review Canvas diff renderer
 * Tests the fixes for issue #472
 */

import { parseDiff, isImport, isWhitespaceOnlyChange, isWhitespaceSensitiveFile, applyFilters, renderDiff } from '../cursor-team-kit/skills/pr-review-canvas/renderer.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.log(`✗ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.log(`✗ ${message}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// Test isImport
console.log('\n--- isImport tests ---');
assert(isImport('import a from "a"'), 'detects basic import');
assert(isImport('import { foo } from "bar"'), 'detects named import');
assert(isImport('import "./polyfill"'), 'detects side-effect import');
assert(isImport('} from "module"'), 'detects namespace import');
assert(!isImport('const x = 1'), 'does not detect non-import');
assert(!isImport('export default foo'), 'does not detect export');

// Test isWhitespaceOnlyChange
console.log('\n--- isWhitespaceOnlyChange tests ---');
// After trimming: 'return "a b"' vs 'return "ab"' - NOT equal (content changed)
assert(!isWhitespaceOnlyChange('  return "a b"  ', '  return "ab"  '), 'does not detect content change in string');
// After trimming: 'foo' vs 'foo' - equal but lines different (whitespace only)
assert(isWhitespaceOnlyChange('    foo', '  foo'), 'detects indentation change');
assert(!isWhitespaceOnlyChange('return "a b"', 'return "ab"'), 'does not detect content change');
assert(!isWhitespaceOnlyChange('const x = 1', 'const y = 1'), 'does not detect variable rename');
assert(isWhitespaceOnlyChange('  const x = 1  ', 'const x = 1'), 'detects whitespace only change');

// Test isWhitespaceSensitiveFile
console.log('\n--- isWhitespaceSensitiveFile tests ---');
assert(isWhitespaceSensitiveFile('test.py'), 'detects Python file');
assert(isWhitespaceSensitiveFile('config.yaml'), 'detects YAML file');
assert(isWhitespaceSensitiveFile('config.yml'), 'detects YML file');
assert(isWhitespaceSensitiveFile('Makefile'), 'detects Makefile');
assert(isWhitespaceSensitiveFile('build.mk'), 'detects .mk file');
assert(isWhitespaceSensitiveFile('Dockerfile'), 'detects Dockerfile');
assert(!isWhitespaceSensitiveFile('script.js'), 'does not detect JavaScript');
assert(!isWhitespaceSensitiveFile('style.css'), 'does not detect CSS');
assert(!isWhitespaceSensitiveFile(null), 'handles null');
assert(!isWhitespaceSensitiveFile(''), 'handles empty string');

// Test parseDiff
console.log('\n--- parseDiff tests ---');
const simpleDiff = `@@ -1,3 +1,3 @@
 import a from 'a'
-import b from 'b'
+import c from 'c'
 const x = 1`;

const parsed = parseDiff(simpleDiff);
assertEqual(parsed.length, 1, 'parses single hunk');
assertEqual(parsed[0].oldStart, 1, 'correct old start line');
assertEqual(parsed[0].newStart, 1, 'correct new start line');
assertEqual(parsed[0].lines.length, 4, 'correct number of lines');

// Check line numbering
assertEqual(parsed[0].lines[0].type, 'context', 'line 1 is context');
assertEqual(parsed[0].lines[0].oldLineNum, 1, 'old line 1');
assertEqual(parsed[0].lines[0].newLineNum, 1, 'new line 1');

assertEqual(parsed[0].lines[1].type, 'delete', 'line 2 is delete');
assertEqual(parsed[0].lines[1].oldLineNum, 2, 'old line 2');
assertEqual(parsed[0].lines[1].newLineNum, null, 'no new line for delete');

assertEqual(parsed[0].lines[2].type, 'add', 'line 3 is add');
assertEqual(parsed[0].lines[2].oldLineNum, null, 'no old line for add');
assertEqual(parsed[0].lines[2].newLineNum, 2, 'new line 2');

assertEqual(parsed[0].lines[3].type, 'context', 'line 4 is context');
assertEqual(parsed[0].lines[3].oldLineNum, 3, 'old line 3');
assertEqual(parsed[0].lines[3].newLineNum, 3, 'new line 3');

// Test import filtering with line numbering preserved
console.log('\n--- Import filtering with line numbering ---');
const result = renderDiff(simpleDiff, { filterImports: true });
// 3 imports (import a, -import b, +import c) filtered, 1 context remains, plus 1 filter marker = 2 total
assertEqual(result.hunks[0].lines.length, 2, 'includes filter marker + 1 context line');
assertEqual(result.hunks[0].lines[0].type, 'filter-marker', 'first line is filter marker');
assertEqual(result.hunks[0].lines[0].count, 3, 'filter marker shows 3 imports hidden');

// Verify line numbers are preserved from original hunk headers
const contextLine = result.hunks[0].lines.find(l => l.type === 'context' && l.content === 'const x = 1');
assertEqual(contextLine.oldLineNum, 3, 'context line keeps original old line number (3)');
assertEqual(contextLine.newLineNum, 3, 'context line keeps original new line number (3)');

// Test whitespace collapsing - actual whitespace-only change
console.log('\n--- Whitespace collapsing tests ---');
const wsDiff = `@@ -1,2 +1,2 @@
-    const x = 1
+  const x = 1`;

const wsResult = renderDiff(wsDiff, { collapseWhitespace: true });
const collapsedLine = wsResult.hunks[0].lines.find(l => l.collapsed);
assert(collapsedLine, 'finds collapsed whitespace line');
assertEqual(collapsedLine.collapseType, 'whitespace', 'collapse type is whitespace');
assertEqual(collapsedLine.content.trim(), 'const x = 1', 'collapsed content is trimmed version');

// Test whitespace collapsing disabled for Python
console.log('\n--- Whitespace sensitive file exclusion ---');
const pyDiff = `@@ -1,2 +1,2 @@
-    const x = 1
+  const x = 1`;

const pyResult = renderDiff(pyDiff, { collapseWhitespace: true, filename: 'test.py' });
const pyCollapsedLine = pyResult.hunks[0].lines.find(l => l.collapsed);
assert(!pyCollapsedLine, 'no collapsed lines for Python file');

// Test multiple hunks
console.log('\n--- Multiple hunks ---');
const multiDiff = `@@ -1,2 +1,2 @@
 import a
+import b
@@ -10,2 +11,2 @@
 const x = 1
-const y = 2
+const z = 3`;

const multiResult = renderDiff(multiDiff, { filterImports: true });
assertEqual(multiResult.hunks.length, 2, 'parses two hunks');
assertEqual(multiResult.hunks[0].filteredImports, 2, 'first hunk has 2 filtered imports');
assertEqual(multiResult.hunks[1].filteredImports, 0, 'second hunk has 0 filtered imports');

// Test stats
console.log('\n--- Stats tracking ---');
assertEqual(multiResult.stats.totalFilteredImports, 2, 'tracks total filtered imports');

// Test that filtering is opt-in (disabled by default)
console.log('\n--- Opt-in filtering ---');
const defaultResult = renderDiff(simpleDiff);
assertEqual(defaultResult.hunks[0].lines.length, 4, 'no filter marker by default');
assertEqual(defaultResult.hunks[0].filteredImports, 0, 'no imports filtered by default');

// Test whitespace collapsing with context lines in between
console.log('\n--- Whitespace collapsing with context ---');
const wsContextDiff = `@@ -1,4 +1,4 @@
 const a = 1
-    const x = 1
+  const x = 1
 const b = 2`;

const wsContextResult = renderDiff(wsContextDiff, { collapseWhitespace: true });
const wsContextCollapsed = wsContextResult.hunks[0].lines.find(l => l.collapsed);
assert(wsContextCollapsed, 'finds collapsed whitespace line with context around it');
assertEqual(wsContextCollapsed.content.trim(), 'const x = 1', 'collapsed content correct');

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
