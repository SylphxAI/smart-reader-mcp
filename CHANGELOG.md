# Changelog

## 0.2.0

### Minor Changes

- Publish the Rust-default MCP consumer package: npm bin is `bin/smart-reader-mcp` (rmcp launcher, fail-closed without native) with staged `bin/native/smart-reader-mcp-server` (linux x86_64). Binds consumer artifact to main after pure-TS 0.1.1.

## 0.1.1

### Patch Changes

- Pin sibling optionalDependencies and npx fallback versions; fix read_video sources delegation for portfolio consumers.

## 0.1.0

### Minor Changes

- 3e9288b: Ship v0.1.0 `read_media` MCP tool with format sniffing and stdio delegation to Sylphx Reader siblings.

All notable changes are documented here. Releases use [Changesets](https://github.com/changesets/changesets).
