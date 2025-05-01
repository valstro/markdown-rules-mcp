---
alwaysApply: true
---

# Project Rules

## What is this project?

This project is a Model Context Protocol (MCP) server that provides a portable and enhanced alternative to editor-specific documentation rules (like Cursor Rules). It allows you to define project documentation and context in standard Markdown files, making them usable across any MCP-compatible AI coding tool.

## Project structure

```
├── .cursor/
├── .git/
├── .vscode/
├── build/
├── docs/
├── node_modules/
├── src/
│   ├── mocks/
│   ├── tests/
│   │   └── __mocks__/
│   │       ├── config.mock.ts
│   │       ├── doc-formatter.service.mock.ts
│   │       ├── doc-index.service.mock.ts
│   │       ├── doc-parser.service.mock.ts
│   │       ├── file-system.service.mock.ts
│   │       └── link-extractor.service.mock.ts
│   │   ├── doc-context.service.integration.test.ts
│   │   ├── doc-formatter.service.test.ts
│   │   ├── doc-index.service.test.ts
│   │   ├── doc-parser.service.test.ts
│   │   └── link-extractor.service.test.ts
│   ├── config.ts
│   ├── doc-context.service.ts
│   ├── doc-formatter.service.ts
│   ├── doc-index.service.ts
│   ├── doc-parser.service.ts
│   ├── doc-server.ts
│   ├── file-system.service.ts
│   ├── index.ts
│   ├── link-extractor.service.ts
│   ├── logger.ts
│   ├── types.ts
│   └── util.ts
├── .gitignore
├── .npmignore
├── .prettierrc
├── Dockerfile
├── LICENSE
├── README.md
├── package-lock.json
├── package.json
├── setup.tests.ts
├── smithery.yaml
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
├── wsl-start-server.sh
```

## package.json

### Scripts

[package.json scripts](../package.json?md-embed=29-37)

### Dependencies

[package.json dependencies](../package.json?md-embed=38-54)

