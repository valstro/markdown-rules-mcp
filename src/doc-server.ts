import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { Doc, IDocContextService, IDocIndexService, IFileSystemService } from "./types.js";
import { z } from "zod";
import { config } from "./config.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

/**
 * Markdown Rules MCP Server
 *
 * @remarks
 * This class is responsible for starting the MCP server and handling incoming requests.
 * It also initializes the services needed to build the index of all documents in the project.
 *
 * @example
 * ```typescript
 * const server = new MarkdownRulesServer(config);
 * await server.run();
 * ```
 */
export class MarkdownRulesServer {
  private server: McpServer;

  constructor(
    private fileSystem: IFileSystemService,
    private docIndex: IDocIndexService,
    private docsContextService: IDocContextService
  ) {
    this.server = new McpServer({
      name: "markdown-rules",
      version: packageJson.version || "0.1.0",
    });

    logger.info("Server initialized");
  }

  async setupTools(): Promise<string[]> {
    const configUsageInstructions = await this.getUsageInstructions();
    const agentAttachableDocs = this.docIndex.getDocsByType("agent");
    const descriptions = agentAttachableDocs
      .map((doc) => doc.meta.description)
      .filter((desc): desc is string => typeof desc === "string");

    const projectDocsEnum = z.enum(descriptions as [string, ...string[]]);

    this.server.tool(
      "get_relevant_docs",
      `Get relevant markdown docs inside this project before answering the user's query to help you reply based on more context.

      ${configUsageInstructions}`,
      {
        attachedFiles: z
          .array(z.string().describe("The file path to attach"))
          .describe("A list of file paths included in the user's query.")
          .optional(),
        projectDocs: z
          .array(projectDocsEnum)
          .describe("A list of docs by their description in the project.")
          .optional(),
      },
      async ({ attachedFiles = [], projectDocs = [] }) => {
        const text = await this.docsContextService.buildContextOutput(attachedFiles, projectDocs);

        const content: { type: "text"; text: string }[] = [];

        content.push({
          type: "text",
          text,
        });

        return {
          content,
        };
      }
    );

    this.server.tool(
      "reindex_docs",
      "Reindex the docs. Useful for when you want to force a re-index of the docs because there were changes to the docs or the index",
      {},
      async () => {
        await this.docIndex.buildIndex();
        const totalDocsCount = this.docIndex.docs.length;
        await this.setupTools(); // re-register tools

        return {
          content: [
            {
              type: "text",
              text: `Reindexed docs. Found ${totalDocsCount} total docs in the index. To see a summary of the docs in the index, say "List indexed docs".`,
            },
          ],
        };
      }
    );

    this.server.tool(
      "list_indexed_docs",
      "Print a full count & summary of the docs in the index. Also shows the usage instructions for the `get_relevant_docs` tool. Useful for debugging. Will only show the first 20 docs in each category & a small preview of the content.",
      {},
      async () => {
        const createDocSummary = (doc: Doc) => {
          return `- ${this.fileSystem.getRelativePath(doc.filePath)}: ${doc.meta.description || doc.content.replace(/\n/g, " ").slice(0, 50).trim()}...`;
        };

        const createDocsPreview = (docs: Doc[], previewLength: number = 20) => {
          return (
            docs
              .slice(0, previewLength)
              .map((doc) => createDocSummary(doc))
              .join("\n") +
            (docs.length > previewLength ? `\n...and ${docs.length - previewLength} more...` : "")
          );
        };

        const totalDocsCount = this.docIndex.docs.length;
        const agentDocs = this.docIndex.getDocsByType("agent");
        const autoDocs = this.docIndex.getDocsByType("auto");
        const alwaysDocs = this.docIndex.getDocsByType("always");
        const manualDocs = this.docIndex.getDocsByType("manual");
        const extraMessages: { type: "text"; text: string }[] = [];

        if (agentDocs.length > 0) {
          extraMessages.push({
            type: "text",
            text: `Agent docs preview:\n${createDocsPreview(agentDocs)}`,
          });
        }

        if (autoDocs.length > 0) {
          extraMessages.push({
            type: "text",
            text: `Auto docs preview:\n${createDocsPreview(autoDocs)}`,
          });
        }

        if (alwaysDocs.length > 0) {
          extraMessages.push({
            type: "text",
            text: `Always docs preview:\n${createDocsPreview(alwaysDocs)}`,
          });
        }

        if (manualDocs.length > 0) {
          extraMessages.push({
            type: "text",
            text: `Manual & linked docs preview:\n${createDocsPreview(manualDocs)}`,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: `Server version: ${packageJson.version || "0.1.0"}
MCP Root: ${process.cwd()}              
Project root: ${config.PROJECT_ROOT}
Markdown include: ${config.MARKDOWN_INCLUDE}
Markdown exclude: ${config.MARKDOWN_EXCLUDE}
Hoist context: ${config.HOIST_CONTEXT}`,
            },
            {
              type: "text",
              text: `Found ${totalDocsCount} total docs in the index:
Agent docs: ${agentDocs.length}
Auto docs: ${autoDocs.length}
Always docs: ${alwaysDocs.length}
Manual & linked docs: ${manualDocs.length}${configUsageInstructions ? `\n\nWith these usage instructions: ${configUsageInstructions?.replace(/\n/g, " ").slice(0, 50)?.trim()}...` : ""}`,
            },
            ...extraMessages,
          ],
        };
      }
    );

    return ["get_relevant_docs", "list_indexed_docs"];
  }

  async getUsageInstructions(): Promise<string> {
    const acceptableFilePaths = [
      ...(config.USAGE_INSTRUCTIONS_PATH ? [config.USAGE_INSTRUCTIONS_PATH] : []),
      "markdown-rules.md",
      "markdown-rules.txt",
      "markdown_rules.md",
      "markdown_rules.txt",
      "MARKDOWN-RULES.md",
      "MARKDOWN_RULES.txt",
      "MARKDOWN-RULES.txt",
      "MARKDOWN_RULES.txt",
    ];

    let usageInstructionsFilePath = null;
    for (const filePath of acceptableFilePaths) {
      const doesExist = await this.fileSystem.pathExists(filePath);
      if (doesExist) {
        usageInstructionsFilePath = filePath;
        break;
      }
    }

    if (usageInstructionsFilePath) {
      const usageInstructions = await this.fileSystem.readFile(usageInstructionsFilePath);
      logger.info(`Found custom usage instructions from file: ${usageInstructionsFilePath}`);

      return usageInstructions;
    }

    return `# Usage Instructions

## When to use "get_relevant_docs" tool

*   You **must** call the "get_relevant_docs" MCP tool before providing your first response in any new chat session.
*   After the initial call in a chat, you should **only** call "get_relevant_docs" again if one of these specific situations occurs:
    *   The user explicitly requests it.
    *   The user attaches new files.
    *   The user's query introduces a completely new topic unrelated to the previous discussion.

## How to use "get_relevant_docs" tool

*   "attachedFiles": ALWAYS include file paths the user has attached in their query.
*   "projectDocs"
    *   ONLY include project docs that are VERY RELEVANT to user's query.
    *   You must have a high confidence when picking docs that may be relevant. 
    *   If the user's query is a generic question unrelated to this specific project, leave this empty.
    *   Always heavily bias towards leaving this empty.`;
  }

  async run(): Promise<void> {
    try {
      await this.docIndex.buildIndex();
      const agentAttachableDocs = this.docIndex.getDocsByType("agent");
      const autoAttachableDocs = this.docIndex.getDocsByType("auto");
      const alwaysAttachableDocs = this.docIndex.getDocsByType("always");
      const manualAttachableDocs = this.docIndex.getDocsByType("manual");
      const registeredTools = await this.setupTools();

      logger.info(`Found ${alwaysAttachableDocs.length} always attached docs`);
      if (alwaysAttachableDocs.length > 0) {
        logger.debug(
          `Always attached docs: ${alwaysAttachableDocs
            .map((doc) => this.fileSystem.getRelativePath(doc.filePath))
            .join(", ")}`
        );
      }

      logger.info(`Found ${autoAttachableDocs.length} auto attachable docs`);
      if (autoAttachableDocs.length > 0) {
        logger.debug(
          `Auto attached docs: ${autoAttachableDocs
            .map((doc) => this.fileSystem.getRelativePath(doc.filePath))
            .join(", ")}`
        );
      }

      logger.info(`Found ${agentAttachableDocs.length} agent attachable docs`);
      if (agentAttachableDocs.length > 0) {
        logger.debug(
          `Agent attached docs: ${agentAttachableDocs
            .map((doc) => this.fileSystem.getRelativePath(doc.filePath))
            .join(", ")}`
        );
      }

      logger.info(`Found ${manualAttachableDocs.length} manual attachable docs`);
      if (manualAttachableDocs.length > 0) {
        logger.debug(
          `Manual attached docs: ${manualAttachableDocs
            .map((doc) => this.fileSystem.getRelativePath(doc.filePath))
            .join(", ")}`
        );
      }

      logger.info(
        `Starting server with ${registeredTools.length} tools: ${registeredTools.join(", ")}`
      );

      const transport = new StdioServerTransport();

      // Handle connection errors
      transport.onerror = (error) => {
        logger.error(`Transport error: ${error.message}`);
      };

      await this.server.connect(transport);
      logger.info("Server running on stdio");
    } catch (error) {
      logger.error(
        `Server initialization error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}
