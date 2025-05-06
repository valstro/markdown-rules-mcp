import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { DocContextService } from "../doc-context.service.js";
import { DocIndexService } from "../doc-index.service.js";
import { DocParserService } from "../doc-parser.service.js";
import { LinkExtractorService } from "../link-extractor.service.js";
import { FileSystemService } from "../file-system.service.js";
import { DocFormatterService } from "../doc-formatter.service.js";
import { Config } from "../config.js";
import { IDocIndexService } from "../types.js"; // Import necessary types if needed later
import { createConfigMock } from "./__mocks__/config.mock.js";

describe("DocContextService Integration Tests", () => {
  let tempDir: string;
  let mockConfig: Config;
  let fileSystemService: FileSystemService;
  let docParserService: DocParserService;
  let linkExtractorService: LinkExtractorService;
  let docIndexService: IDocIndexService;
  let docFormatterService: DocFormatterService;
  let docContextService: DocContextService;

  // File paths (relative to tempDir)
  const alwaysDocPathRel = "always.md";
  const autoTsDocPathRel = "auto-ts.md";
  const agentDocPathRel = "agent-trigger.md";
  const relatedDocPathRel = "related.md";
  const relatedDoc2PathRel = "related2.md";
  const manualDocPathRel = "manual.md";
  const inlineTargetDocPathRel = "inline-target.md";
  const mainTsPathRel = "src/main.ts";
  const unrelatedDocPathRel = "unrelated.md";
  const cycleADocPathRel = "cycle-a.md";
  const cycleBDocPathRel = "cycle-b.md";
  const configFileRel = "config.json";

  // Absolute paths
  let alwaysDocPathAbs: string;
  let autoTsDocPathAbs: string;
  let agentDocPathAbs: string;
  let agentDocDescription: string;
  let relatedDocPathAbs: string;
  let relatedDoc2PathAbs: string;
  let manualDocPathAbs: string;
  let inlineTargetDocPathAbs: string;
  let mainTsPathAbs: string;
  let unrelatedDocPathAbs: string;
  let cycleADocPathAbs: string;
  let cycleADocDescription: string;
  let cycleBDocPathAbs: string;
  let cycleBDocDescription: string;
  let configFileAbs: string;

  // Setup
  let toRelative: (filePath: string) => string;
  let setup: (config?: Partial<Config>) => Promise<void>;

  beforeAll(async () => {
    // Create a unique temporary directory for this test suite
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-rules-test-"));

    // Define absolute paths
    alwaysDocPathAbs = path.join(tempDir, alwaysDocPathRel);
    autoTsDocPathAbs = path.join(tempDir, autoTsDocPathRel);
    agentDocPathAbs = path.join(tempDir, agentDocPathRel);
    agentDocDescription = "Agent Triggered Doc";
    relatedDocPathAbs = path.join(tempDir, relatedDocPathRel);
    relatedDoc2PathAbs = path.join(tempDir, relatedDoc2PathRel);
    manualDocPathAbs = path.join(tempDir, manualDocPathRel);
    inlineTargetDocPathAbs = path.join(tempDir, inlineTargetDocPathRel);
    mainTsPathAbs = path.join(tempDir, mainTsPathRel);
    unrelatedDocPathAbs = path.join(tempDir, unrelatedDocPathRel);
    cycleADocPathAbs = path.join(tempDir, cycleADocPathRel);
    cycleADocDescription = "Cycle A";
    cycleBDocPathAbs = path.join(tempDir, cycleBDocPathRel);
    cycleBDocDescription = "Cycle B";
    configFileAbs = path.join(tempDir, configFileRel);

    // Create necessary subdirectories
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Create test files
    await fs.writeFile(
      alwaysDocPathAbs,
      `---
description: Always Included
alwaysApply: true
---
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).`
    );

    await fs.writeFile(
      autoTsDocPathAbs,
      `---
description: Auto TS Inclusion
globs: ["**/*.ts"]
---
This doc applies to TypeScript files.
It has an inline link: [Inline Target Section](./inline-target.md?md-embed=1-2)`
    );

    await fs.writeFile(
      agentDocPathAbs,
      `---
description: ${agentDocDescription}
---
This doc is triggered by the agent description match.

and is related to [Related Doc 2](./related2.md?md-link=true).`
    );

    await fs.writeFile(
      relatedDocPathAbs,
      `---
description: Related Doc
---
This doc is linked from the 'always' doc.`
    );

    await fs.writeFile(
      relatedDoc2PathAbs,
      `---
description: Related Doc 2
---
This doc is related to various things.`
    );

    await fs.writeFile(
      inlineTargetDocPathAbs,
      `Line 1
Line 2
Line 3
Line 4 (end)`
    );

    await fs.writeFile(mainTsPathAbs, `console.log("Hello from main.ts");`);

    await fs.writeFile(
      unrelatedDocPathAbs,
      `---
description: Unrelated Doc
---
This doc should not be included unless directly linked or triggered.`
    );

    await fs.writeFile(
      cycleADocPathAbs,
      `---
description: ${cycleADocDescription}
---
Links to [Cycle B](./cycle-b.md?md-link=true)`
    );

    await fs.writeFile(
      cycleBDocPathAbs,
      `---
description: ${cycleBDocDescription}
---
Links back to [Cycle A](./cycle-a.md?md-link=true)`
    );

    await fs.writeFile(configFileAbs, `{ "config": "value" }`); // Non-markdown file

    await fs.writeFile(
      manualDocPathAbs,
      `---
description: Manual Doc
---
This doc is manually included.`
    );
  });

  afterAll(async () => {
    // Clean up the temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    mockConfig = createConfigMock({
      PROJECT_ROOT: tempDir,
      LOG_LEVEL: "error", // Keep logs quiet during tests unless debugging
    });
    fileSystemService = new FileSystemService(mockConfig);
    docParserService = new DocParserService();
    linkExtractorService = new LinkExtractorService(fileSystemService);
    toRelative = (filePath: string) => {
      return path.relative(mockConfig.PROJECT_ROOT, filePath);
    };

    setup = async (config: Partial<Config> = {}) => {
      mockConfig = { ...mockConfig, ...config };
      const currentFileSystemService = new FileSystemService(mockConfig);
      linkExtractorService = new LinkExtractorService(currentFileSystemService);

      docIndexService = new DocIndexService(
        mockConfig,
        currentFileSystemService,
        docParserService,
        linkExtractorService
      );
      docFormatterService = new DocFormatterService(docIndexService, currentFileSystemService);
      docContextService = new DocContextService(mockConfig, docIndexService, docFormatterService);
      await docIndexService.buildIndex();
    };

    await setup();
  });

  it("should include 'always' and 'related' docs with empty input", async () => {
    const output = await docContextService.buildContextOutput([], []);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
  });

  it("should include 'auto' doc when attached file matches glob", async () => {
    const output = await docContextService.buildContextOutput([mainTsPathAbs], []);
    const expectedInlineContent = "Line 1\nLine 2";
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Auto TS Inclusion" type="auto" file="${toRelative(autoTsDocPathAbs)}">
This doc applies to TypeScript files.
It has an inline link: [Inline Target Section](./inline-target.md?md-embed=1-2)
<inline_doc description="Inline Target Section" file="${toRelative(inlineTargetDocPathAbs)}" lines="1-2">
${expectedInlineContent}
</inline_doc>
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
  });

  it("should include 'agent' doc  & its related doc when its path is provided", async () => {
    const output = await docContextService.buildContextOutput([], [agentDocDescription]);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Related Doc 2" type="related" file="${toRelative(relatedDoc2PathAbs)}">
This doc is related to various things.
</doc>

<doc description="Agent Triggered Doc" type="agent" file="${toRelative(agentDocPathAbs)}">
This doc is triggered by the agent description match.
and is related to [Related Doc 2](./related2.md?md-link=true).
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
  });

  it("should include 'manual' doc when its path is provided", async () => {
    const output = await docContextService.buildContextOutput([manualDocPathAbs], []);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Manual Doc" type="manual" file="${toRelative(manualDocPathAbs)}">
This doc is manually included.
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
  });

  it("should handle cycles gracefully", async () => {
    const output = await docContextService.buildContextOutput([], [cycleADocDescription]);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Cycle B" type="related" file="${toRelative(cycleBDocPathAbs)}">
Links back to [Cycle A](./cycle-a.md?md-link=true)
</doc>

<doc description="Cycle A" type="agent" file="${toRelative(cycleADocPathAbs)}">
Links to [Cycle B](./cycle-b.md?md-link=true)
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
  });

  it("should include non-markdown files linked via include=true as <file>", async () => {
    // Modify 'always' doc for this test to link to config.json
    const alwaysWithJsonLink = `---
description: Always Included
alwaysApply: true
---
This doc is always present.
It links to [Config File](./config.json?md-link=true).`;
    await fs.writeFile(alwaysDocPathAbs, alwaysWithJsonLink);
    await docIndexService.buildIndex(); // Re-index

    const output = await docContextService.buildContextOutput([], []);
    const expectedOutput = `<file description="Config File" type="related" file="${toRelative(configFileAbs)}">
{ "config": "value" }
</file>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Config File](./config.json?md-link=true).
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));

    // Restore original always doc content for other tests (or use afterEach)
    await fs.writeFile(
      alwaysDocPathAbs,
      `---
description: Always Included
alwaysApply: true
---
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).`
    );
  });

  it("should produce empty output when no docs are selected", async () => {
    // Create a new index service pointing to an empty temp dir for this test
    const emptyTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-empty-test-"));
    const emptyConfig = { ...mockConfig, PROJECT_ROOT: emptyTempDir };
    const emptyFs = new FileSystemService(emptyConfig);
    const emptyIndex = new DocIndexService(
      emptyConfig,
      emptyFs,
      docParserService, // Can reuse parser/extractor
      linkExtractorService
    );
    const emptyFormatter = new DocFormatterService(emptyIndex, emptyFs);
    const emptyContext = new DocContextService(emptyConfig, emptyIndex, emptyFormatter);

    await emptyIndex.buildIndex(); // Build index on empty dir
    const output = await emptyContext.buildContextOutput([], []);
    expect(output).toBe("");

    await fs.rm(emptyTempDir, { recursive: true, force: true }); // Clean up empty dir
  });

  it("should hoist context correctly, with multiple 'always' docs linked to same doc", async () => {
    // Create a second 'always' doc that links to the same doc
    const alwaysDocPathRel2 = "always-2.md";
    const alwaysDocPathAbs2 = path.join(tempDir, alwaysDocPathRel2);
    await fs.writeFile(
      alwaysDocPathAbs2,
      `---
alwaysApply: true
---
This 2nd 'always' doc is always present AND has no description.
It links to [Related Doc](./related.md?md-link=true).`
    );
    await docIndexService.buildIndex(); // Re-index

    const output = await docContextService.buildContextOutput([], []);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc type="always" file="${toRelative(alwaysDocPathAbs2)}">
This 2nd 'always' doc is always present AND has no description.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));

    // Clean up specific files for this test
    await fs.unlink(alwaysDocPathAbs2);
  });

  it("should NOT hoist context when configured", async () => {
    // Create specific files for this test to ensure clear dependency
    const preAPathRel = "pre-a.md";
    const preBPathRel = "pre-b.md";
    const preAPathAbs = path.join(tempDir, preAPathRel);
    const preADescription = "Pre A (Agent Trigger)";
    const preBPathAbs = path.join(tempDir, preBPathRel);
    const preBDescription = "Pre B (Related)";

    await fs.writeFile(
      preAPathAbs,
      `---
description: ${preADescription}
---
Links to [Pre B](./pre-b.md?md-link=true)`
    );
    await fs.writeFile(
      preBPathAbs,
      `---
description: ${preBDescription}
---
This is related to Pre A.`
    );

    await setup({ HOIST_CONTEXT: false });

    const output = await docContextService.buildContextOutput([], [preADescription]);

    const expectedOutput = `<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Pre A (Agent Trigger)" type="agent" file="${toRelative(preAPathAbs)}">
Links to [Pre B](./pre-b.md?md-link=true)
</doc>

<doc description="Pre B" type="related" file="${toRelative(preBPathAbs)}">
This is related to Pre A.
</doc>`;

    expect(nl(output)).toBe(nl(expectedOutput));

    // Clean up specific files for this test
    await fs.unlink(preAPathAbs);
    await fs.unlink(preBPathAbs);
  });

  it("should handle complex inline ranges correctly", async () => {
    // Modify auto-ts.md to include more range types
    const autoTsExtendedContent = `---
description: Auto TS Inclusion Extended Ranges
globs: ["**/*.ts"]
---
This doc applies to TypeScript files.
Range 1-2: [Inline 1-2](./inline-target.md?md-link=true&md-embed=1-2)
Range 0-1: [Inline 0-1](./inline-target.md?md-link=true&md-embed=-1)
Range 2-end: [Inline 2-end](./inline-target.md?md-link=true&md-embed=2-)
Single Line 3: [Inline 3-3](./inline-target.md?md-link=true&md-embed=3-3)`;
    await fs.writeFile(autoTsDocPathAbs, autoTsExtendedContent);
    await docIndexService.buildIndex(); // Re-index

    const output = await docContextService.buildContextOutput([mainTsPathAbs], []);

    const expectedInline_1_2 = "Line 1\nLine 2";
    const expectedInline_0_1 = "Line 1";
    const expectedInline_2_end = "Line 2\nLine 3\nLine 4 (end)";
    const expectedInline_3_3 = "Line 3";
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Auto TS Inclusion Extended Ranges" type="auto" file="${toRelative(autoTsDocPathAbs)}">
This doc applies to TypeScript files.
Range 1-2: [Inline 1-2](./inline-target.md?md-link=true&md-embed=1-2)
<inline_doc description="Inline 1-2" file="${toRelative(inlineTargetDocPathAbs)}" lines="1-2">
${expectedInline_1_2}
</inline_doc>
Range 0-1: [Inline 0-1](./inline-target.md?md-link=true&md-embed=-1)
<inline_doc description="Inline 0-1" file="${toRelative(inlineTargetDocPathAbs)}" lines="1-1">
${expectedInline_0_1}
</inline_doc>
Range 2-end: [Inline 2-end](./inline-target.md?md-link=true&md-embed=2-)
<inline_doc description="Inline 2-end" file="${toRelative(inlineTargetDocPathAbs)}" lines="2-end">
${expectedInline_2_end}
</inline_doc>
Single Line 3: [Inline 3-3](./inline-target.md?md-link=true&md-embed=3-3)
<inline_doc description="Inline 3-3" file="${toRelative(inlineTargetDocPathAbs)}" lines="3-3">
${expectedInline_3_3}
</inline_doc>
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));

    // Restore original auto-ts doc
    await fs.writeFile(
      autoTsDocPathAbs,
      `---
description: Auto TS Inclusion
globs: ["**/*.ts"]
---
This doc applies to TypeScript files.
It has an inline link: [Inline Target Section](./inline-target.md?md-embed=1-2)`
    );
  });

  it("should include doc once if matched by multiple globs from attached files", async () => {
    // Create a doc with multiple globs and a JS file to attach
    const multiGlobDocRel = "multi-glob.md";
    const multiGlobDocAbs = path.join(tempDir, multiGlobDocRel);
    const utilJsPathRel = "src/util.js";
    const utilJsPathAbs = path.join(tempDir, utilJsPathRel);

    await fs.writeFile(
      multiGlobDocAbs,
      `---
description: Multi Glob Test
globs: ["**/*.ts", "**/*.js"]
---
This should apply to TS and JS files.`
    );
    await fs.writeFile(utilJsPathAbs, `// Util JS file`);
    await docIndexService.buildIndex(); // Re-index

    // Attach both a .ts and a .js file
    const output = await docContextService.buildContextOutput([mainTsPathAbs, utilJsPathAbs], []);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Auto TS Inclusion" type="auto" file="${toRelative(autoTsDocPathAbs)}">
This doc applies to TypeScript files.
It has an inline link: [Inline Target Section](./inline-target.md?md-embed=1-2)
<inline_doc description="Inline Target Section" file="${toRelative(inlineTargetDocPathAbs)}" lines="1-2">
Line 1
Line 2
</inline_doc>
</doc>

<doc description="Multi Glob Test" type="auto" file="${toRelative(multiGlobDocAbs)}">
This should apply to TS and JS files.
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));
    // Verify the multi-glob doc appears only once
    const multiGlobCount = (output.match(new RegExp(toRelative(multiGlobDocAbs), "g")) || [])
      .length;
    expect(multiGlobCount).toBe(1);

    // Clean up specific files
    await fs.unlink(multiGlobDocAbs);
    await fs.unlink(utilJsPathAbs);
  });

  it("should prioritize 'auto' type over 'agent' type if doc matches both", async () => {
    // Create a doc that matches a glob and is also provided as agent-relevant
    const autoAgentDocRel = "auto-agent.md";
    const autoAgentDocAbs = path.join(tempDir, autoAgentDocRel);

    await fs.writeFile(
      autoAgentDocAbs,
      `---
description: Auto Agent Doc
globs: ["*.json"]
---
This matches JSON glob and could be agent-triggered.`
    );
    await docIndexService.buildIndex(); // Re-index

    // Attach config.json (matches glob) AND provide the doc path via agent list
    const output = await docContextService.buildContextOutput([configFileAbs], [autoAgentDocAbs]);
    const expectedOutput = `<doc description="Related Doc" type="related" file="${toRelative(relatedDocPathAbs)}">
This doc is linked from the 'always' doc.
</doc>

<doc description="Always Included" type="always" file="${toRelative(alwaysDocPathAbs)}">
This doc is always present.
It links to [Related Doc](./related.md?md-link=true).
</doc>

<doc description="Auto Agent Doc" type="auto" file="${toRelative(autoAgentDocAbs)}">
This matches JSON glob and could be agent-triggered.
</doc>`;
    expect(nl(output)).toBe(nl(expectedOutput));

    // Clean up specific file
    await fs.unlink(autoAgentDocAbs);
  });
});

/**
 * Normalize line endings to Unix style
 */
function nl(str: string) {
  return str.replace(/\r\n/g, "\n");
}
