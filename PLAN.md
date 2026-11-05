# Product development plan

Each round completes one feature or repair. Future items are planned, not implemented claims.

## Current round

pr-review-canvas-fix

## Roadmap

### plugin-schema-validator — Plugin manifest schema and validator

Status: done

Acceptance:
- plugin.schema.json defines valid plugin manifest structure
- validate-plugins.mjs validates plugin.json against schema
- validator reports clear errors for invalid manifests

Implementation: `schemas/plugin.schema.json`, `scripts/validate-plugins.mjs`

Tests: `tests/validate-plugins.test.mjs`

### skill-schema-validator — Skill frontmatter schema and validator

Status: done

Acceptance:
- skill.schema.json defines valid skill frontmatter
- validator parses and validates SKILL.md frontmatter
- validates name constraint (lowercase, numbers, hyphens, matches folder)

Implementation: `schemas/skill.schema.json`, `scripts/validate-skills.mjs`

Tests: `tests/validate-skills.test.mjs`

### ci-workflow — CI workflow with pinned dependencies

Status: done

Acceptance:
- package.json with pinned ajv/ajv-formats
- validate-plugins.yml runs on all plugin component changes
- npm ci used for reproducible installs

Implementation: `package.json`, `package-lock.json`, `.github/workflows/validate-plugins.yml`

### local-plugin-symlink-support — Local plugin symlink resolution

Status: done

Acceptance:
- Plugin loader resolves symlinks in ~/.cursor/plugins/local/
- Symlinked plugins load identically to copied plugins

Implementation: `scripts/load-plugins.mjs`

Tests: `tests/load-plugins.test.mjs`

### mcp-json-validator — MCP server config validator

Status: done

Acceptance:
- mcp.schema.json defines valid mcp.json structure
- validator checks placeholder variables against declared variables

Implementation: `schemas/mcp.schema.json`, `scripts/validate-mcp.mjs`

Tests: `tests/validate-mcp.test.mjs`

### plugin-path-validator — Plugin component path existence validator

Status: done

Acceptance:
- validate-plugins.mjs validates component paths (skills, agents, commands, hooks, mcpServers, logo, icon) exist
- validator reports clear errors for missing or incorrect paths
- all existing tests continue to pass

Implementation: `scripts/validate-plugins.mjs`

Tests: `tests/validate-plugins.test.mjs`

### pr-review-canvas-fix — PR Review Canvas diff renderer fix

Status: done

Acceptance:
- Diff lines are parsed and numbered from original hunk headers before any filtering
- Import line filtering is opt-in and shows a collapsed "N import lines hidden" row
- Whitespace-only collapsing only applies when changed lines are identical after trimming leading/trailing whitespace
- Whitespace-sensitive file types (Python, YAML, Makefile) are excluded from whitespace collapsing

Implementation: `cursor-team-kit/skills/pr-review-canvas/renderer.js`

Tests: `tests/pr-review-canvas.test.mjs`

