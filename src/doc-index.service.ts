import { logger } from "./logger.js";
import { Config } from "./config.js";
import {
  Doc,
  DocIndex,
  IDocIndexService,
  IDocParserService,
  IFileSystemService,
  ILinkExtractorService,
} from "./types.js";
import { getErrorMsg } from "./util.js";

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
  private pendingDocPromises: Map<string, Promise<Doc>> = new Map(); // Cache for ongoing fetches

  get docs(): Doc[] {
    return Array.from(this.docMap.values());
  }

  getDocMap(): DocIndex {
    return this.docMap;
  }

  constructor(
    private config: Config,
    private fileSystem: IFileSystemService,
    private docParser: IDocParserService,
    private linkExtractor: ILinkExtractorService
  ) {}

  /**
   * Builds the complete document graph.
   * 1. Loads initial documents based on the configured glob pattern.
   * 2. Recursively discovers and loads all documents linked from the initial set.
   */
  async buildIndex(): Promise<DocIndex> {
    this.docMap.clear();
    this.pendingDocPromises.clear(); // Also clear pending promises on rebuild

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
        // Only process non-error markdown files for links
        if (!doc.isMarkdown || doc.isError) {
          return [];
        }

        // Use the links already populated by getDoc when the doc was loaded/parsed
        const linkedDocs = doc.linksTo;

        // Identify paths that are not yet in our graph map
        const newPathsToLoad = linkedDocs
          .filter((link) => !this.docMap.has(link.filePath))
          .map((link) => link.filePath);

        // Identify paths to queue for the *next* processing iteration.
        // These are linked paths that haven't been processed *in any previous or the current* iteration.
        const newPathsToQueue = linkedDocs
          .filter(
            (link) => !processedPaths.has(link.filePath) && !pathsToProcess.has(link.filePath)
          ) // Check processedPaths *and* the current pathsToProcess buffer
          .map((link) => link.filePath);

        if (newPathsToLoad.length > 0) {
          // Fetch the newly discovered documents (this also adds them to docMap via getDoc, which extracts links)
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
    // Ensure case consistency if needed, assuming paths are already normalized
    const normalizedPath = absoluteFilePath; // Add normalization if required by OS/FS

    if (this.docMap.has(normalizedPath)) {
      return this.docMap.get(normalizedPath)!;
    }
    // Check if a fetch for this doc is already in progress
    if (this.pendingDocPromises.has(normalizedPath)) {
      logger.debug(`Cache miss, but fetch in progress for: ${normalizedPath}`);
      return this.pendingDocPromises.get(normalizedPath)!;
    }

    logger.debug(`Cache miss. Reading file: ${normalizedPath}`);

    // Start the fetch and store the promise
    const fetchPromise = (async (): Promise<Doc> => {
      try {
        const fileContent = await this.fileSystem.readFile(normalizedPath);
        const isMarkdown = this.docParser.isMarkdown(normalizedPath);
        let doc: Doc;
        if (isMarkdown) {
          doc = this.docParser.parse(normalizedPath, fileContent);
          // Ensure links are extracted when the doc is first parsed
          if (!doc.isError) {
            // Only extract links if parsing didn't fail
            doc.linksTo = this.linkExtractor.extractLinks(normalizedPath, fileContent);
          }
        } else {
          // For non-markdown, create a basic doc entry without parsing frontmatter
          doc = this.docParser.getBlankDoc(normalizedPath, {
            content: fileContent,
            isMarkdown: false,
          });
        }

        this.docMap.set(normalizedPath, doc);
        return doc;
      } catch (error) {
        // Log specific error type if available (e.g., ENOENT)
        const errorMessage = getErrorMsg(error);
        logger.error(
          `Error reading or parsing file for graph: ${normalizedPath}. Error: ${errorMessage}`
        );
        // Create a minimal placeholder Doc
        const errorDoc = this.docParser.getBlankDoc(normalizedPath, {
          isError: true,
          errorReason: `Error loading content: ${errorMessage}`,
          isMarkdown: this.docParser.isMarkdown(normalizedPath), // Try to determine type even on error
        });
        this.docMap.set(normalizedPath, errorDoc); // Still add placeholder to map
        return errorDoc;
      } finally {
        // Once fetch is complete (success or error), remove the pending promise
        this.pendingDocPromises.delete(normalizedPath);
      }
    })();

    this.pendingDocPromises.set(normalizedPath, fetchPromise);
    return fetchPromise;
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

  /**
   * Returns all markdown docs that are not global and have no auto-attachment globs.
   * These are the docs that can be attached automatically by the agent based on the
   * description.
   */
  getAgentAttachableDocs(): Doc[] {
    return this.docs
      .filter(
        (doc) =>
          doc.isMarkdown &&
          doc.meta.description && // Must have a description
          !doc.meta.alwaysApply && // Not global
          (!doc.meta.globs || doc.meta.globs.length === 0) // No auto-attachment globs
      )
      .map((doc) => doc);
  }
}
