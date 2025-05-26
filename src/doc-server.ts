import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { Doc, IDocContextService, IDocIndexService, IFileSystemService } from "./types.js";
import { z } from "zod";
import { config } from "./config.js";

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
      version: "0.1.0",
    });

    logger.info("Server initialized");
  }

  setupTools(configUsageInstructions: string | null, agentAttachableDocs: Doc[]): string[] {
    const descriptions = agentAttachableDocs
      .map((doc) => doc.meta.description)
      .filter((desc): desc is string => typeof desc === "string");

    const projectDocsEnum = z.enum(descriptions as [string, ...string[]]);

    const defaultUsageInstructions = `# Usage Instructions

*   You **must** call the \`/get_relevant_docs\` MCP tool before providing your first response in any new chat session.
*   After the initial call in a chat, you should **only** call \`get_relevant_docs\` again if one of these specific situations occurs:
    *   The user explicitly requests it.
    *   The user attaches new files.
    *   The user's query introduces a completely new topic unrelated to the previous discussion.`;

    const usageInstructions =
      configUsageInstructions === null
        ? `\n\n${defaultUsageInstructions}`
        : !!configUsageInstructions
          ? `\n\n${configUsageInstructions}`
          : "";

    this.server.tool(
      "get_relevant_docs",
      `Get relevant markdown docs inside this project before answering the user's query to help you reply based on more context.${usageInstructions}`,
      {
        attachedFiles: z
          .array(z.string().describe("The file path to attach"))
          .describe("A list of file paths included in the user's query.")
          .optional(),
        relevantProjectDocs: z
          .array(projectDocsEnum.describe("The description of the relevant doc"))
          .describe(
            "A list of docs by their description in the project. Only include docs whose description directly matches the user's intent or topic. Don't include docs for the sake of including them. For example, if doc list is ['Frontend Guidelines', 'Frontend Testing Guidelines', 'Database Setup', 'API Reference', 'Github Actions'] and the user's query is How do I set up the database?, include 'Database Setup' in the list. If the query is 'How do I write frontend tests?', only include 'Frontend Testing Guidelines'. Do not include docs that are unrelated to the query and try to be specific (e.g., do not include 'API Reference' for a database setup question). If the user's query is 'How does git work?', do not include any docs. This is clearly a generic question unrelated to this specific project."
          )
          .optional(),
      },
      async ({ attachedFiles = [], relevantProjectDocs = [] }) => {
        const text = await this.docsContextService.buildContextOutput(
          attachedFiles,
          relevantProjectDocs
        );

        const content: { type: "text"; text: string }[] = [];

        if (config.LOG_LEVEL === "debug") {
          content.push({
            type: "text",
            text: `USAGE INSTRUCTIONS: Is user provided usage instructions? ${configUsageInstructions !== null ? "Yes" : "No"}. Final usage instructions: ${usageInstructions}`,
          });

          content.push({
            type: "text",
            text: `CONFIG: ${JSON.stringify(config, null, 2)}`,
          });

          content.push({
            type: "text",
            text: `AGENT ATTACHABLE DOCS: ${JSON.stringify(
              this.docIndex.getAgentAttachableDocs(),
              null,
              2
            )}`,
          });

          content.push({
            type: "text",
            text: `DOCS: ${JSON.stringify(
              this.docIndex.docs.map((doc) => ({
                filePath: this.fileSystem.getRelativePath(doc.filePath),
                description: doc.meta.description,
                linksTo: doc.linksTo.map((link) => this.fileSystem.getRelativePath(link.filePath)),
              })),
              null,
              2
            )}`,
          });
        }

        content.push({
          type: "text",
          text,
        });

        return {
          content,
        };
      }
    );

    return ["get_relevant_docs"];
  }

  async getUsageInstructions(): Promise<string | null> {
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
      return usageInstructions;
    }

    return null;
  }

  async run(): Promise<void> {
    try {
      await this.docIndex.buildIndex();

      const usageInstructions = await this.getUsageInstructions();

      logger.info(
        `Found usage instructions: ${usageInstructions ? "Yes" : "No"}: ${usageInstructions?.slice(
          0,
          100
        )}...`
      );

      const agentAttachableDocs = this.docIndex.getAgentAttachableDocs();

      logger.info(
        `Found ${agentAttachableDocs.length} agent attachable docs: ${agentAttachableDocs
          .map((doc) => doc.meta.description)
          .join(", ")}`
      );

      const registeredTools = this.setupTools(usageInstructions, agentAttachableDocs);

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
