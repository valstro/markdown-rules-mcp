# Markdown Rules MCP Server

A Model Context Protocol (MCP) server that provides a portable and enhanced alternative to editor-specific documentation rules (like Cursor Rules). It allows you to define project documentation and context in standard Markdown files, making them usable across any MCP-compatible AI coding tool.

**Why is this useful?**

*   **Portability:** Future-proof your project's crucial context and documentation. Define it once in Markdown and use it with any AI tool supporting MCP, avoiding vendor lock-in.
*   **Enhanced Context Control:** Go beyond simple file linking. Use inline embeds with specific line ranges (e.g. `[Link Text](./path/to/snippet.txt?md-embed=50-100)`) to precisely inject relevant code snippets or documentation sections, optimizing context size and relevance.
*   **Reliable Context for Complex Projects:** Ensure the AI agent receives the necessary context, especially for large codebases or projects with specific frameworks. The server can traverse includes, guaranteeing that linked dependencies and critical information are provided, overcoming the potential unreliability of agents merely *following* links.

## Prerequisites 📋

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Cursor](https://www.cursor.com/) or other MCP supported AI coding tools

## Installation 🛠️

### NPM Installation

```bash
npm install -g @valstro/markdown-rules-mcp
```

### Using Smithery

To install the Markdown Rules MCP server for Cursor automatically via [Smithery](https://smithery.ai/server/markdown-rules):

```bash
npx -y @smithery/cli install markdown-rules-mcp --client cursor
```


## Configuration ⚙️

### 1. Add the server configuration:

```json
{
  "mcpServers": {
    "markdown-rules": {
      "command": "npx",
      "args": ["/path/to/markdown-rules-mcp/build/index.js"],
      "env": {
        "MARKDOWN_GLOB_PATTERN": "**/*.md",
        "HOIST_CONTEXT": true
      }
    }
  }
}
```

### 2. Add global rule (Cursor only, optional):

You can optionally add a global rule `.cursor/rules/global.mdc` that will be applied to all user queries. This is useful for encouraging the agent to use the `get_relevant_docs` tool when it's relevant.

```mdc
---
alwaysApply: true
---

## Agent Rules: `get_relevant_docs` Tool Usage

**Core Requirement:**

*   You **must** call the `get_relevant_docs` MCP tool before providing your first response in any new chat session.

**When to Call Again:**

*   After the initial call in a chat, you should **only** call `get_relevant_docs` again if one of these specific situations occurs:
    *   The user explicitly requests it.
    *   The user attaches new files.
    *   The user's query introduces a completely new topic unrelated to the previous discussion.
```

## How To Use 📝

1.  **Create markdown files:** Write your documentation, rules, or context guides as standard `.md` files within your project.

2.  **Structure your context:** Use YAML frontmatter at the top of your markdown files to define metadata. Key fields include:
    *   `description`: A brief summary of the document's purpose. Used by the agent to identify relevant docs and as a label in the output.
    *   `globs`: A list of glob patterns (e.g., `["**/*.ts", "src/utils/**"]`). If provided, this doc will be automatically included when any attached file matches one of these patterns.
    *   `alwaysApply`: A boolean (`true` or `false`). If `true`, this doc will always be included in the context, regardless of attached files or agent requests.

    ```markdown
    ---
    description: Core Project Guidelines
    alwaysApply: true
    globs: ["**/*.py"]
    ---
    This document outlines the main coding standards...
    ```

3.  **Define docs as global, agent requested or auto attached:**
    *   **Global:** Set `alwaysApply: true` in the frontmatter. These docs are always included.
    *   **Auto Attached:** Define `globs` in the frontmatter. These docs are included if an attached file matches the pattern.
    *   **Agent Requested:** Define a `description` but leave `alwaysApply` as `false` (or omit it) and do not specify `globs`. These docs can be selected by the AI agent via the `get_relevant_docs` tool based on their description matching the user's query.

4.  **Attach other docs & files via links:** Use standard Markdown links, but add the `md-link=true` query parameter to the URL to signal that the linked file should be included in the context if the linking document is included. The server will traverse these links recursively.
    *   Syntax: `[Link Text](./path/to/file.ext?md-link=true)`
    *   Linked Markdown files are included as `<doc>` tags.
    *   Linked non-Markdown files (e.g., code, config) are included as `<file>` tags, containing their raw content.

5.  **Include specific context inline via links:** To embed specific parts of another file directly within the current document's context, use the `md-embed=true` parameter along with `md-link=true`. You can specify line ranges using `mdr-embed`.
    *   Syntax: `[Link Text](./path/to/snippet.txt?md-embed=START-END)`
    *   `mdr-embed` Formats:
        *   `1-10`: Lines 1 to 10 (inclusive).
        *   `1-`: Lines 1 to the end of the file.
        *   `-10`: Lines 1 to 10.
        *   `1-1`: Line 1.
        *   `true`: The entire file.
    *   Inline content is embedded within an `<inline_doc>` tag inside the parent `<doc>`.

6.  **How it works:**
    *   The server scans your project for markdown files matching the `MARKDOWN_GLOB_PATTERN` (defined in Cursor settings).
    *   It parses the frontmatter and content of these initial files.
    *   It follows any `md-link=true` links, reading and parsing the linked files (Markdown or other types).
    *   This process repeats recursively, building a complete graph of linked documents and files.
    *   When the `get_relevant_docs` tool is called (e.g., at the start of a chat or when files are attached), the server determines the final context:
        *   It includes all `alwaysApply: true` documents.
        *   It includes documents whose `globs` match any currently attached files.
        *   It includes documents selected by the agent via the `relevantDocsByDescription` parameter.
        *   It includes any documents or files linked (`md-link=true`) by the already included documents (recursively).
        *   It formats the selected documents/files into XML (`<doc>`, `<file>`), expanding any inline links (`<inline_doc>`) as it goes.
    *   The final context is sent back to the AI agent.
7.  **Config:**
    *   `MARKDOWN_GLOB_PATTERN` - Default: `**/*.md`. The glob pattern to match for markdown files.
    *   `HOIST_CONTEXT` - Default: `true`. Whether to hoist the dependencies to the top of the context window, so they exist in the context before the doc that links to them.

## Example 📝

Imagine you have the following files in your project:

**`project-overview.md`:**

```markdown
---
description: Project Overview and Setup
alwaysApply: true
---
# Project Overview

This document covers the main goals and setup instructions.

See the [Core Utilities](./src/utils.ts?md-link=true) for essential functions.

For configuration details, refer to this section: [Config Example](./config.json?md-embed=1-3)
```

**`src/utils.ts`:**

```typescript
// src/utils.ts
export function helperA() {
  console.log("Helper A");
}

export function helperB() {
  console.log("Helper B");
}
```

**`config.json`:**

```json
{
  "apiKey": "YOUR_API_KEY",
  "timeout": 5000,
  "retries": 3,
  "featureFlags": {
    "newUI": true
  }
}
```

**Generated Context Output (if `HOIST_CONTEXT` is `true`):**

When the `get_relevant_docs` tool runs, because `project-overview.md` has `alwaysApply: true`, the server would generate context like this:

```xml
<file description="Core Utilities" type="related" file="src/utils.ts">
// src/utils.ts
export function helperA() {
  console.log("Helper A");
}

export function helperB() {
  console.log("Helper B");
}
</file>

<doc description="Project Overview and Setup" type="always" file="project-overview.md">
# Project Overview

This document covers the main goals and setup instructions.

See the [Core Utilities](./src/utils.ts?md-link=true) for essential functions.

For configuration details, refer to this section: [Config Example](./config.json?md-embed=1-3)
<inline_doc description="Config Example" file="config.json" lines="2-4">
  "apiKey": "YOUR_API_KEY",
  "timeout": 5000,
  "retries": 3,
</inline_doc>
</doc>
```

**Generated Context Output (if `HOIST_CONTEXT` is `false`):**

```xml
<doc description="Project Overview and Setup" type="always" file="project-overview.md">
# Project Overview

This document covers the main goals and setup instructions.

See the [Core Utilities](./src/utils.ts?md-link=true) for essential functions.

For configuration details, refer to this section: [Config Example](./config.json?md-embed=1-3)
<inline_doc description="Config Example" file="config.json" lines="2-4">
  "apiKey": "YOUR_API_KEY",
  "timeout": 5000,
  "retries": 3,
</inline_doc>
</doc>

<file description="Core Utilities" type="related" file="src/utils.ts">
// src/utils.ts
export function helperA() {
  console.log("Helper A");
}

export function helperB() {
  console.log("Helper B");
}
</file>
```

## Troubleshooting 🔧

### Common Issues

1. **Server Not Found**
   * Verify the npm link is correctly set up
   * Check Cursor configuration syntax
   * Ensure Node.js is properly installed (v18 or higher)

2. **Configuration Issues**
   * Make sure your MARKDOWN_GLOB_PATTERN is correct

3. **Connection Issues**
   * Restart Cursor completely
   * Check Cursor logs:

   ```bash
   # macOS
   tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
   
   # Windows
   type "%APPDATA%\Claude\logs\mcp*.log"
   ```

<br>

---

Built with ❤️ by Valstro

## Future Improvements

- [ ] Improve type mapping for output "always" vs "global rules" etc
- [ ] Add watch mode to re-index docs when markdown files matching the MARKDOWN_GLOB_PATTERN are added/modified/deleted.
- [ ] Remove inline links entirely & replace with the inline markup.
- [ ] Provide an indication of how large the doc context is.
- [ ] Config to limit the number of docs & context that can be attached including a max depth.
- [ ] Config to restrict certain file types from being attached.

  




