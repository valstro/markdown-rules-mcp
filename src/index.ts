// #!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import { config, Config } from "./config.js";
import { Doc } from "./types.js";
import { FileSystemService } from "./file-system.service.js";
import { DocParserService } from "./doc-parser.service.js";
import { LinkExtractorService } from "./link-extractor.service.js";
import { DocIndexService } from "./doc-index.service.js";

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
class MarkdownRulesServer {
  private server: McpServer;
  private config: Config;
  private fileSystem: FileSystemService;
  private docParser: DocParserService;
  private linkExtractor: LinkExtractorService;
  private docIndex: DocIndexService;

  constructor(config: Config) {
    this.config = config;
    this.server = new McpServer({
      name: "markdown-rules",
      version: "0.1.0",
    });

    this.fileSystem = new FileSystemService(this.config);
    this.docParser = new DocParserService();
    this.linkExtractor = new LinkExtractorService(this.fileSystem);
    this.docIndex = new DocIndexService(
      this.config,
      this.fileSystem,
      this.docParser,
      this.linkExtractor
    );

    logger.info("Server initialized");
  }

  private setupTools(): string[] {
    // // Register tools based on specifications
    // const registeredTools: string[] = [];
    // Object.entries(toolRegistry).forEach(([toolId, tool]) => {
    //   // If specific tools were provided, only enable those.
    //   // Otherwise, enable all tools marked as enabled by default
    //   const shouldRegister = specifiedTools.size > 0 ? specifiedTools.has(toolId) : tool.enabled;
    //   if (shouldRegister) {
    //     this.server.tool(tool.name, tool.description, tool.schema, tool.handler);
    //     registeredTools.push(toolId);
    //   }
    // });
    // return registeredTools;
    return [];
  }

  public async indexDocs(): Promise<Doc[]> {
    await this.docIndex.buildIndex();
    return this.docIndex.docs;
  }

  async run(): Promise<void> {
    try {
      // Set up tools before connecting
      const registeredTools = this.setupTools();

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

      await this.indexDocs();
    } catch (error) {
      logger.error(
        `Server initialization error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}

/**
 * Entry point for the Markdown Rules MCP Server
 */
(async () => {
  try {
    const server = new MarkdownRulesServer(config);
    await server.run();
  } catch (error) {
    logger.error(`Fatal server error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
