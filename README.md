# tensor-station-144 — Ryan Vo

> Work in progress. This checkpoint may be incomplete or fail tests. See PLAN.md and STATUS.md before use.

## Overview

Cursor plugin specification and official plugins - validation tooling and reference implementations.

## Features Implemented

- **Plugin manifest schema & validator** (`schemas/plugin.schema.json`, `scripts/validate-plugins.mjs`)
- **Skill frontmatter schema & validator** (`schemas/skill.schema.json`, `scripts/validate-skills.mjs`)
- **MCP server config validator** (`schemas/mcp.schema.json`, `scripts/validate-mcp.mjs`)
- **Plugin component path existence validator** (integrated in `validate-plugins.mjs`)
- **CI workflow with pinned dependencies** (`.github/workflows/validate-plugins.yml`, `package-lock.json`)
- **Local plugin symlink resolution** (`scripts/load-plugins.mjs`)
- **PR Review Canvas diff renderer fix** (`cursor-team-kit/skills/pr-review-canvas/renderer.js`) - fixes issue #472

## Test Results

All 107 tests pass across 5 test suites:
- validate-plugins: 36 tests
- validate-skills: 23 tests
- validate-mcp: 14 tests
- load-plugins: 18 tests
- pr-review-canvas: 54 tests

## Commands

```bash
npm ci              # Install dependencies
npm test            # Run all tests
npm run test:plugins # Run plugin validation tests
npm run test:skills # Run skill validation tests
npm run test:mcp    # Run MCP validator tests
npm run test:load-plugins # Run plugin loader tests
npm run test:pr-review # Run PR Review Canvas tests
npm run validate    # Validate plugin manifests
npm run validate:skills # Validate skill frontmatter
npm run validate:mcp # Validate MCP config
npm run load-plugins # Discover and load plugins
```
## Project Structure

```
├── schemas/              # JSON schemas
│   ├── plugin.schema.json
│   ├── skill.schema.json
│   └── mcp.schema.json
├── scripts/              # Validation and loader scripts
│   ├── validate-plugins.mjs
│   ├── validate-skills.mjs
│   ├── validate-mcp.mjs
│   └── load-plugins.mjs
├── tests/                # Test suites
│   ├── validate-plugins.test.mjs
│   ├── validate-skills.test.mjs
│   ├── validate-mcp.test.mjs
│   ├── load-plugins.test.mjs
│   └── pr-review-canvas.test.mjs
├── cursor-team-kit/      # Reference plugins
│   └── skills/
│       └── pr-review-canvas/
│           └── renderer.js
└── .github/workflows/    # CI configuration
    └── validate-plugins.yml
```

Maintainer: Ryan Vo <ryandtvo@gmail.com>

