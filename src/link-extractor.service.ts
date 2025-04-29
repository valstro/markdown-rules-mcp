import { logger } from "./logger.js";
import { getErrorMsg } from "./util.js";
import { DocLink, DocLinkRange, IFileSystemService, ILinkExtractorService } from "./types.js";

/**
 * Extracts links from a markdown document.
 *
 * @remarks
 * This service is responsible for extracting links from a markdown document.
 * It uses a regular expression to find markdown links like [text](path).
 * It then converts the relative path to an absolute path using the file system service.
 * It also handles potential HTML entities like &amp; before parsing.
 * It supports query parameters `mdr-include`, `mdr-inline`, and `mdr-lines` for specific link behaviors.
 * It captures the start and end character indices of the markdown link in the source content.
 *
 * @example
 * ```typescript
 * const linkExtractor = new LinkExtractorService(fileSystem);
 * const links = linkExtractor.extractLinks(docFilePath, docContent);
 * // Example link: [Include this](./some/doc.md?mdr-include=true&mdr-inline=true&mdr-lines=10-20)
 * ```
 */
export class LinkExtractorService implements ILinkExtractorService {
  static readonly INCLUDE_PARAM = "mdr-include";
  static readonly INLINE_PARAM = "mdr-inline";
  static readonly LINES_PARAM = "mdr-lines";

  constructor(private fileSystem: IFileSystemService) {}

  extractLinks(docFilePath: string, docContent: string): DocLink[] {
    const linkedDocs: DocLink[] = [];
    const linkRegex = /\[([^\]]+?)]\(([^)<>]+?)\)/g;
    let match: RegExpExecArray | null;
    const sourceDir = this.fileSystem.getDirname(docFilePath);

    while ((match = linkRegex.exec(docContent)) !== null) {
      const fullMatchText = match[0];
      const anchorText = match[1];
      const linkTarget = match[2];
      const startIndex = match.index;
      const endIndex = startIndex + fullMatchText.length;

      const [relativePath] = linkTarget.split("?");
      const cleanedLinkTarget = linkTarget.replace(/&amp;/g, "&");
      const cleanedRelativePath = relativePath.replace(/&amp;/g, "&");

      try {
        const url = new URL(cleanedLinkTarget, `file://${sourceDir}/`);

        if (this.isParamTruthy(url, LinkExtractorService.INCLUDE_PARAM)) {
          const { isInline, inlineLinesRange } = this.parseInlineAndRange(url, docFilePath);

          const absolutePath = cleanedRelativePath.startsWith("/")
            ? this.fileSystem.resolvePath(
                this.fileSystem.getProjectRoot(),
                cleanedRelativePath.substring(1)
              )
            : this.fileSystem.resolvePath(sourceDir, cleanedRelativePath);

          logger.debug(
            `Found link: Anchor='${anchorText}', Target='${linkTarget}', RelativePath='${cleanedRelativePath}', AbsolutePath='${absolutePath}', SourceDir='${sourceDir}', Inline=${isInline}, Range=${
              inlineLinesRange ? `${inlineLinesRange.from}-${inlineLinesRange.to}` : "N/A"
            }, Indices=${startIndex}-${endIndex}`
          );

          linkedDocs.push({
            filePath: absolutePath,
            isInline,
            inlineLinesRange,
            anchorText,
            startIndex,
            endIndex,
          });
        }
      } catch (error: unknown) {
        if (error instanceof TypeError && error.message.includes("Invalid URL")) {
          logger.warn(`Skipping link due to invalid URL format: ${linkTarget} in ${docFilePath}`);
        } else {
          logger.error(
            `Error processing link target "${linkTarget}" in ${docFilePath}: ${getErrorMsg(error)}`
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
        const fromStr = parts[0].trim();
        const toStr = parts[1].trim();
        const fromNum = fromStr === "" ? 0 : Number(fromStr);
        const toNumOrEnd = toStr === "" || toStr.toLowerCase() === "end" ? "end" : Number(toStr);

        if (!isNaN(fromNum) && (toNumOrEnd === "end" || (!isNaN(toNumOrEnd) && toNumOrEnd >= 0))) {
          if (toNumOrEnd !== "end" && fromNum >= 0 && fromNum > toNumOrEnd) {
            logger.warn(
              `Invalid lines range "${linesParam}" in ${docFilePath}: start line (${fromNum}) is greater than end line (${toNumOrEnd}). Ignoring range.`
            );
          } else if (fromNum < 0) {
            logger.warn(
              `Invalid lines range "${linesParam}" in ${docFilePath}: start line (${fromNum}) cannot be negative. Ignoring range.`
            );
          } else {
            inlineLinesRange = {
              from: fromNum,
              to: toNumOrEnd as number | "end",
            };
          }
        } else {
          logger.warn(
            `Invalid numeric value in lines format "${linesParam}" in ${docFilePath}. Expected N-M, -M, N-, or N-end. Ignoring range.`
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
    return paramValue !== null && (paramValue.toLowerCase() === "true" || paramValue === "1");
  }
}
