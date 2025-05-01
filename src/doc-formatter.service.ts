import { logger } from "./logger.js";
import {
  AttachedItemFileType,
  ContextItem,
  DocLinkRange,
  IDocFormatterService,
  IDocIndexService,
  IFileSystemService,
} from "./types.js";
import { getErrorMsg } from "./util.js";

export class DocFormatterService implements IDocFormatterService {
  constructor(
    private docIndexService: IDocIndexService,
    private fileSystem: IFileSystemService
  ) {}

  async formatDoc(item: ContextItem): Promise<string> {
    const { doc, type, linkedViaAnchor } = item;
    const fileType: AttachedItemFileType = doc.isMarkdown ? "doc" : "file";

    const inlineDocMap = new Map<string, string>();
    if (doc.isMarkdown && !doc.isError) {
      const inlineLinks = doc.linksTo.filter((link) => link.isInline);
      await Promise.all(
        inlineLinks.map(async (link) => {
          try {
            const inlineDoc = await this.docIndexService.getDoc(link.filePath);
            if (inlineDoc.isError) {
              logger.warn(
                `Skipping inline expansion for error doc: ${link.filePath} in ${doc.filePath}`
              );
              return;
            }
            let inlineContent = inlineDoc.content ?? "";
            inlineContent = this.extractRangeContent(inlineContent, link.inlineLinesRange);
            const rangeAttr = link.inlineLinesRange
              ? ` lines="${this.formatRange(link.inlineLinesRange)}"`
              : "";
            const escapedDescription = link.anchorText?.replace(/"/g, "&quot;") ?? "";
            const inlineTag = `<inline_doc description="${escapedDescription}" file="${this.fileSystem.getRelativePath(link.filePath)}"${rangeAttr}>\n${inlineContent}\n</inline_doc>`;

            const key = link.filePath + "||" + link.rawLinkTarget;
            inlineDocMap.set(key, inlineTag);
          } catch (error) {
            logger.error(
              `Failed to fetch or format inline doc ${link.filePath} referenced in ${doc.filePath}: ${getErrorMsg(error)}`
            );
          }
        })
      );
    }

    let processedContent = "";
    let lastIndex = 0;
    const linkRegex = /\[([^\]]+?)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    const sourceDir = this.fileSystem.getDirname(doc.filePath);
    const contentToProcess = doc.content ?? "";

    while ((match = linkRegex.exec(contentToProcess)) !== null) {
      processedContent += contentToProcess.substring(lastIndex, match.index);
      processedContent += match[0];
      lastIndex = linkRegex.lastIndex;

      const linkTarget = match[2];
      const [relativePath] = linkTarget.split("?");
      const cleanedRelativePath = relativePath.replace(/&amp;/g, "&");

      try {
        const absolutePath = this.fileSystem.resolvePath(sourceDir, cleanedRelativePath);
        const lookupKey = absolutePath + "||" + linkTarget;

        if (inlineDocMap.has(lookupKey)) {
          processedContent += "\n" + inlineDocMap.get(lookupKey);
        }
      } catch (error) {
        logger.warn(
          `Could not process link target "${linkTarget}" in ${doc.filePath}: ${getErrorMsg(error)}`
        );
      }
    }
    processedContent += contentToProcess.substring(lastIndex);

    const trimmedProcessedContent = processedContent.replace(/^\s*\n+|\n+\s*$/g, "");

    const descriptionSource =
      type === "related" ? (linkedViaAnchor ?? doc.meta.description) : doc.meta.description;

    const escapedDescription = descriptionSource?.replace(/"/g, "&quot;");
    const descAttr = escapedDescription ? ` description="${escapedDescription}"` : "";

    if (fileType === "doc") {
      return `<doc${descAttr} type="${type}" file="${this.fileSystem.getRelativePath(doc.filePath)}">\n${trimmedProcessedContent}\n</doc>`;
    } else {
      return `<file${descAttr} type="${type}" file="${this.fileSystem.getRelativePath(doc.filePath)}">\n${trimmedProcessedContent}\n</file>`;
    }
  }

  async formatContextOutput(items: ContextItem[]): Promise<string> {
    const formattedDocs = await Promise.all(items.map((item) => this.formatDoc(item)));
    return formattedDocs.join("\n\n");
  }

  private extractRangeContent(content: string, range?: DocLinkRange): string {
    if (!range) {
      return content;
    }
    const lines = content.split("\n");
    const startLine = Math.max(0, range.from);
    const endLine =
      range.to === "end"
        ? lines.length
        : typeof range.to === "number"
          ? Math.min(lines.length, range.to + 1)
          : lines.length;

    if (startLine >= endLine) {
      logger.warn(`Invalid range ${this.formatRange(range)}: start >= end. Returning empty.`);
      return "";
    }

    return lines.slice(startLine, endLine).join("\n");
  }

  private formatRange(range: DocLinkRange): string {
    // Convert 0-based indices back to 1-based for display
    const displayFrom = range.from + 1;
    const displayTo = range.to === "end" ? "end" : range.to + 1;
    return `${displayFrom}-${displayTo}`;
  }
}
