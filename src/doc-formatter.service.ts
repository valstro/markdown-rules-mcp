import micromatch from "micromatch";
import { logger } from "./logger.js";
import {
  AttachedItem,
  AttachedItemFileType,
  ContextItem,
  Doc,
  DocLinkRange,
  IDocFormatterService,
  IDocIndexService,
} from "./types.js";
import { getErrorMsg } from "./util.js";

export class DocFormatterService implements IDocFormatterService {
  constructor(private docIndexService: IDocIndexService) {}

  async formatDoc(item: ContextItem): Promise<string> {
    const { doc, type, linkedViaAnchor } = item;
    const fileType: AttachedItemFileType = doc.isMarkdown ? "doc" : "file";

    const trimmedContent = doc.content?.replace(/^\s*\n+|\n+\s*$/g, "") ?? "";

    const inlineFormattedDocs: string[] = [];
    if (doc.isMarkdown && !doc.isError) {
      for (const link of doc.linksTo) {
        if (link.isInline) {
          try {
            const inlineDoc = await this.docIndexService.getDoc(link.filePath);
            if (inlineDoc.isError) {
              logger.warn(
                `Skipping inline expansion for error doc: ${link.filePath} in ${doc.filePath}`
              );
              continue;
            }
            let inlineContent = inlineDoc.content ?? "";
            inlineContent = this.extractRangeContent(inlineContent, link.inlineLinesRange);
            const rangeAttr = link.inlineLinesRange
              ? ` lines="${this.formatRange(link.inlineLinesRange)}"`
              : "";
            const escapedDescription = link.anchorText?.replace(/"/g, "&quot;") ?? "";
            const inlineTag = `<inline_doc description="${escapedDescription}" file="${link.filePath}"${rangeAttr}>\n${inlineContent}\n</inline_doc>`;
            inlineFormattedDocs.push(inlineTag);
          } catch (error) {
            logger.error(
              `Failed to fetch or format inline doc ${link.filePath} referenced in ${doc.filePath}: ${getErrorMsg(error)}`
            );
          }
        }
      }
    }

    const inlineContentBlock =
      inlineFormattedDocs.length > 0 ? "\n\n" + inlineFormattedDocs.join("\n\n") : "";

    const descriptionSource =
      type === "related" ? (linkedViaAnchor ?? doc.meta.description) : doc.meta.description;

    const escapedDescription = descriptionSource?.replace(/"/g, "&quot;");
    const descAttr = escapedDescription ? ` description="${escapedDescription}"` : "";

    if (fileType === "doc") {
      return `<doc${descAttr} type="${type}" file="${doc.filePath}">\n${trimmedContent}${inlineContentBlock}\n</doc>`;
    } else {
      return `<file${descAttr} type="${type}" file="${doc.filePath}">\n${trimmedContent}${inlineContentBlock}\n</file>`;
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
    return `${range.from}-${range.to}`;
  }
}
