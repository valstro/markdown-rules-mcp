import { logger } from "./logger.js";
import { Config } from "./config.js";
import { Doc, DocIndex, IDocIndexService } from "./types.js";
import { FileSystemService } from "./file-system.service.js";
import { DocParserService } from "./doc-parser.service.js";
import { LinkExtractorService } from "./link-extractor.service.js";

/**
 * Manages the index of all documents in the project.
 *
 * @remarks
 * This service is responsible for building the index of all documents in the project.
 * It uses the file system service to find all markdown files in the project based on the glob pattern,
 * and the link extractor service to extract links from the markdown files recursively.
 * It also uses the doc parser service to parse the markdown files and add them to the index.
 */
export class DocIndexService implements IDocIndexService {
  private docMap: DocIndex = new Map();

  get docs(): Doc[] {
    return Array.from(this.docMap.values());
  }

  constructor(
    private config: Config,
    private fileSystem: FileSystemService,
    private docParser: DocParserService,
    private linkExtractor: LinkExtractorService
  ) {}

  /**
   * Builds the complete document graph.
   * 1. Loads initial documents based on the configured glob pattern.
   * 2. Recursively discovers and loads all documents linked from the initial set.
   */
  async buildIndex(): Promise<DocIndex> {
    this.docMap.clear();

    logger.info(
      `Building doc index from: ${this.fileSystem.getProjectRoot()} using glob: ${this.config.MARKDOWN_GLOB_PATTERN}`
    );

    const initialPaths = await this.loadInitialDocs();
    logger.info(`Found ${initialPaths.size} initial markdown files.`);

    await this.recursivelyResolveAndLoadLinks(initialPaths);
    logger.info(`Index built. Total docs: ${this.docMap.size}.}`);

    return this.docMap;
  }

  /**
   * Finds files matching the glob pattern, loads them, adds them to the docMap,
   * and returns their absolute paths.
   */
  async loadInitialDocs(): Promise<Set<string>> {
    const initialFilePaths = await this.fileSystem.findFiles();
    const initialDocs = await this.getDocs(initialFilePaths);
    this.setDocs(initialDocs);

    return new Set(initialDocs.map((doc) => doc.filePath));
  }

  /**
   * Recursively processes links starting from a given set of document paths.
   * It finds linked documents, loads any new ones, adds them to the docMap,
   * and continues until no new documents are found.
   */
  async recursivelyResolveAndLoadLinks(initialPathsToProcess: Set<string>): Promise<void> {
    let pathsToProcess = new Set<string>(initialPathsToProcess);
    const processedPaths = new Set<string>(); // Keep track of paths already processed

    // Process links iteratively until no new documents are discovered
    while (pathsToProcess.size > 0) {
      const currentBatchPaths = Array.from(pathsToProcess);
      pathsToProcess.clear(); // Prepare for the next iteration's findings

      // Add current batch to processed set
      currentBatchPaths.forEach((p) => processedPaths.add(p));

      // Process the current batch of documents in parallel
      const discoveryPromises = currentBatchPaths.map(async (filePath) => {
        const doc = this.docMap.get(filePath);
        if (!doc) {
          logger.warn(`Document not found in map during link resolution: ${filePath}`);
          return []; // Skip if doc somehow disappeared
        }
        // Only process markdown files for links
        if (!doc.isMarkdown) {
          return [];
        }

        // Extract links from the current document
        const linkedDocs = this.linkExtractor.extractLinks(filePath, doc.content);
        // Update the doc object in the map with its links
        doc.linksTo = linkedDocs;

        // Identify paths that are not yet in our graph map *and* haven't been processed yet
        const newPathsToLoad = linkedDocs
          .filter((doc) => !this.docMap.has(doc.filePath))
          .map((doc) => doc.filePath);

        const newPathsToQueue = linkedDocs
          .filter((doc) => !processedPaths.has(doc.filePath) && !pathsToProcess.has(doc.filePath))
          .map((doc) => doc.filePath);

        if (newPathsToLoad.length > 0) {
          // Fetch the newly discovered documents (this also adds them to docMap)
          await this.getDocs(newPathsToLoad); // Wait for loading before queuing
          logger.debug(
            `Loaded ${newPathsToLoad.length} new docs linked from ${filePath}: ${newPathsToLoad.join(", ")}`
          );
        }

        // Add newly discovered paths (that haven't been processed/queued) to the next processing queue
        newPathsToQueue.forEach((p) => pathsToProcess.add(p));

        return newPathsToQueue; // Return paths added to the queue for this doc
      });

      // Wait for all processing in the current batch
      await Promise.all(discoveryPromises);

      // Loop continues if pathsToProcess has new paths added, otherwise exits
      logger.debug(`Next link processing batch size: ${pathsToProcess.size}`);
    }
    logger.info("Finished resolving all links.");
  }

  /**
   * Gets a single doc or file. Checks the cache first. If not found, reads and
   * parses the file. Handles potential read/parse errors. Adds successfully
   * read/parsed docs (or error placeholders) to the internal map.
   */
  async getDoc(absoluteFilePath: string): Promise<Doc> {
    if (this.docMap.has(absoluteFilePath)) {
      return this.docMap.get(absoluteFilePath)!;
    }
    logger.debug(`Cache miss. Reading file: ${absoluteFilePath}`);

    try {
      const fileContent = await this.fileSystem.readFile(absoluteFilePath);
      const isMarkdown = this.docParser.isMarkdown(absoluteFilePath);
      let doc: Doc;
      if (isMarkdown) {
        doc = this.docParser.parse(absoluteFilePath, fileContent);
      } else {
        // For non-markdown, create a basic doc entry without parsing frontmatter
        doc = this.docParser.getBlankDoc(absoluteFilePath, fileContent);
        doc.isMarkdown = false; // Ensure flag is false
      }

      this.docMap.set(absoluteFilePath, doc);
      return doc;
    } catch (error) {
      // Log specific error type if available (e.g., ENOENT)
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        `Error reading or parsing file for graph: ${absoluteFilePath}. Error: ${errorMessage}`
      );
      // Create a minimal placeholder Doc to avoid breaking the graph build,
      // but ensure it's not added to pathsToProcess later if possible.
      const errorDoc = this.docParser.getBlankDoc(
        absoluteFilePath,
        `Error loading content: ${errorMessage}`,
        true
      );
      errorDoc.isMarkdown = this.docParser.isMarkdown(absoluteFilePath); // Keep isMarkdown consistent
      this.docMap.set(absoluteFilePath, errorDoc); // Still add placeholder to map
      return errorDoc;
    }
  }

  /**
   * Gets multiple Docs in parallel using getDoc (which utilizes the cache).
   * Filters duplicates from the input list.
   */
  async getDocs(absoluteFilePaths: string[]): Promise<Doc[]> {
    const uniquePaths = Array.from(new Set(absoluteFilePaths));
    return await Promise.all(uniquePaths.map((absoluteFilePath) => this.getDoc(absoluteFilePath)));
  }

  /**
   * Adds or updates multiple documents in the graph map.
   */
  setDocs(docs: Doc[]) {
    docs.forEach((doc) => {
      this.docMap.set(doc.filePath, doc);
    });
  }
}
