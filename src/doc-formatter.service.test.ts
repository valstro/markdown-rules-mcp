import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { DocFormatterService } from "./doc-formatter.service.js";
import { IDocIndexService, Doc, ContextItem, DocLink, DocLinkRange } from "./types.js";
import { unwrapMock } from "../setup.tests.js"; // Assuming you have this helper
import { createMockDoc, createMockDocIndexService } from "./doc-index.service.mock.js";

describe("DocFormatterService", () => {
  let mockDocIndexService: Mocked<IDocIndexService>;
  let docFormatterService: DocFormatterService;

  const DOC_A_PATH = "/path/docA.md";
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
    docFormatterService = new DocFormatterService(unwrapMock(mockDocIndexService));
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
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      const expectedInlineTag = `<inline_doc description="Inline Doc Link" file="${INLINE_DOC_PATH}">\n${inlineDocContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should format a doc with an inline link with line range", async () => {
      const range: DocLinkRange = { from: 1, to: 3 }; // Lines 2, 3, 4 (0-based index, inclusive end)
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        isInline: true,
        inlineLinesRange: range,
        anchorText: "Inline Section",
      };
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      const expectedRangeContent = "Line 2\nLine 3\nLine 4";
      const expectedInlineTag = `<inline_doc description="Inline Section" file="${INLINE_DOC_PATH}" lines="1-3">\n${expectedRangeContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should format a doc with an inline link with line range to 'end'", async () => {
      const range: DocLinkRange = { from: 2, to: "end" }; // Lines 3 to end
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        isInline: true,
        inlineLinesRange: range,
        anchorText: "Inline From Line 3",
      };
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };

      mockDocIndexService.getDoc.mockResolvedValue(inlineDoc);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      const expectedRangeContent = "Line 3\nLine 4\nLine 5";
      const expectedInlineTag = `<inline_doc description="Inline From Line 3" file="${INLINE_DOC_PATH}" lines="2-end">\n${expectedRangeContent}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n\n${expectedInlineTag}\n</doc>`
      );
    });

    it("should skip inline expansion if linked doc is an error doc", async () => {
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docAContent,
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
      expect(result).toBe(`<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n</doc>`); // No inline block
    });

    it("should handle errors when fetching inline doc", async () => {
      const linkToInline: DocLink = {
        filePath: INLINE_DOC_PATH,
        isInline: true,
        anchorText: "Inline Doc Link",
      };
      const docWithInlineLink = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        linksTo: [linkToInline],
      });
      const item: ContextItem = { doc: docWithInlineLink, type: "auto" };
      const fetchError = new Error("Network Error");

      mockDocIndexService.getDoc.mockRejectedValue(fetchError);

      const result = await docFormatterService.formatDoc(item);

      expect(mockDocIndexService.getDoc).toHaveBeenCalledWith(INLINE_DOC_PATH);
      expect(result).toBe(`<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n</doc>`); // No inline block
    });

    it("should format a doc with multiple inline links", async () => {
      const inlineDoc1Path = "/path/inline1.md";
      const inlineDoc2Path = "/path/inline2.md";
      const inlineDoc1Content = "Inline Content 1";
      const inlineDoc2Content = "Inline Content 2";
      const inlineDoc1 = createMockDoc(inlineDoc1Path, { content: inlineDoc1Content });
      const inlineDoc2 = createMockDoc(inlineDoc2Path, { content: inlineDoc2Content });

      const link1: DocLink = { filePath: inlineDoc1Path, isInline: true, anchorText: "Link 1" };
      const link2: DocLink = {
        filePath: inlineDoc2Path,
        isInline: true,
        anchorText: "Link 2",
        inlineLinesRange: { from: 0, to: 0 },
      };

      const docWithLinks = createMockDoc(DOC_A_PATH, {
        content: docAContent,
        linksTo: [link1, link2],
      });
      const item: ContextItem = { doc: docWithLinks, type: "auto" };

      mockDocIndexService.getDoc.mockImplementation(async (path) => {
        if (path === inlineDoc1Path) return inlineDoc1;
        if (path === inlineDoc2Path) return inlineDoc2;
        throw new Error("Unexpected path");
      });

      const result = await docFormatterService.formatDoc(item);

      const expectedInlineTag1 = `<inline_doc description="Link 1" file="${inlineDoc1Path}">\n${inlineDoc1Content}\n</inline_doc>`;
      // Range 0-0 should extract line 1 (index 0)
      const expectedInlineTag2 = `<inline_doc description="Link 2" file="${inlineDoc2Path}" lines="0-0">\n${inlineDoc2Content.split("\n")[0]}\n</inline_doc>`;
      expect(result).toBe(
        `<doc type="auto" file="${DOC_A_PATH}">\n${docAContent}\n\n${expectedInlineTag1}\n\n${expectedInlineTag2}\n</doc>`
      );
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
