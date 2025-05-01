import { logger } from "./logger.js";
import { getErrorMsg } from "./util.js";
import { DocLink, DocLinkRange, IFileSystemService, ILinkExtractorService } from "./types.js";
import { FileSystemService } from "./file-system.service.js";

/**
 * Extracts links from a markdown document.
 *
 * @remarks
 * This service is responsible for extracting links from a markdown document.
 * It uses a regular expression to find markdown links like [text](path).
 * Links intended for processing by this tool must either include the `md-link=true` (or `md-link=1`)
 * query parameter or the `md-embed` query parameter (unless `md-embed` is explicitly 'false').
 * A link with `md-embed` is implicitly considered a link to be processed.
 *
 * Embedding behavior is controlled by the `md-embed` query parameter:
 * - If `md-embed` is absent or set to `false`, the link is processed (only if `md-link=true` is present) but *not* marked for embedding (`isInline: false`), and no range is parsed.
 * - If `md-embed` is present and not `false` (e.g., `md-embed=true`), the link is processed and embedded (`isInline: true`) without a specific line range (`inlineLinesRange: undefined`).
 * - If the value of `md-embed` is a range (e.g., `10-20`, `10-`, `-20`, `10-end`),
 *   the link is processed and only that specific line range of the target document is embedded.
 *
 * It converts the relative path to an absolute path using the file system service
 * and handles potential HTML entities like &amp; before parsing.
 *
 * @example
 * ```typescript
 * const linkExtractor = new LinkExtractorService(fileSystem);
 * const links = linkExtractor.extractLinks(docFilePath, docContent);
 * // Example link: [Include this](./some/doc.md?md-link=true&md-embed=10-20) // Linked & Embedded (range)
 * // Example link: [Include this too](./some/doc.md?md-embed=10-20) // Linked & Embedded (range)
 * // Example link: [Include all](./another/doc.md?md-link=true&md-embed=true) // Linked & Embedded (all)
 * // Example link: [Include all too](./another/doc.md?md-embed=true) // Linked & Embedded (all)
 * // Example link: [Reference only](./ref.md?md-link=true) // Linked, Not Embedded
 * // Example link: [Reference only, explicit](./ref.md?md-link=true&md-embed=false) // Linked, Not Embedded
 * // Example link: [Ignored](./ref.md?md-embed=false) // Not Linked, Not Embedded
 * ```
 */
export class LinkExtractorService implements ILinkExtractorService {
  static readonly LINK_PARAM = "md-link";
  static readonly EMBED_PARAM = "md-embed";
  constructor(private fileSystem: IFileSystemService) {}

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
        const url = new URL(cleanedLinkTarget, "file:///");

        const shouldProcessLink =
          this.isParamTruthy(url, LinkExtractorService.LINK_PARAM) ||
          this.isEmbedParamPresentAndNotFalse(url);

        if (shouldProcessLink) {
          const { isInline, inlineLinesRange } = this.parseEmbedParameter(url, docFilePath);

          const absolutePath = this.fileSystem.resolvePath(sourceDir, cleanedRelativePath);

          logger.debug(
            `Found link: Anchor='${anchorText}', Target='${linkTarget}', RelativePath='${cleanedRelativePath}', AbsolutePath='${absolutePath}', SourceDir='${sourceDir}', Embed=${isInline}, Range=${
              inlineLinesRange ? `${inlineLinesRange.from}-${inlineLinesRange.to}` : "N/A"
            }`
          );

          linkedDocs.push({
            filePath: absolutePath,
            rawLinkTarget: linkTarget,
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
   * Parses the 'md-embed' query parameter to determine embedding status and line range.
   *
   * @param url - The URL object containing the query parameters.
   * @param docFilePath - The path of the document containing the link (for logging).
   * @returns An object with `isInline` (boolean) and `inlineLinesRange` (DocLinkRange | undefined).
   *          `isInline` is true if `md-embed` is present and not 'false'.
   *          `inlineLinesRange` is populated if `md-embed`'s value is a valid range format.
   */
  private parseEmbedParameter(
    url: URL,
    docFilePath: string
  ): { isInline: boolean; inlineLinesRange: DocLinkRange | undefined } {
    const embedParamValue = url.searchParams.get(LinkExtractorService.EMBED_PARAM);
    const isInline = this.isEmbedParamPresentAndNotFalse(url);

    if (!isInline || embedParamValue === null) {
      return { isInline: false, inlineLinesRange: undefined };
    }

    let inlineLinesRange: DocLinkRange | undefined;
    const rangeString = embedParamValue;

    const parts = rangeString.split("-");
    if (parts.length === 2) {
      const fromStr = parts[0];
      const toStr = parts[1];
      const fromNum = fromStr === "" ? 0 : Number(fromStr);
      const toNumOrEnd = toStr === "" || toStr.toLowerCase() === "end" ? "end" : Number(toStr);

      if (!isNaN(fromNum) && (toNumOrEnd === "end" || !isNaN(toNumOrEnd))) {
        if (toNumOrEnd !== "end" && fromNum > toNumOrEnd) {
          logger.warn(
            `Invalid lines range "${rangeString}" in 'md-embed' parameter in ${docFilePath}: start line (${fromNum}) is greater than end line (${toNumOrEnd}). Embedding whole file.`
          );
        } else {
          inlineLinesRange = {
            from: fromNum,
            to: toNumOrEnd as number | "end",
          };
          logger.debug(
            `Parsed range from 'md-embed="${rangeString}"' in ${docFilePath}: ${inlineLinesRange.from}-${inlineLinesRange.to}`
          );
        }
      } else {
        logger.debug(
          `Value "${rangeString}" for 'md-embed' in ${docFilePath} looks like a range but has invalid format (Expected N-M, -M, N-, N-end). Embedding whole file.`
        );
      }
    } else {
      logger.debug(
        `Value "${rangeString}" for 'md-embed' in ${docFilePath} is not a range format. Embedding whole file.`
      );
    }

    return { isInline, inlineLinesRange };
  }

  /**
   * Checks if a URL query parameter has a truthy value ('true' or '1').
   * Used specifically for the `md-link` parameter.
   *
   * @param url - The URL object.
   * @param param - The name of the query parameter.
   * @returns True if the parameter exists and is 'true' or '1', false otherwise.
   */
  private isParamTruthy(url: URL, param: string): boolean {
    const paramValue = url.searchParams.get(param);
    return paramValue !== null && (paramValue === "true" || paramValue === "1");
  }

  /**
   * Checks if the 'md-embed' parameter is present and its value is not 'false'.
   *
   * @param url - The URL object.
   * @returns True if 'md-embed' exists and is not 'false' (case-insensitive), false otherwise.
   */
  private isEmbedParamPresentAndNotFalse(url: URL): boolean {
    const embedParamValue = url.searchParams.get(LinkExtractorService.EMBED_PARAM);
    return embedParamValue !== null && embedParamValue.toLowerCase() !== "false";
  }
}
