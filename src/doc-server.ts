// #!/usr/bin/env node
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

  setupTools(agentAttachableDocs: Doc[]): string[] {
    const descriptions = agentAttachableDocs
      .map((doc) => doc.meta.description)
      .filter((desc): desc is string => typeof desc === "string");

    const relevantDocsByDescriptionEnum = z.enum(descriptions as [string, ...string[]]);

    this.server.tool(
      "get_relevant_docs",
      "Get relevant markdown docs inside this project before answering the user's query",
      {
        attachedFiles: z
          .array(z.string().describe("The file path to attach"))
          .describe("A list of file paths the user included in their query"),
        relevantDocsByDescription: z
          .array(relevantDocsByDescriptionEnum.describe("The description of the relevant doc"))
          .describe(
            "A list of relevant docs based on the user's query. Use the description to determine if the doc is relevant to the user's query."
          ),
      },
      async ({ attachedFiles, relevantDocsByDescription }) => {
        const text = await this.docsContextService.buildContextOutput(
          attachedFiles,
          relevantDocsByDescription
        );

        const content: { type: "text"; text: string }[] = [];

        if (config.LOG_LEVEL === "debug") {
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

  async run(): Promise<void> {
    try {
      await this.docIndex.buildIndex();

      const agentAttachableDocs = this.docIndex.getAgentAttachableDocs();

      logger.info(
        `Found ${agentAttachableDocs.length} agent attachable docs: ${agentAttachableDocs
          .map((doc) => doc.meta.description)
          .join(", ")}`
      );

      const registeredTools = this.setupTools(agentAttachableDocs);

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
