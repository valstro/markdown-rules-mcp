import { logger } from "./logger.js";
import { z } from "zod";
import matter from "gray-matter";
import { getErrorMsg } from "./util.js";
import { Doc, DocOverride, IDocParserService } from "./types.js";

const docMetaSchema = z.object({
  description: z.string().optional().nullable(),
  globs: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .nullable(),
  alwaysApply: z.boolean().optional().nullable(),
});

/**
 * Parses a markdown file and returns a Doc object.
 *
 * @remarks
 * This service is responsible for parsing a markdown file and returning a Doc object.
 * It uses the gray-matter library to parse the markdown file.
 *
 * @example
 * ```typescript
 * const docParser = new DocParserService();
 * const doc = docParser.parse(fileName, fileContent);
 * ```
 */
export class DocParserService implements IDocParserService {
  parse(fileName: string, fileContent: string): Doc {
    const doc: Doc = this.getBlankDoc(fileName, { content: fileContent });

    try {
      const matterResult = matter(fileContent);
      const meta = docMetaSchema.parse(matterResult.data);
      doc.meta = {
        description: this.parseDescription(meta.description),
        globs: this.parseGlobs(meta.globs),
        alwaysApply: this.parseAlwaysApply(meta.alwaysApply),
      };
      doc.content = this.trimContent(matterResult.content);
      return doc;
    } catch (error) {
      logger.error(`Error parsing doc: ${fileName} ${getErrorMsg(error)}`);
      doc.isError = true;
      doc.errorReason = `Failed to parse doc meta YAML: ${getErrorMsg(error)}`;
      return doc;
    }
  }

  getBlankDoc(fileName: string, docOverride?: DocOverride): Doc {
    return {
      contentLinesBeforeParsed: this.countLines(docOverride?.content ?? ""),
      content: this.trimContent(docOverride?.content ?? ""),
      meta: {
        description: undefined,
        globs: [],
        alwaysApply: false,
      },
      filePath: fileName,
      linksTo: [],
      isMarkdown: this.isMarkdown(fileName),
      isError: docOverride?.isError ?? false,
      errorReason: docOverride?.errorReason,
    };
  }

  countLines(content: string): number {
    return content.split("\n").length;
  }

  parseGlobs(globs: string | string[] | null | undefined): string[] {
    if (Array.isArray(globs)) {
      return globs;
    }

    if (typeof globs === "string") {
      const globsArray = globs.replace(/\s+/g, "").split(",");
      return globsArray.map((glob) => glob.trim());
    }

    return [];
  }

  parseAlwaysApply(alwaysApply: string | boolean | null | undefined): boolean {
    if (typeof alwaysApply === "boolean") {
      return alwaysApply;
    }

    if (typeof alwaysApply === "string") {
      return alwaysApply.toLowerCase() === "true";
    }

    return false;
  }

  parseDescription(description: string | null | undefined): string | undefined {
    return typeof description === "string" ? description.trim() : undefined;
  }

  isMarkdown(fileName: string): boolean {
    return fileName.toLowerCase().endsWith(".md");
  }

  trimContent(content: string): string {
    // Trim leading/trailing whitespace characters
    let result = content.trim();
    // Replace multiple consecutive newlines with a single newline
    result = result.replace(/\n{2,}/g, "\n");
    return result;
  }
}
