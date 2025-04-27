import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { DocParserService } from "./doc-parser.service";

describe("DocParserService", () => {
  let docParserService: DocParserService;

  beforeEach(() => {
    vi.resetAllMocks();
    docParserService = new DocParserService();
  });
  describe("isMarkdown", () => {
    it('should return true for filenames ending with ".md"', () => {
      expect(docParserService.isMarkdown("test.md")).toBe(true);
    });

    it('should return true for filenames ending with ".MD" (case-insensitive)', () => {
      expect(docParserService.isMarkdown("TEST.MD")).toBe(true);
    });

    it('should return false for filenames not ending with ".md"', () => {
      expect(docParserService.isMarkdown("test.txt")).toBe(false);
    });

    it('should return false for filenames containing ".md" but not at the end', () => {
      expect(docParserService.isMarkdown("test.md.backup")).toBe(false);
    });

    it("should return false for filenames without an extension", () => {
      expect(docParserService.isMarkdown("test")).toBe(false);
    });
  });
  describe("getBlankDoc", () => {
    const fileName = "test.md";
    const content = "Some content";

    it("should return a Doc object with default values", () => {
      const doc = docParserService.getBlankDoc(fileName);
      expect(doc).toEqual({
        contentLinesBeforeParsed: 1,
        content: "",
        meta: {
          description: undefined,
          globs: [],
          alwaysApply: false,
        },
        filePath: fileName,
        linksTo: [],
        isMarkdown: true,
        isError: false,
      });
    });

    it("should set content if provided", () => {
      const doc = docParserService.getBlankDoc(fileName, content);
      expect(doc.content).toBe(content);
    });

    it("should set isError flag if provided", () => {
      const doc = docParserService.getBlankDoc(fileName, content, true);
      expect(doc.isError).toBe(true);
    });

    it("should correctly determine isMarkdown based on filename", () => {
      const mdDoc = docParserService.getBlankDoc("is.md");
      const txtDoc = docParserService.getBlankDoc("is.txt");
      expect(mdDoc.isMarkdown).toBe(true);
      expect(txtDoc.isMarkdown).toBe(false);
    });
  });

  describe("parse", () => {
    const fileName = "document.md";

    it("should parse content and valid full front matter correctly", () => {
      const fileContent = `---
description: A test document
globs: ["*.ts", "*.js"]
alwaysApply: true
---
# Document Title
Content goes here.`;
      const doc = docParserService.parse(fileName, fileContent);
      expect(doc.contentLinesBeforeParsed).toBe(7);
      expect(doc.content.trim()).toBe("# Document Title\nContent goes here.");
      expect(doc.meta).toEqual({
        description: "A test document",
        globs: ["*.ts", "*.js"],
        alwaysApply: true,
      });
      expect(doc.filePath).toBe(fileName);
      expect(doc.isMarkdown).toBe(true);
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should remove empty newlines from content", () => {
      const fileContent = `---
description: A test document
globs: ["*.ts", "*.js"]
alwaysApply: true
---


# Document Title

Content goes here.

`;
      const doc = docParserService.parse(fileName, fileContent);
      expect(doc.contentLinesBeforeParsed).toBe(12);
      expect(doc.content.trim()).toBe("# Document Title\nContent goes here.");
      expect(doc.meta).toEqual({
        description: "A test document",
        globs: ["*.ts", "*.js"],
        alwaysApply: true,
      });
      expect(doc.filePath).toBe(fileName);
      expect(doc.isMarkdown).toBe(true);
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should parse content and valid minimal front matter (using defaults)", () => {
      const fileContent = `---
description: " Minimal description "
---
Minimal content.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe("Minimal content.");
      expect(doc.contentLinesBeforeParsed).toBe(4);
      expect(doc.meta).toEqual({
        description: "Minimal description",
        globs: [], // Default behavior when missing
        alwaysApply: false, // Default behavior when missing
      });
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should NOT parse content and description with colon without quotes", () => {
      const fileContent = `---
description: Minimal description: with colon
---
Minimal content.`;
      const doc = docParserService.parse(fileName, fileContent);
      expect(doc.contentLinesBeforeParsed).toBe(4);
      expect(doc.content).toBe(`---
description: Minimal description: with colon
---
Minimal content.`);
      expect(doc.meta).toEqual({
        description: undefined,
        globs: [],
        alwaysApply: false,
      });
      expect(doc.isError).toBe(true);
      expect(doc.errorReason).toBeDefined();
    });

    it("should handle null values in front matter (using defaults)", () => {
      const fileContent = `---
description: null
globs: null
alwaysApply: null
---
Content with nulls.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe("Content with nulls.");
      expect(doc.meta).toEqual({
        description: undefined, // null becomes undefined
        globs: [], // null becomes []
        alwaysApply: false, // null becomes false
      });
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should parse content correctly when no front matter is present", () => {
      const fileContent = `# Just Content
No front matter here.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe("# Just Content\nNo front matter here.");
      expect(doc.meta).toEqual({
        description: undefined,
        globs: [],
        alwaysApply: false,
      }); // Defaults apply
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should handle single string glob in front matter", () => {
      const fileContent = `---
globs: "*.ts"
---
Single glob content.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe("Single glob content.");
      expect(doc.meta.globs).toEqual(["*.ts"]);
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should handle multiple string globs in front matter", () => {
      const fileContent = `---
globs: "*.ts, *.js"
---
String content.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe("String content.");
      expect(doc.meta.globs).toEqual(["*.ts", "*.js"]);
      expect(doc.isError).toBe(false);
      expect(doc.errorReason).toBeUndefined();
    });

    it("should NOT handle glob outside of quotes", () => {
      const fileContent = `---
globs: *.ts
---
String content.`;
      const doc = docParserService.parse(fileName, fileContent);

      expect(doc.content.trim()).toBe(`---
globs: *.ts
---
String content.`);
      expect(doc.meta.globs).toEqual([]);
      expect(doc.isError).toBe(true);
      expect(doc.errorReason).toBeDefined();
    });

    it("should log error and return default doc structure on invalid front matter schema", () => {
      // 'alwaysApply' is a number, which is invalid according to the schema
      const fileContent = `---
description: Invalid type test
alwaysApply: 123
---
Content after invalid FM.`;
      const doc = docParserService.parse(fileName, fileContent);

      // Should still contain original content because gray-matter parses it, but meta fails validation
      expect(doc.content.trim()).toBe(`---
description: Invalid type test
alwaysApply: 123
---
Content after invalid FM.`);
      // Meta should be the default empty object due to parsing error
      expect(doc.meta).toEqual({
        description: undefined,
        globs: [],
        alwaysApply: false,
      });
      // The doc itself isn't marked as an error, but the parsing failed
      expect(doc.isError).toBe(true);
      expect(doc.errorReason).toBeDefined();
    });

    it("should handle malformed front matter syntax (e.g., bad YAML)", () => {
      // Gray-matter might handle some errors gracefully, but let's try invalid syntax
      const fileContent = `---
description: Bad YAML
globs: [one, two
---
Content after bad FM.`;
      const doc = docParserService.parse(fileName, fileContent);
      console.log(doc);
      expect(doc.content.startsWith("---")).toBe(true);
      expect(doc.meta).toEqual({
        description: undefined,
        globs: [],
        alwaysApply: false,
      });
      expect(doc.isError).toBe(true);
      expect(doc.errorReason).toBeDefined();
    });
  });
});
