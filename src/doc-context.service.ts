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
  manual: 3,
  related: 4,
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

    // Pre-compute a set of attached file paths for efficient lookup
    const attachedFilesSet = new Set(attachedFiles);

    for (const doc of allDocsMap.values()) {
      if (doc.isError) continue;

      let currentType: AttachedItemType | null = null;
      let currentPriority = Infinity; // Initialize with a high value, lower is better priority

      // Highest priority: Always apply
      if (doc.meta.alwaysApply) {
        currentType = "always";
        currentPriority = typePriority.always;
      }

      // Next priority: Auto glob match
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

      // Next priority: Agent description match
      if (currentPriority > typePriority.agent) {
        if (doc.meta.description && relevantDocsByDescription.includes(doc.meta.description)) {
          currentType = "agent";
          currentPriority = typePriority.agent;
        }
      }

      // Lowest explicit priority: Manual attachment
      if (currentPriority > typePriority.manual && attachedFilesSet.has(doc.filePath)) {
        currentType = "manual";
      }

      // If any type was assigned, add the doc to the context
      if (currentType) {
        // Check if it already exists and update type only if the new type has strictly *higher* priority (lower number)
        const existingItem = contextItemsMap.get(doc.filePath);
        if (!existingItem || typePriority[currentType] < typePriority[existingItem.type]) {
          contextItemsMap.set(doc.filePath, { doc, type: currentType });
        }
        initialPaths.add(doc.filePath);
      }
    }

    logger.debug(
      `Initial context paths (${initialPaths.size}): ${Array.from(initialPaths).join(", ")}`
    );

    const queue = Array.from(initialPaths);
    const visited = new Set<string>(initialPaths); // Keep track of visited to avoid cycles and redundant work

    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const currentItem = contextItemsMap.get(currentPath); // Should always exist here

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

        // Only add related docs if they haven't been added through any other mechanism yet.
        // Store the path of the item that introduced this related link.
        if (!contextItemsMap.has(link.filePath)) {
          contextItemsMap.set(link.filePath, {
            doc: linkedDoc,
            type: "related",
            linkedViaAnchor: link.anchorText,
            linkedFromPath: currentPath, // Store the path of the item linking to it
          });
          // Add to visited *and* queue only if it wasn't visited before adding it now.
          if (!visited.has(link.filePath)) {
            visited.add(link.filePath);
            queue.push(link.filePath);
            logger.debug(
              `Added related doc: ${link.filePath} (linked from ${currentPath} via "${link.anchorText}")`
            );
          }
        } else {
          // Log if a doc was already included via a different mechanism
          logger.debug(
            `Skipping adding ${link.filePath} as related from ${currentPath} as it's already included with type ${contextItemsMap.get(link.filePath)?.type}`
          );
        }
      }
    }

    logger.info(`Total context items before sorting: ${contextItemsMap.size}`);

    let finalItems = Array.from(contextItemsMap.values());

    finalItems = this.sortItems(finalItems);

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

  /**
   * Sorts context items based on type, path, and hoisting rules.
   *
   * Behavior:
   * 1. Non-related items are sorted primarily by type priority (always, auto, agent, manual)
   *    and secondarily by file path alphabetically.
   * 2. Related items are handled based on the `HOIST_CONTEXT` configuration:
   *    - If true (default): A related item is placed immediately *before* the first non-related item
   *      (in the sorted order) that links to it. If an item is linked by multiple non-related items,
   *      it's placed before the one that appears earliest in the sorted non-related list.
   *    - If false: A related item is placed immediately *after* the first non-related item
   *      (in the sorted order) that links to it.
   * 3. Related items linked only by other related items, or whose linkers are not included
   *    in the final list (orphans), are appended to the very end, sorted alphabetically by path.
   * 4. Multiple related items linked by the same non-related item are sorted alphabetically by path
   *    relative to each other.
   *
   * @param items The list of ContextItem objects to sort.
   * @returns A new array containing the sorted ContextItem objects.
   */
  private sortItems(items: ContextItem[]): ContextItem[] {
    const hoistContext = this.config.HOIST_CONTEXT ?? true; // Default to true

    const relatedItems = items.filter((item) => item.type === "related");
    const nonRelatedItems = items.filter((item) => item.type !== "related");

    // 1. Sort non-related items by type priority then path
    nonRelatedItems.sort((a, b) => {
      const priorityDiff = typePriority[a.type] - typePriority[b.type];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.doc.filePath.localeCompare(b.doc.filePath);
    });

    // 2. Group related items by *all* their non-related linkers and identify orphans
    const relatedLinkers = new Map<string, string[]>(); // Map: relatedPath -> [linkerPath1, linkerPath2]
    const relatedItemsMap = new Map<string, ContextItem>(); // Map: relatedPath -> ContextItem
    relatedItems.forEach((item) => relatedItemsMap.set(item.doc.filePath, item));

    const orphanRelatedItems: ContextItem[] = [];

    for (const relatedItem of relatedItems) {
      let hasNonRelatedLinker = false;
      for (const potentialLinker of items) {
        // Check if potentialLinker is non-related and links to relatedItem
        if (
          potentialLinker.type !== "related" &&
          potentialLinker.doc.linksTo.some((link) => link.filePath === relatedItem.doc.filePath)
        ) {
          const relatedPath = relatedItem.doc.filePath;
          if (!relatedLinkers.has(relatedPath)) {
            relatedLinkers.set(relatedPath, []);
          }
          relatedLinkers.get(relatedPath)!.push(potentialLinker.doc.filePath);
          hasNonRelatedLinker = true;
        }
      }
      if (!hasNonRelatedLinker) {
        logger.warn(
          `Related item ${relatedItem.doc.filePath} has no non-related linkers in the current context. Treating as orphan.`
        );
        orphanRelatedItems.push(relatedItem);
      }
    }
    // Sort orphans alphabetically
    orphanRelatedItems.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));

    // 3. Construct final list based on hoistContext
    const finalSortedItems: ContextItem[] = [];
    const placedRelatedPaths = new Set<string>(); // Keep track of placed related docs

    // Create a map for quick lookup of related items to insert before/after a non-related item
    const itemsToInsertByLinker = new Map<string, ContextItem[]>(); // Map: linkerPath -> [relatedItem1, relatedItem2]

    for (const [relatedPath, linkerPaths] of relatedLinkers.entries()) {
      const relatedItem = relatedItemsMap.get(relatedPath);
      if (!relatedItem) continue; // Should not happen

      // Find the first non-related item in the sorted list that links to this related item
      let firstLinkerPath: string | undefined = undefined;
      for (const nrItem of nonRelatedItems) {
        if (linkerPaths.includes(nrItem.doc.filePath)) {
          firstLinkerPath = nrItem.doc.filePath;
          break;
        }
      }

      if (firstLinkerPath) {
        if (!itemsToInsertByLinker.has(firstLinkerPath)) {
          itemsToInsertByLinker.set(firstLinkerPath, []);
        }
        itemsToInsertByLinker.get(firstLinkerPath)!.push(relatedItem);
      } else {
        // This case might happen if linkers exist but are not in the final nonRelatedItems list (e.g. filtered out previously)
        // Treat as orphan for placement purposes
        logger.warn(
          `Could not find first linker for related item ${relatedPath} among sorted non-related items. Treating as orphan for placement.`
        );
        if (!orphanRelatedItems.some((orphan) => orphan.doc.filePath === relatedPath)) {
          orphanRelatedItems.push(relatedItem);
          // Re-sort orphans just in case
          orphanRelatedItems.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));
        }
      }
    }

    // Sort related items associated with each linker alphabetically
    for (const relatedGroup of itemsToInsertByLinker.values()) {
      relatedGroup.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));
    }

    // 4. Assemble the final list
    for (const nonRelatedItem of nonRelatedItems) {
      const linkerPath = nonRelatedItem.doc.filePath;
      const relatedGroupToInsert = itemsToInsertByLinker.get(linkerPath) ?? [];

      // Hoist: Place related items *before* their first non-related linker
      if (hoistContext) {
        for (const relatedItem of relatedGroupToInsert) {
          if (!placedRelatedPaths.has(relatedItem.doc.filePath)) {
            logger.debug(
              `Hoisting related item ${relatedItem.doc.filePath} before linker ${linkerPath}`
            );
            finalSortedItems.push(relatedItem);
            placedRelatedPaths.add(relatedItem.doc.filePath);
          }
        }
      }

      // Add the non-related item itself
      finalSortedItems.push(nonRelatedItem);

      // No Hoist: Place related items *after* their first non-related linker
      if (!hoistContext) {
        for (const relatedItem of relatedGroupToInsert) {
          if (!placedRelatedPaths.has(relatedItem.doc.filePath)) {
            logger.debug(
              `Placing related item ${relatedItem.doc.filePath} after linker ${linkerPath}`
            );
            finalSortedItems.push(relatedItem);
            placedRelatedPaths.add(relatedItem.doc.filePath);
          }
        }
      }
    }

    // 5. Append any orphan related items at the end
    for (const orphan of orphanRelatedItems) {
      if (!placedRelatedPaths.has(orphan.doc.filePath)) {
        logger.warn(`Appending orphan related item ${orphan.doc.filePath} to the end.`);
        finalSortedItems.push(orphan);
        placedRelatedPaths.add(orphan.doc.filePath);
      }
    }

    // 6. Sanity checks (optional)
    if (finalSortedItems.length !== items.length) {
      logger.error(
        `Sorting resulted in item count mismatch! Original: ${items.length}, Sorted: ${finalSortedItems.length}.`
      );
      // Log details about missing/extra items
      const originalPaths = new Set(items.map((i) => i.doc.filePath));
      const finalPaths = new Set(finalSortedItems.map((i) => i.doc.filePath));
      items.forEach((item) => {
        if (!finalPaths.has(item.doc.filePath))
          logger.error(`Missing item: ${item.doc.filePath} (type: ${item.type})`);
      });
      finalSortedItems.forEach((item) => {
        if (!originalPaths.has(item.doc.filePath))
          logger.error(`Extra item: ${item.doc.filePath} (type: ${item.type})`);
      });
    }
    const allFoundRelatedCount = placedRelatedPaths.size;
    if (relatedItems.length !== allFoundRelatedCount) {
      logger.warn(
        `Mismatch in related item count. Expected ${relatedItems.length}, placed ${allFoundRelatedCount}. Some related items might be unlinked, orphaned, or linked incorrectly.`
      );
      const missedRelated = relatedItems.filter(
        (item) => !placedRelatedPaths.has(item.doc.filePath)
      );
      missedRelated.forEach((item) =>
        logger.warn(`-> Unplaced related item: ${item.doc.filePath}`)
      );
    }

    return finalSortedItems;
  }
}
