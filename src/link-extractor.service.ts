import { logger } from "./logger.js";
import { getErrorMsg } from "./util.js";
import { DocLink, DocLinkRange, ILinkExtractorService } from "./types.js";
import { FileSystemService } from "./file-system.service.js";

/**
 * Extracts links from a markdown document.
 *
 * @remarks
 * This service is responsible for extracting links from a markdown document.
 * It uses a regular expression to find markdown links like [text](path).
 * It then converts the relative path to an absolute path using the file system service.
 * It also handles potential HTML entities like &amp; before parsing.
 * It supports query parameters `include`, `inline`, and `lines` for specific link behaviors.
 *
 * @example
 * ```typescript
 * const linkExtractor = new LinkExtractorService(fileSystem);
 * const links = linkExtractor.extractLinks(docFilePath, docContent);
 * // Example link: [Include this](./some/doc.md?include=true&inline=true&lines=10-20)
 * ```
 */
export class LinkExtractorService implements ILinkExtractorService {
  static readonly INCLUDE_PARAM = "include";
  static readonly INLINE_PARAM = "inline";
  static readonly LINES_PARAM = "lines";

  constructor(private fileSystem: FileSystemService) {}

  extractLinks(docFilePath: string, docContent: string): DocLink[] {
    const linkedDocs: DocLink[] = [];
    const linkRegex = /\[([^\]]+?)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    const sourceDir = this.fileSystem.getDirname(docFilePath);

    while ((match = linkRegex.exec(docContent)) !== null) {
      const anchorText = match[1];
      const linkTarget = match[2];
      const [relativePath] = linkTarget.split("?");
      const cleanedLinkTarget = linkTarget.replace(/&amp;/g, "&");
      const cleanedRelativePath = relativePath.replace(/&amp;/g, "&");

      try {
        const url = new URL(cleanedLinkTarget, "file:///"); // Dummy base

        if (this.isParamTruthy(url, LinkExtractorService.INCLUDE_PARAM)) {
          const { isInline, inlineLinesRange } = this.parseInlineAndRange(url, docFilePath);

          const absolutePath = this.fileSystem.resolvePath(sourceDir, cleanedRelativePath);

          logger.debug(
            `Found link: Anchor='${anchorText}', Target='${linkTarget}', RelativePath='${cleanedRelativePath}', AbsolutePath='${absolutePath}', SourceDir='${sourceDir}', Inline=${isInline}, Range=${
              inlineLinesRange ? `${inlineLinesRange.from}-${inlineLinesRange.to}` : "N/A"
            }`
          );

          linkedDocs.push({
            filePath: absolutePath,
            isInline,
            inlineLinesRange,
            anchorText,
          });
        }
      } catch (error: unknown) {
        if (error instanceof TypeError && error.message.includes("Invalid URL")) {
          logger.warn(`Skipping invalid URL format: ${cleanedLinkTarget} in ${docFilePath}`);
        } else {
          logger.error(
            `Error processing link: ${cleanedLinkTarget} in ${docFilePath}: ${getErrorMsg(error)}`
          );
        }
      }
    }

    return linkedDocs;
  }

  /**
   * Parses the 'inline' and 'lines' query parameters from a URL.
   *
   * @param url - The URL object containing the query parameters.
   * @param docFilePath - The path of the document containing the link (for logging).
   * @returns An object with `isInline` (boolean) and `inlineLinesRange` (DocLinkRange | undefined).
   */
  private parseInlineAndRange(
    url: URL,
    docFilePath: string
  ): { isInline: boolean; inlineLinesRange: DocLinkRange | undefined } {
    const isInline = this.isParamTruthy(url, LinkExtractorService.INLINE_PARAM);
    const linesParam = url.searchParams.get(LinkExtractorService.LINES_PARAM);
    let inlineLinesRange: DocLinkRange | undefined;

    if (isInline && linesParam) {
      const parts = linesParam.split("-");
      if (parts.length === 2) {
        const fromStr = parts[0];
        const toStr = parts[1];
        const fromNum = fromStr === "" ? 0 : Number(fromStr);
        const toNumOrEnd = toStr === "" || toStr.toLowerCase() === "end" ? "end" : Number(toStr);

        if (!isNaN(fromNum) && (toNumOrEnd === "end" || !isNaN(toNumOrEnd))) {
          if (toNumOrEnd !== "end" && fromNum > toNumOrEnd) {
            logger.warn(
              `Invalid lines range "${linesParam}" in ${docFilePath}: start line (${fromNum}) is greater than end line (${toNumOrEnd}). Ignoring range.`
            );
          } else {
            inlineLinesRange = {
              from: fromNum,
              to: toNumOrEnd as number | "end",
            };
          }
        } else {
          logger.warn(
            `Invalid lines format "${linesParam}" in ${docFilePath}. Expected N-M, -M, N-, or N-end. Ignoring range.`
          );
        }
      } else {
        logger.warn(
          `Invalid lines format "${linesParam}" in ${docFilePath}. Expected format with one hyphen '-'. Ignoring range.`
        );
      }
    }

    return { isInline, inlineLinesRange };
  }

  /**
   * Checks if a URL query parameter has a truthy value ('true' or '1').
   *
   * @param url - The URL object.
   * @param param - The name of the query parameter.
   * @returns True if the parameter exists and is 'true' or '1', false otherwise.
   */
  isParamTruthy(url: URL, param: string): boolean {
    const paramValue = url.searchParams.get(param);
    return paramValue !== null && (paramValue === "true" || paramValue === "1");
  }
}
