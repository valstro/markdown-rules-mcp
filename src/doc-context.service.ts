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
        if (relevantDocsByDescription.includes(doc.filePath)) {
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

  private sortItems(items: ContextItem[]): ContextItem[] {
    // TODO: Get HOIST_CONTEXT from config. Assuming false for now.
    // Replace with: const hoistContext = this.config.HOIST_CONTEXT;
    const hoistContext = this.config.HOIST_CONTEXT ?? false; // Default to false if undefined

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

    // 2. Group related items by the path of the item that linked to them
    const relatedByLinker = new Map<string, ContextItem[]>();
    const orphanRelatedItems: ContextItem[] = []; // Items whose linker isn't in nonRelatedItems

    for (const item of relatedItems) {
      const linkerPath = item.linkedFromPath;
      if (linkerPath && items.some((i) => i.doc.filePath === linkerPath && i.type !== "related")) {
        // Check if linker exists and is non-related
        if (!relatedByLinker.has(linkerPath)) {
          relatedByLinker.set(linkerPath, []);
        }
        relatedByLinker.get(linkerPath)!.push(item);
      } else {
        // This might happen if a related item was linked from another related item,
        // or if the linking item itself wasn't included for some reason.
        logger.warn(
          `Related item ${item.doc.filePath} has missing or non-primary linker path: ${linkerPath}. Treating as orphan.`
        );
        orphanRelatedItems.push(item);
      }
    }

    // 3. Sort related items within each group alphabetically by path
    for (const relatedGroup of relatedByLinker.values()) {
      relatedGroup.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));
    }
    // Sort orphan items as well
    orphanRelatedItems.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));

    // 4. Construct the final list, placing related items relative to their linker
    const finalSortedItems: ContextItem[] = [];
    const addedRelated = new Set<string>(); // Keep track of related items already added

    for (const nonRelatedItem of nonRelatedItems) {
      const linkerPath = nonRelatedItem.doc.filePath;
      const relatedGroup = relatedByLinker.get(linkerPath) ?? [];
      const itemsToPlace = relatedGroup.filter((item) => !addedRelated.has(item.doc.filePath));

      if (itemsToPlace.length > 0) {
        if (hoistContext) {
          finalSortedItems.push(...itemsToPlace);
          itemsToPlace.forEach((item) => addedRelated.add(item.doc.filePath));
        }
      }

      finalSortedItems.push(nonRelatedItem); // Add the non-related item

      if (itemsToPlace.length > 0) {
        if (!hoistContext) {
          finalSortedItems.push(...itemsToPlace);
          itemsToPlace.forEach((item) => addedRelated.add(item.doc.filePath));
        }
      }
    }

    // 5. Append any orphan related items at the end
    if (orphanRelatedItems.length > 0) {
      logger.warn(`Appending ${orphanRelatedItems.length} orphan related items to the end.`);
      finalSortedItems.push(...orphanRelatedItems);
      orphanRelatedItems.forEach((item) => addedRelated.add(item.doc.filePath)); // Mark as added
    }

    // 6. Sanity check: Ensure all original items are present
    if (finalSortedItems.length !== items.length) {
      logger.error(
        `Sorting resulted in item count mismatch! Original: ${items.length}, Sorted: ${finalSortedItems.length}. Dumping details.`
      );
      // Add more detailed logging if necessary
      const originalPaths = new Set(items.map((i) => i.doc.filePath));
      const finalPaths = new Set(finalSortedItems.map((i) => i.doc.filePath));
      items.forEach((item) => {
        if (!finalPaths.has(item.doc.filePath)) {
          logger.error(
            `Missing item after sort: ${item.doc.filePath} (type: ${item.type}, linkedFrom: ${item.linkedFromPath})`
          );
        }
      });
      finalSortedItems.forEach((item) => {
        if (!originalPaths.has(item.doc.filePath)) {
          logger.error(
            `Extra item after sort: ${item.doc.filePath} (type: ${item.type}, linkedFrom: ${item.linkedFromPath})`
          );
        }
      });
      // As a fallback, return the original unsorted list if counts don't match
      // return items; // Or throw an error
    }

    // Check if any related items were somehow missed (e.g., linked from a related item not handled as orphan)
    const allAddedRelatedCount =
      Array.from(relatedByLinker.values()).flat().length + orphanRelatedItems.length;
    if (relatedItems.length !== allAddedRelatedCount) {
      const missedRelated = relatedItems.filter((item) => !addedRelated.has(item.doc.filePath));
      if (missedRelated.length > 0) {
        logger.warn(
          `Found ${missedRelated.length} related items that were not placed. Appending them now.`
        );
        missedRelated.sort((a, b) => a.doc.filePath.localeCompare(b.doc.filePath));
        finalSortedItems.push(...missedRelated);
      }
    }

    return finalSortedItems;
  }
}
