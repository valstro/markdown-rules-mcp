#!/usr/bin/env node
import { config } from "./config.js";
import { logger } from "./logger.js";
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
    logger.info("Starting, about to create file system");
    const fileSystem = new FileSystemService(config);
    logger.info("Starting, about to create doc parser");
    const docParser = new DocParserService();
    logger.info("Starting, about to create link extractor");
    const linkExtractor = new LinkExtractorService(fileSystem);
    logger.info("Starting, about to create doc index");
    const docIndex = new DocIndexService(config, fileSystem, docParser, linkExtractor);
    logger.info("Starting, about to create doc formatter");
    const docFormatter = new DocFormatterService(docIndex, fileSystem);
    logger.info("Starting, about to create doc context service");
    const docContextService = new DocContextService(config, docIndex, docFormatter);
    logger.info("Starting, about to create server");
    const server = new MarkdownRulesServer(fileSystem, docIndex, docContextService);
    logger.info("Starting, about to run server");
    await server.run();
    logger.info("Server started");
  } catch (error) {
    logger.error(`Fatal server error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
