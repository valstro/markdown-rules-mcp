import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { DocFormatterService } from "./doc-formatter.service.js";
import {
  IDocIndexService,
  Doc,
  ContextItem,
  DocLink,
  DocLinkRange,
  IFileSystemService,
} from "./types.js";
import { unwrapMock } from "../setup.tests.js"; // Assuming you have this helper
import { createMockDoc, createMockDocIndexService } from "./doc-index.service.mock.js";
import { createMockFileSystemService } from "./file-system.service.mock.js";

describe("DocFormatterService", () => {
  let mockDocIndexService: Mocked<IDocIndexService>;
  let mockFileSystemService: Mocked<IFileSystemService>;
  let docFormatterService: DocFormatterService;

  const DOC_A_PATH = "/path/docA.md";
  const DOC_A_DIR = "/path";
  const FILE_B_PATH = "/path/fileB.txt";
  const INLINE_DOC_PATH = "/path/inline.md";

  const docAContent = "Content for Doc A";
  const fileBContent = "Content for File B";
  const inlineDocContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";

  const docA = createMockDoc(DOC_A_PATH, { content: docAContent });
  const fileB = createMockDoc(FILE_B_PATH, { content: fileBContent, isMarkdown: false });
  const inlineDoc = createMockDoc(INLINE_DOC_PATH, { content: inlineDocContent });

  beforeEach(() => {
    vi.resetAllMocks();
    mockDocIndexService = createMockDocIndexService();
    mockFileSystemService = createMockFileSystemService();

    mockFileSystemService.getDirname.mockImplementation((filePath) => {
      if (filePath === DOC_A_PATH) return DOC_A_DIR;
      return "/mock/dir";
    });

    mockFileSystemService.resolvePath.mockImplementation((base, rel) => {
      if (base === DOC_A_DIR && (rel === './inline.md' || rel === './inline1.md' || rel === './inline2.md')) {
        if (rel === './inline.md') return INLINE_DOC_PATH;
        if (rel === './inline1.md') return '/path/inline1.md';
        if (rel === './inline2.md') return '/path/inline2.md';
      }
      return `${base}/${rel.startsWith('/') ? '' : '/'}${rel.replace(/^\.\//, '')}`;
    });

    docFormatterService = new DocFormatterService(
      unwrapMock(mockDocIndexService),
      unwrapMock(mockFileSystemService)
    );
  });

  describe("formatDoc", () => {
    it("should format a basic markdown document", async () => {
      const item: ContextItem = { doc: docA, type: "auto" };
      const result = await docFormatterService.formatDoc(item);
      expect(result).toBe(`<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n</doc>`);
    });

    it("should format a basic non-markdown file", async () => {
      const item: ContextItem = { doc: fileB, type: "agent" };
      const result = await docFormatterService.formatDoc(item);
      expect(result).toBe(`<file type="agent" file="${FILE_B_PATH}">\n${fileBContent}\n</file>`);
    });

    it("should format a markdown document with a description", async () => {
      const docWithDesc = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        meta: { description: "Doc A Description", globs: [], alwaysApply: false },
      });
      const item: ContextItem = { doc: docWithDesc, type: "related" };
      const result = await docFormatterService.formatDoc(item);
      expect(result).toBe(
        `<doc description="Doc A Description" type="related" file="${DOC_A_PATH}">\n${docAContent}\n</doc>`
      );
    });

    it("should escape quotes in the description attribute", async () => {
      const descWithQuotes = 'Description with "quotes"';
      const docWithDesc = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        meta: { description: descWithQuotes, globs: [], alwaysApply: false },
      });
      const item: ContextItem = { doc: docWithDesc, type: "always" };
      const result = await docFormatterService.formatDoc(item);
      expect(result).toBe(
        `<doc description="Description with &quot;quotes&quot;" type="always" file="${DOC_A_PATH}">\n${docAContent}\n</doc>`
      );
    });

    it("should format a doc with an inline link", async () => {
      const rawTarget = "./inline.md?mdr-include=true&mdr-inline=true";
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        rawLinkTarget: rawTarget,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docContentWithLink = `${docAContent}\n[Inline Doc Link](${rawTarget})`;
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docContentWithLink,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_A_PATH);
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline.md");

      const expectedInlineTag = `<inline_doc description="Inline Doc Link" file="${INLINE_DOC_PATH}">\n${inlineDocContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n[Inline Doc Link](${rawTarget})\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should format a doc with an inline link with line range", async () => {
      const range: DocLinkRange = { from: 1, to: 3 };
      const rawTarget = "./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=1-3";
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        rawLinkTarget: rawTarget,
        isInline: true,
        inlineLinesRange: range,
        anchorText: "Inline Section",
      };
      const docContentWithLink = `${docAContent}\n[Inline Section](${rawTarget})`;
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docContentWithLink,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_A_PATH);
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline.md");

      const expectedRangeContent = "Line 2\nLine 3\nLine 4";
      const expectedInlineTag = `<inline_doc description="Inline Section" file="${INLINE_DOC_PATH}" lines="1-3">\n${expectedRangeContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n[Inline Section](${rawTarget})\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should format a doc with an inline link with line range to 'end'", async () => {
      const range: DocLinkRange = { from: 2, to: "end" };
      const rawTarget = "./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=2-end";
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        rawLinkTarget: rawTarget,
        isInline: true,
        inlineLinesRange: range,
        anchorText: "Inline From Line 3",
      };
      const docContentWithLink = `${docAContent}\n[Inline From Line 3](${rawTarget})`;
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docContentWithLink,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_A_PATH);
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline.md");

      const expectedRangeContent = "Line 3\nLine 4\nLine 5";
      const expectedInlineTag = `<inline_doc description="Inline From Line 3" file="${INLINE_DOC_PATH}" lines="2-end">\n${expectedRangeContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n[Inline From Line 3](${rawTarget})\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should skip inline expansion if linked doc is an error doc", async () => {
      const rawTarget = "./inline.md?mdr-include=true&mdr-inline=true";
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        rawLinkTarget: rawTarget,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docContentWithLink = `${docAContent}\n[Inline Doc Link](${rawTarget})`;
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docContentWithLink,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };
      const errorInlineDoc = createMockDoc(INLINE_DOC_PATH, {
        isError: true,
        errorReason: "Read failed",
      });

      mockDocIndexService.getDoc.mockResolvedValue(errorInlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline.md");
      expect(result).toBe(`<doc type="auto" file="${DOC_A_PATH}">\n${docContentWithLink}\n</doc>`);
    });

    it("should handle errors when fetching inline doc", async () => {
      const rawTarget = "./inline.md?mdr-include=true&mdr-inline=true";
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        rawLinkTarget: rawTarget,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docContentWithLink = `${docAContent}\n[Inline Doc Link](${rawTarget})`;
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docContentWithLink,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };
      const fetchError = new Error("Network Error");

      mockDocIndexService.getDoc.mockRejectedValue(fetchError);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline.md");
      expect(result).toBe(`<doc type="auto" file="${DOC_A_PATH}">\n${docContentWithLink}\n</doc>`);
    });

    it("should format a doc with multiple inline links inserted correctly", async () => {
      const inlineDoc1Path = "/path/inline1.md";
      const inlineDoc2Path = "/path/inline2.md";
      const inlineDoc1Content = "Inline Content 1";
      const inlineDoc2Content = "First line C2\nSecond line C2";
      const inlineDoc1 = createMockDoc(inlineDoc1Path, { content: inlineDoc1Content });
      const inlineDoc2 = createMockDoc(inlineDoc2Path, { content: inlineDoc2Content });

      const rawTarget1 = "./inline1.md?mdr-include=true&mdr-inline=true";
      const rawTarget2 = "./inline2.md?mdr-include=true&mdr-inline=true&mdr-lines=0-0";

      const link1: DocLink = {
        filePath: inlineDoc1Path,
        rawLinkTarget: rawTarget1,
        isInline: true,
        anchorText: "Link 1",
      };
      const link2: DocLink = {
        filePath: inlineDoc2Path,
        rawLinkTarget: rawTarget2,
        isInline: true,
        anchorText: "Link 2",
        inlineLinesRange: { from: 0, to: 0 },
      };

      const docContentWithLinks = `Some text before.\n[Link 1](${rawTarget1})\nSome text between.\n[Link 2](${rawTarget2})\nSome text after.`;

      const docWithLinks = createMockDoc(DOC_A_PATH, {
        content: docContentWithLinks,
        linksTo: [link1, link2],
      });
      const item: ContextItem = { doc: docWithLinks, type: "auto" };

      mockDocIndexService.getDoc.mockImplementation(async (path) => {
        if (path === inlineDoc1Path) return inlineDoc1;
        if (path === inlineDoc2Path) return inlineDoc2;
        throw new Error("Unexpected path");
      });
      mockFileSystemService.resolvePath.mockImplementation((base, rel) => {
        if (rel === "./inline1.md") return inlineDoc1Path;
        if (rel === "./inline2.md") return inlineDoc2Path;
        return `${base}/${rel}`;
      });

      const result = await docFormatterService.formatDoc(item);

      const expectedInlineTag1 = `<inline_doc description="Link 1" file="${inlineDoc1Path}">\n${inlineDoc1Content}\n</inline_doc>`;
      const expectedInlineTag2 = `<inline_doc description="Link 2" file="${inlineDoc2Path}" lines="0-0">\n${inlineDoc2Content.split("\n")[0]}\n</inline_doc>`;

      const expectedFinalContent = `Some text before.\n[Link 1](${rawTarget1})\n${expectedInlineTag1}\nSome text between.\n[Link 2](${rawTarget2})\n${expectedInlineTag2}\nSome text after.`;

      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${expectedFinalContent}\n</doc>`
      );
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline1.md");
      expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(DOC_A_DIR, "./inline2.md");
    });
  });

  describe("formatContextOutput", () => {
    it("should format multiple context items", async () => {
      const itemA: ContextItem = { doc: docA, type: "auto" };
      const itemC: ContextItem = { doc: fileB, type: "agent" };
      const items = [itemA, itemC];

      // Mock formatDoc calls or rely on tested implementation
      // For isolation, mock formatDoc:
      const formatDocSpy = vi.spyOn(docFormatterService, "formatDoc");
      formatDocSpy.mockResolvedValueOnce("formatted_doc_A");
      formatDocSpy.mockResolvedValueOnce("formatted_file_C");

      const result = await docFormatterService.formatContextOutput(items);

      expect(formatDocSpy).toHaveBeenCalledTimes(2);
      expect(formatDocSpy).toHaveBeenCalledWith(itemA);
      expect(formatDocSpy).toHaveBeenCalledWith(itemC);
      expect(result).toBe("formatted_doc_A\n\nformatted_file_C");
    });

    it("should return an empty string for no items", async () => {
      const result = await docFormatterService.formatContextOutput([]);
      expect(result).toBe("");
    });
  });

  describe("extractRangeContent", () => {
    const multiLineContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    // Use internal access for testing private method - adjust if needed
    const extractRangeContent = (content: string, range?: DocLinkRange) => {
      // @ts-expect-error Accessing private method
      return docFormatterService.extractRangeContent(content, range);
    };

    it("should return full content if no range is provided", () => {
      expect(extractRangeContent(multiLineContent)).toBe(multiLineContent);
    });

    it("should extract content for a valid from-to range", () => {
      // Lines 2, 3, 4 (indices 1, 2, 3)
      expect(extractRangeContent(multiLineContent, { from: 1, to: 3 })).toBe(
        "Line 2\nLine 3\nLine 4"
      );
    });

    it("should extract content for a range starting from 0", () => {
      // Lines 1, 2 (indices 0, 1)
      expect(extractRangeContent(multiLineContent, { from: 0, to: 1 })).toBe("Line 1\nLine 2");
    });

    it("should extract content for a range ending at 'end'", () => {
      // Lines 3, 4, 5 (indices 2, 3, 4)
      expect(extractRangeContent(multiLineContent, { from: 2, to: "end" })).toBe(
        "Line 3\nLine 4\nLine 5"
      );
    });

    it("should handle range end exceeding content length", () => {
      // Lines 4, 5 (indices 3, 4) - asking for up to index 10
      expect(extractRangeContent(multiLineContent, { from: 3, to: 10 })).toBe("Line 4\nLine 5");
    });

    it("should handle range start exceeding content length", () => {
      expect(extractRangeContent(multiLineContent, { from: 10, to: 15 })).toBe("");
    });

    it("should handle various range scenarios", () => {
      // Invalid range: start > end returns empty string
      expect(extractRangeContent(multiLineContent, { from: 3, to: 2 })).toBe("");
      // Valid range: start === end extracts one line (index = start)
      expect(extractRangeContent(multiLineContent, { from: 3, to: 3 })).toBe("Line 4");
    });
  });

  describe("formatRange", () => {
    // Use internal access for testing private method
    const formatRange = (range: DocLinkRange) => {
      // @ts-expect-error Accessing private method
      return docFormatterService.formatRange(range);
    };
    it("should format from-to range", () => {
      expect(formatRange({ from: 10, to: 20 })).toBe("10-20");
    });
    it("should format from-end range", () => {
      expect(formatRange({ from: 5, to: "end" })).toBe("5-end");
    });
  });
});
