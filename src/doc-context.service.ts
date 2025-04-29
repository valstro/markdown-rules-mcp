import micromatch from "micromatch";
import { Config } from "./config.js";
import { logger } from "./logger.js";
import {
  AttachedItem,
  Doc,
  DocContextSections,
  DocIndex,
  DocLink,
  DocLinkRange,
  IDocContextService,
  IDocFormatterService,
  IDocIndexService,
  IFileSystemService,
} from "./types.js";
import { getErrorMsg } from "./util.js";

// Helper function for topological sort
// Sorts items based on their link dependencies within the provided set
function topologicalSort(
  itemsToSort: AttachedItem[],
  docMap: DocIndex, // Pass the whole index for link lookup
  reverse: boolean // true = post-order (dependencies first), false = pre-order (dependents first)
): AttachedItem[] {
  const adj: Map<string, Set<string>> = new Map(); // dependency -> dependents
  const inDegree: Map<string, number> = new Map();
  const itemMap: Map<string, AttachedItem> = new Map(); // filePath -> AttachedItem

  // Initialize maps and build graph nodes
  itemsToSort.forEach((item) => {
    if (!itemMap.has(item.filePath)) {
      itemMap.set(item.filePath, item);
      adj.set(item.filePath, new Set());
      inDegree.set(item.filePath, 0);
    }
  });

  // Build graph edges based on non-inline links within the set
  itemMap.forEach((item, dependentFilePath) => {
    const doc = docMap.get(dependentFilePath);
    if (doc && doc.linksTo) {
      doc.linksTo.forEach((link) => {
        // Only consider links to other items *within the current set* for sorting
        if (!link.isInline && itemMap.has(link.filePath)) {
          const dependencyFilePath = link.filePath;
          // Draw edge from dependency to dependent
          if (!adj.get(dependencyFilePath)?.has(dependentFilePath)) {
            adj.get(dependencyFilePath)?.add(dependentFilePath);
            inDegree.set(dependentFilePath, (inDegree.get(dependentFilePath) || 0) + 1);
            logger.debug(`Topological Sort Edge: ${dependencyFilePath} -> ${dependentFilePath}`);
          }
        }
      });
    }
  });

  // Initialize queue with nodes having in-degree 0
  const queue: string[] = [];
  inDegree.forEach((degree, filePath) => {
    if (degree === 0) {
      queue.push(filePath);
    }
  });

  const sortedResult: AttachedItem[] = [];
  while (queue.length > 0) {
    // Dequeue in alphabetical order for deterministic results when multiple nodes have in-degree 0
    queue.sort();
    const u = queue.shift()!;
    sortedResult.push(itemMap.get(u)!);

    // For each neighbor v of u
    adj.get(u)?.forEach((v) => {
      const currentInDegree = (inDegree.get(v) || 0) - 1;
      inDegree.set(v, currentInDegree);
      // If in-degree of v becomes 0, add it to queue
      if (currentInDegree === 0) {
        queue.push(v);
      }
    });
  }

  // Check for cycles
  if (sortedResult.length !== itemMap.size) {
    logger.warn(
      `Cycle detected or missing nodes in topological sort for a section. Graph size: ${itemMap.size}, Sorted size: ${sortedResult.length}. Result may be incomplete or incorrectly ordered.`
    );
    // Attempt to add remaining items to avoid losing them
    const sortedPaths = new Set(sortedResult.map((item) => item.filePath));
    itemMap.forEach((item) => {
      if (!sortedPaths.has(item.filePath)) {
        sortedResult.push(item);
        logger.debug(`Appending potentially unsorted item due to cycle/error: ${item.filePath}`);
      }
    });
  }

  // Reverse for post-order if needed (dependencies first)
  if (reverse) {
    logger.debug("Topological Sort: Reversing for post-order (dependencies first)");
    return sortedResult.reverse();
  } else {
    logger.debug("Topological Sort: Using pre-order (dependents first/natural)");
    return sortedResult; // Pre-order
  }
}

export class DocContextService implements IDocContextService {
  constructor(
    private config: Config,
    private fileSystem: IFileSystemService,
    private docIndexService: IDocIndexService,
    private docFormatter: IDocFormatterService
  ) {}

  async buildContext(
    attachedFiles: string[], // Absolute paths of files currently open/focused by the user
    relevantDocsByDescription: string[] // Absolute paths of docs selected by agent/user via description
  ): Promise<string> {
    // Changed return type to string as per interface
    // Fetch the full index once
    const docIndex: DocIndex = await this.docIndexService.buildIndex(); // Assuming buildIndex returns the map

    const sections: DocContextSections = {
      alwaysAttachedDocs: [],
      autoAttachedDocs: [],
      agentAttachedDocs: [],
      relatedAttachedFiles: [],
      relatedAttachedDocs: [],
    };

    const includedPaths = new Set<string>(); // Tracks paths added to any section
    // Cache for content after processing inlines to avoid reprocessing
    const processedContentCache: Map<string, string> = new Map();

    // --- 1. Identify Initial Set ---

    // a) alwaysApply docs (identified by metadata)
    docIndex.forEach((doc) => {
      if (doc.meta.alwaysApply && !doc.isError) {
        sections.alwaysAttachedDocs.push(this.createAttachedItem(doc));
        includedPaths.add(doc.filePath);
      }
    });

    // b) autoAttachedDocs (docs whose globs match attachedFiles)
    docIndex.forEach((doc) => {
      if (
        !includedPaths.has(doc.filePath) && // Avoid adding if already an alwaysApply doc
        doc.meta.globs &&
        doc.meta.globs.length > 0 &&
        !doc.isError
      ) {
        // Check if any attached file matches any of the doc's globs
        const isMatch = micromatch(attachedFiles, doc.meta.globs).length > 0;
        if (isMatch) {
          sections.autoAttachedDocs.push(this.createAttachedItem(doc));
          includedPaths.add(doc.filePath);
          logger.debug(`Auto-attaching doc ${doc.filePath} due to glob match with attached files.`);
        }
      }
    });

    // c) agentAttachedDocs (explicitly provided by description lookup)
    for (const filePath of relevantDocsByDescription) {
      if (!includedPaths.has(filePath)) {
        const doc = docIndex.get(filePath);
        if (doc && !doc.isError) {
          sections.agentAttachedDocs.push(this.createAttachedItem(doc));
          includedPaths.add(filePath);
        } else if (doc && doc.isError) {
          logger.warn(`Agent attached doc ${filePath} has an error: ${doc.errorReason}. Skipping.`);
        } else {
          logger.warn(`Agent attached doc ${filePath} not found in index.`);
        }
      }
    }

    // d) Add attachedFiles themselves if they are known docs and not already included
    for (const filePath of attachedFiles) {
      if (!includedPaths.has(filePath)) {
        const doc = docIndex.get(filePath);
        if (doc && !doc.isError) {
          // Treat it like an auto-attached doc if it wasn't added by glob/agent
          logger.debug(`Adding attached file ${filePath} as auto-attached doc.`);
          sections.autoAttachedDocs.push(this.createAttachedItem(doc));
          includedPaths.add(filePath);
        } else if (doc && doc.isError) {
          logger.warn(
            `Attached file ${filePath} is a doc with an error: ${doc.errorReason}. Skipping.`
          );
        }
        // If it's an attached file but not a *known doc*, it will be handled later
        // when checking links (if linked) or potentially added as a related file.
      }
    }

    // --- 2. Process Inlines and Collect Non-Inline Links ---

    const allInitialItems = [
      ...sections.alwaysAttachedDocs,
      ...sections.autoAttachedDocs,
      ...sections.agentAttachedDocs,
    ];

    const nonInlineLinksMap = new Map<string, DocLink>(); // Store unique non-inline links

    for (const item of allInitialItems) {
      const doc = docIndex.get(item.filePath);
      if (!doc || doc.isError || !doc.isMarkdown || !doc.linksTo || doc.linksTo.length === 0) {
        // If it's not a markdown doc or has no links, just ensure its content is cached (or read)
        if (!processedContentCache.has(item.filePath)) {
          try {
            const rawContent = doc ? doc.content : await this.fileSystem.readFile(item.filePath);
            processedContentCache.set(item.filePath, rawContent);
            item.content = rawContent; // Update item content
          } catch (e) {
            logger.error(`Error reading content for ${item.filePath}: ${getErrorMsg(e)}`);
            const errorContent = `<!-- Error reading content for ${item.filePath} -->`;
            processedContentCache.set(item.filePath, errorContent);
            item.content = errorContent;
          }
        } else {
          item.content = processedContentCache.get(item.filePath)!; // Use cached content
        }
        continue; // Skip inline processing
      }

      // Process inlines for this markdown doc
      let currentContent = doc.content; // Start with original content
      const linksToProcess = [...doc.linksTo].sort((a, b) => b.startIndex - a.startIndex); // Process last link first

      for (const link of linksToProcess) {
        if (link.isInline) {
          try {
            // Read content of the *linked* file
            const linkedDoc = docIndex.get(link.filePath);
            const linkedContentRaw =
              linkedDoc?.content ?? (await this.fileSystem.readFile(link.filePath));
            const contentSlice = this.getContentSlice(linkedContentRaw, link.inlineLinesRange);
            const inlineTag = this.docFormatter.formatInlineDoc(link, contentSlice);

            // Replace the original markdown link with the formatted inline tag
            currentContent =
              currentContent.substring(0, link.startIndex) +
              inlineTag +
              currentContent.substring(link.endIndex);

            logger.debug(`Inlined link from ${item.filePath} to ${link.filePath}`);
          } catch (inlineError) {
            logger.error(
              `Failed to process inline link [${link.anchorText}](${link.filePath}) in ${item.filePath}: ${getErrorMsg(inlineError)}`
            );
            // Optionally replace with an error comment
            const errorTag = `<!-- Error inlining ${link.filePath}: ${getErrorMsg(inlineError)} -->`;
            currentContent =
              currentContent.substring(0, link.startIndex) +
              errorTag +
              currentContent.substring(link.endIndex);
          }
        } else {
          // Collect non-inline links if they aren't already included
          if (!includedPaths.has(link.filePath)) {
            // Use link target path as key to ensure uniqueness
            if (!nonInlineLinksMap.has(link.filePath)) {
              nonInlineLinksMap.set(link.filePath, link);
            }
          }
        }
      }
      // Cache the fully processed content (with inlines resolved)
      processedContentCache.set(item.filePath, currentContent);
      item.content = currentContent; // Update item content
    }

    // --- 3. Populate Related Sections ---

    for (const link of nonInlineLinksMap.values()) {
      // Double-check it wasn't included in the initial pass
      if (includedPaths.has(link.filePath)) continue;

      const relatedDoc = docIndex.get(link.filePath);
      if (relatedDoc && !relatedDoc.isError) {
        logger.debug(`Adding related doc: ${link.filePath}`);
        sections.relatedAttachedDocs.push(this.createAttachedItem(relatedDoc));
        includedPaths.add(link.filePath);
      } else if (relatedDoc && relatedDoc.isError) {
        logger.warn(
          `Skipping related doc ${link.filePath} due to error: ${relatedDoc.errorReason}`
        );
      } else {
        // Check if it's a file that exists but isn't in the doc index
        const exists = await this.fileSystem.pathExists(link.filePath);
        if (exists) {
          logger.debug(`Adding related file: ${link.filePath}`);
          sections.relatedAttachedFiles.push({
            filePath: link.filePath,
            isMarkdown: link.filePath.toLowerCase().endsWith(".md"), // Guess based on extension
            content: undefined, // Content read on demand later if needed for sorting/formatting
          });
          includedPaths.add(link.filePath);
        } else {
          logger.warn(`Link target "${link.filePath}" not found in index or filesystem.`);
        }
      }
    }

    // --- 4. Load Content for Remaining Items & Final De-duplication ---
    // Ensure all items have content, reading from cache or file system
    const allItems = [
      ...sections.alwaysAttachedDocs,
      ...sections.autoAttachedDocs,
      ...sections.agentAttachedDocs,
      ...sections.relatedAttachedDocs,
      ...sections.relatedAttachedFiles,
    ];

    for (const item of allItems) {
      if (item.content === undefined) {
        // Check if content needs loading
        if (processedContentCache.has(item.filePath)) {
          item.content = processedContentCache.get(item.filePath);
        } else {
          try {
            const rawContent = await this.fileSystem.readFile(item.filePath);
            item.content = rawContent;
            processedContentCache.set(item.filePath, rawContent); // Cache for potential future use
          } catch (e) {
            logger.error(`Error reading content for ${item.filePath}: ${getErrorMsg(e)}`);
            item.content = `<!-- Error reading content for ${item.filePath} -->`;
            processedContentCache.set(item.filePath, item.content);
          }
        }
      }
    }

    // De-duplication is implicitly handled by the `includedPaths` set during population.

    // --- 5. Sort Sections ---
    const hoistDependenciesFirst = this.config.HOIST_ORDER === "post";

    sections.alwaysAttachedDocs = topologicalSort(
      sections.alwaysAttachedDocs,
      docIndex,
      hoistDependenciesFirst
    );
    sections.autoAttachedDocs = topologicalSort(
      sections.autoAttachedDocs,
      docIndex,
      hoistDependenciesFirst
    );
    sections.agentAttachedDocs = topologicalSort(
      sections.agentAttachedDocs,
      docIndex,
      hoistDependenciesFirst
    );
    sections.relatedAttachedDocs = topologicalSort(
      sections.relatedAttachedDocs,
      docIndex,
      hoistDependenciesFirst
    );
    // Sorting relatedAttachedFiles might be less meaningful without dependency info,
    // but we can sort alphabetically for consistency.
    sections.relatedAttachedFiles.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // --- 6. Format Final Context ---
    return this.docFormatter.formatContext(sections);
  }

  private createAttachedItem(doc: Doc): AttachedItem {
    return {
      filePath: doc.filePath,
      description: doc.meta.description,
      content: undefined, // Will be filled later
      isMarkdown: doc.isMarkdown,
    };
  }

  /**
   * Extracts a slice of content based on line numbers (1-based index).
   */
  private getContentSlice(content: string, range?: DocLinkRange): string {
    if (!range) {
      return content; // No range means full content
    }

    const lines = content.split("\n");
    // Line numbers are 1-based in the link, convert to 0-based for slice
    const startLineIndex = range.from > 0 ? range.from - 1 : 0;
    const endLineIndex = range.to === "end" ? lines.length : range.to >= 0 ? range.to : 0; // slice goes up to, but not including, end

    if (startLineIndex < 0 || startLineIndex >= lines.length) {
      logger.warn(
        `getContentSlice: Start line ${range.from} is out of bounds (1-${lines.length}). Returning empty string.`
      );
      return "";
    }
    // Allow slicing up to the very end
    // if (endLineIndex > lines.length) {
    //      logger.warn(`getContentSlice: End line ${range.to} is out of bounds (1-${lines.length}). Clamping to end.`);
    //      endLineIndex = lines.length;
    // }

    if (endLineIndex < startLineIndex) {
      logger.warn(
        `getContentSlice: End line ${range.to} is before start line ${range.from}. Returning empty string.`
      );
      return "";
    }

    // Slice extracts from start index up to (but not including) end index.
    const slicedLines = lines.slice(startLineIndex, endLineIndex);

    return slicedLines.join("\n");
  }
}
