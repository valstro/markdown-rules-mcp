import micromatch from "micromatch";
import {
  ContextItem,
  IDocContextService,
  IDocFormatterService,
  IDocIndexService,
  AttachedItemType,
} from "./types.js";
import { Config } from "./config.js";
import { logger } from "./logger.js";
import path from "path";

const typePriority: Record<AttachedItemType, number> = {
  always: 0,
  auto: 1,
  agent: 2,
  related: 3,
};

export class DocContextService implements IDocContextService {
  constructor(
    private config: Config,
    private docIndexService: IDocIndexService,
    private docFormatterService: IDocFormatterService
  ) {}

  /**
   * Builds the context items for the given attached files and relevant docs by description.
   * @param attachedFiles - The attached files to include in the context.
   * @param relevantDocsByDescription - The relevant doc pathsby description to include in the context.
   * @returns The context items.
   */
  async buildContextItems(
    attachedFiles: string[],
    relevantDocsByDescription: string[]
  ): Promise<ContextItem[]> {
    const allDocsMap = this.docIndexService.getDocMap();
    if (allDocsMap.size === 0) {
      logger.warn("Document index is empty. Cannot build context.");
      return [];
    }

    const contextItemsMap = new Map<string, ContextItem>();

    const initialPaths = new Set<string>();

    for (const doc of allDocsMap.values()) {
      if (doc.isError) continue;

      let currentType: AttachedItemType | null = null;
      let currentPriority = Infinity;

      if (doc.meta.alwaysApply) {
        currentType = "always";
        currentPriority = typePriority.always;
      }

      if (currentPriority > typePriority.auto) {
        if (doc.meta.globs && doc.meta.globs.length > 0) {
          const isMatch = attachedFiles.some((attachedFile) => {
            const relativeAttachedFile = path.relative(this.config.PROJECT_ROOT, attachedFile);
            return micromatch.isMatch(relativeAttachedFile, doc.meta.globs!, {
              dot: true,
            });
          });
          if (isMatch) {
            currentType = "auto";
            currentPriority = typePriority.auto;
          }
        }
      }

      if (currentPriority > typePriority.agent) {
        if (relevantDocsByDescription.includes(doc.filePath)) {
          currentType = "agent";
          currentPriority = typePriority.agent;
        }
      }

      if (currentType) {
        contextItemsMap.set(doc.filePath, { doc, type: currentType });
        initialPaths.add(doc.filePath);
      }
    }

    logger.debug(
      `Initial context paths (${initialPaths.size}): ${Array.from(initialPaths).join(", ")}`
    );

    const queue = Array.from(initialPaths);
    const visited = new Set<string>(initialPaths);

    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const currentItem = contextItemsMap.get(currentPath);

      if (!currentItem || !currentItem.doc || currentItem.doc.isError) continue;

      for (const link of currentItem.doc.linksTo) {
        if (link.isInline) {
          logger.debug(`Skipping traversal for inline link: ${link.filePath} from ${currentPath}`);
          continue;
        }

        const linkedDoc = allDocsMap.get(link.filePath);
        if (!linkedDoc || linkedDoc.isError) {
          logger.warn(
            `Skipping link to non-existent or error doc: ${link.filePath} from ${currentPath}`
          );
          continue;
        }

        if (!contextItemsMap.has(link.filePath)) {
          contextItemsMap.set(link.filePath, {
            doc: linkedDoc,
            type: "related",
            linkedViaAnchor: link.anchorText,
          });
          visited.add(link.filePath);
          queue.push(link.filePath);
          logger.debug(
            `Added related doc: ${link.filePath} (linked from ${currentPath} with anchor "${link.anchorText}")`
          );
        }
      }
    }

    logger.info(`Total context items after traversal: ${contextItemsMap.size}`);

    let finalItems = Array.from(contextItemsMap.values());

    finalItems = this.sortItems(finalItems, typePriority);

    return finalItems;
  }

  /**
   * Builds the context output for the given attached files and relevant docs by description.
   * @param attachedFiles - The attached files to include in the context.
   * @param relevantDocsByDescription - The relevant doc pathsby description to include in the context.
   * @returns The context output.
   */
  async buildContextOutput(
    attachedFiles: string[],
    relevantDocsByDescription: string[]
  ): Promise<string> {
    const contextItems = await this.buildContextItems(attachedFiles, relevantDocsByDescription);
    return this.docFormatterService.formatContextOutput(contextItems);
  }

  private sortItems(
    items: ContextItem[],
    typePriority: Record<AttachedItemType, number>
  ): ContextItem[] {
    const sortedPaths = this.topologicalSort(items);

    const itemMap = new Map(items.map((item) => [item.doc.filePath, item]));

    const sortedItems = sortedPaths
      .map((path) => itemMap.get(path))
      .filter((item) => item !== undefined) as ContextItem[];

    logger.debug(
      `Sorted context paths (topo order: ${this.config.CONTEXT_SORT_ORDER}) (${sortedItems.length}): ${sortedItems.map((i) => `${i.doc.filePath} (${i.type})`).join(", ")}`
    );

    return sortedItems;
  }

  private topologicalSort(items: ContextItem[]): string[] {
    const sorted: string[] = []; // Will hold the reverse topological order initially
    const visiting = new Set<string>(); // Nodes currently in the recursion stack (for cycle detection)
    const finished = new Set<string>(); // Nodes completely visited
    const adj = new Map<string, string[]>(); // Adjacency list (A -> B means A links to/depends on B)
    const itemPaths = new Set(items.map((item) => item.doc.filePath));

    // Build the adjacency list
    for (const item of items) {
      const sourcePath = item.doc.filePath;
      if (!adj.has(sourcePath)) adj.set(sourcePath, []);

      for (const link of item.doc.linksTo) {
        if (link.isInline) continue;

        const targetPath = link.filePath;
        // Only consider links to other items within the current context set
        if (itemPaths.has(targetPath)) {
          adj.get(sourcePath)!.push(targetPath); // Add edge from source to target (dependency)
        }
      }
    }

    const visit = (node: string) => {
      if (finished.has(node)) return; // Already visited and finished
      if (visiting.has(node)) {
        // Cycle detected
        logger.warn(`Cycle detected involving node: ${node}. Topological sort might be affected.`);
        // We don't add it to sorted here, let the main loop handle it if needed
        return;
      }

      visiting.add(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        // Ensure the neighbor is part of the items we are sorting
        if (itemPaths.has(neighbor)) {
          visit(neighbor);
        }
      }

      visiting.delete(node); // Remove from current recursion stack
      finished.add(node); // Mark as completely visited
      sorted.push(node); // Add to the list *after* visiting all dependencies (post-order)
    };

    // Sort initial nodes alphabetically for deterministic starting order
    const initialNodes = items.map((item) => item.doc.filePath).sort();

    for (const itemPath of initialNodes) {
      if (!finished.has(itemPath)) {
        visit(itemPath);
      }
    }

    // At this point, `sorted` contains the reverse topological order.
    // Dependencies appear *before* the items that depend on them.

    // Check for missed nodes (can happen with cycles or disconnected components not reachable from initial triggers)
    // This existing check seems reasonable to keep.
    if (items.length > sorted.length) {
      const missing = items
        .map((i) => i.doc.filePath)
        .filter((p) => !sorted.includes(p))
        .sort();
      if (missing.length > 0) {
        logger.warn(
          `Adding ${missing.length} nodes potentially missed (e.g., due to cycles or being unlinked roots): ${missing.join(", ")}`
        );
        // Add missing nodes. Their exact order relative to others might be arbitrary
        // if they were part of cycles or disconnected, but they need to be included.
        // Appending them maintains the relative order of the successfully sorted portion.
        sorted.push(...missing);
      }
    }

    // Reverse the list only if reverse-topological sort is required (item before dependencies)
    if (this.config.CONTEXT_SORT_ORDER === "reverse-topological") {
      // logger.debug("Reversing list for reverse-topological order.");
      return sorted.reverse();
    } else {
      // logger.debug("Using natural post-order for topological (dependencies first).");
      return sorted; // Return natural post-order for topological (dependencies first)
    }
  }
}
