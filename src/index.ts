// #!/usr/bin/env node
import { logger } from "./logger.js";
import { config } from "./config.js";
import { MarkdownRulesServer } from "./doc-server.js";
import { DocIndexService } from "./doc-index.service.js";
import { FileSystemService } from "./file-system.service.js";
import { DocParserService } from "./doc-parser.service.js";
import { LinkExtractorService } from "./link-extractor.service.js";
import { DocContextService } from "./doc-context.service.js";
import { DocFormatterService } from "./doc-formatter.service.js";

/**
 * Entry point for the Markdown Rules MCP Server
 */
(async () => {
  try {
    const fileSystem = new FileSystemService(config);
    const docParser = new DocParserService();
    const linkExtractor = new LinkExtractorService(fileSystem);
    const docIndex = new DocIndexService(config, fileSystem, docParser, linkExtractor);
    const docFormatter = new DocFormatterService(docIndex, fileSystem);
    const docContextService = new DocContextService(config, docIndex, docFormatter);

    const server = new MarkdownRulesServer(fileSystem, docIndex, docContextService);
    await server.run();
  } catch (error) {
    logger.error(`Fatal server error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
