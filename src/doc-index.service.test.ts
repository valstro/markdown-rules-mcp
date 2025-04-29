import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { DocIndexService } from "./doc-index.service.js";
import {
  IFileSystemService,
  IDocIndexService,
  IDocParserService,
  ILinkExtractorService,
  Doc,
  DocLink,
  DocIndex,
} from "./types.js";
import { unwrapMock } from "../setup.tests.js";
import { Config } from "./config.js";

vi.mock("./file-system.service.js");
vi.mock("./doc-parser.service.js");
vi.mock("./link-extractor.service.js");

function createMockFileSystemService(): Mocked<IFileSystemService> {
  return {
    findFiles: vi.fn(),
    readFile: vi.fn(),
    resolvePath: vi.fn((...paths) => paths.join("/")), // Simple path join for tests
    getDirname: vi.fn((filePath) => filePath.substring(0, filePath.lastIndexOf("/"))),
    getProjectRoot: vi.fn(() => "/project"),
    pathExists: vi.fn().mockResolvedValue(true),
  };
}

function createMockDocParserService(): Mocked<IDocParserService> {
  return {
    parse: vi.fn(),
    getBlankDoc: vi.fn(),
    isMarkdown: vi.fn((fileName) => fileName.toLowerCase().endsWith(".md")),
  };
}

function createMockLinkExtractorService(): Mocked<ILinkExtractorService> {
  return {
    extractLinks: vi.fn().mockReturnValue([]), // Default to no links
  };
}

function createMockDoc(filePath: string, options: Partial<Doc> = {}): Doc {
  const { content = "", linksTo = [], isMarkdown = true, isError = false, errorReason } = options;
  return {
    filePath,
    content,
    linksTo,
    isMarkdown,
    isError,
    contentLinesBeforeParsed: content.split("\n").length,
    meta: options.meta ?? { description: undefined, globs: [], alwaysApply: false }, // Use provided meta or default
    // Prioritize passed errorReason. If not passed, use default logic based on isError.
    errorReason: errorReason !== undefined ? errorReason : isError ? "Mock Error" : undefined,
  };
}

describe("DocIndexService", () => {
  let mockFileSystemService: Mocked<IFileSystemService>;
  let mockDocParserService: Mocked<IDocParserService>;
  let mockLinkExtractorService: Mocked<ILinkExtractorService>;
  let mockConfig: Config;
  let docIndexService: IDocIndexService;

  const FILE_A = "/project/docA.md";
  const FILE_B = "/project/docB.md";
  const FILE_C = "/project/docC.md";
  const FILE_D = "/project/docD.md";
  const FILE_E = "/project/docE.md";
  const FILE_JSON = "/project/config.json";

  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks between tests

    mockFileSystemService = createMockFileSystemService();
    mockDocParserService = createMockDocParserService();
    mockLinkExtractorService = createMockLinkExtractorService();
    mockConfig = {
      PROJECT_ROOT: "/project",
      MARKDOWN_GLOB_PATTERN: "**/*.md",
      LOG_LEVEL: "error",
      HOIST_ORDER: "post",
    };

    // Default implementations that can be overridden in specific tests
    mockFileSystemService.resolvePath.mockImplementation((base, relative) => {
      // Basic relative path resolution needed for link extraction tests
      if (!relative) return base;
      if (relative.startsWith("/")) return relative; // Already absolute
      const parts = base.split("/");
      parts.pop(); // Remove filename if base is a file path
      const relParts = relative.split("/");
      for (const part of relParts) {
        if (part === "..") {
          parts.pop();
        } else if (part !== ".") {
          parts.push(part);
        }
      }
      return parts.join("/");
    });

    mockDocParserService.getBlankDoc.mockImplementation((filePath, docOverride) =>
      createMockDoc(filePath, {
        content: docOverride?.content ?? "",
        linksTo: [],
        isMarkdown: mockDocParserService.isMarkdown(filePath),
        isError: docOverride?.isError ?? false,
        errorReason: docOverride?.errorReason,
      })
    );

    docIndexService = new DocIndexService(
      mockConfig,
      unwrapMock(mockFileSystemService),
      unwrapMock(mockDocParserService),
      unwrapMock(mockLinkExtractorService)
    );
  });

  it("should build an index with a single document and no links", async () => {
    const docAContent = "# Doc A";
    const docA = createMockDoc(FILE_A, { content: docAContent });

    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]);
    mockFileSystemService.readFile.mockResolvedValue(docAContent);
    mockDocParserService.parse.mockReturnValue(docA);
    mockLinkExtractorService.extractLinks.mockReturnValue([]); // No links from Doc A

    const index = await docIndexService.buildIndex();

    expect(mockFileSystemService.findFiles).toHaveBeenCalledTimes(1);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_A);
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(index.size).toBe(1);
    expect(index.get(FILE_A)).toEqual(docA); // Check the doc content
    expect(index.get(FILE_A)?.linksTo).toEqual([]); // Ensure linksTo is empty
  });

  it("should build an index resolving a single link", async () => {
    const docAContent = "# Doc A\n[Link to B](./docB.md?mdr-include=true)";
    const docBContent = "# Doc B";
    const docA = createMockDoc(FILE_A, { content: docAContent });
    const docB = createMockDoc(FILE_B, { content: docBContent });
    const linkToB: DocLink = {
      filePath: FILE_B,
      isInline: false,
      anchorText: "Link to B",
      startIndex: 0,
      endIndex: 0,
    };

    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]);
    mockFileSystemService.readFile.mockImplementation(async (path) => {
      if (path === FILE_A) return docAContent;
      if (path === FILE_B) return docBContent;
      throw new Error(`Unexpected readFile call: ${path}`);
    });
    mockDocParserService.parse.mockImplementation((filePath, content) => {
      if (filePath === FILE_A) return { ...docA, content }; // Return a copy
      if (filePath === FILE_B) return { ...docB, content };
      throw new Error(`Unexpected parse call: ${filePath}`);
    });
    mockLinkExtractorService.extractLinks.mockImplementation((filePath, content) => {
      if (filePath === FILE_A) return [linkToB];
      if (filePath === FILE_B) return []; // Doc B has no links
      return [];
    });

    const index = await docIndexService.buildIndex();

    expect(mockFileSystemService.findFiles).toHaveBeenCalledTimes(1);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_A);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_B);
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_B, docBContent);
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledWith(FILE_B, docBContent);

    expect(index.size).toBe(2);
    expect(index.get(FILE_A)).toBeDefined();
    expect(index.get(FILE_B)).toBeDefined();
    // Check the links *after* buildIndex has updated them
    const finalDocA = index.get(FILE_A)!;
    const finalDocB = index.get(FILE_B)!;
    expect(finalDocA.linksTo).toEqual([linkToB]);
    expect(finalDocB.linksTo).toEqual([]);
  });

  it("should handle circular dependencies without infinite looping", async () => {
    const docAContent = "# Doc A\n[Link to B](./docB.md?mdr-include=true)";
    const docBContent = "# Doc B\n[Link to A](./docA.md?mdr-include=true)";
    const docA = createMockDoc(FILE_A, { content: docAContent });
    const docB = createMockDoc(FILE_B, { content: docBContent });
    const linkToB: DocLink = {
      filePath: FILE_B,
      isInline: false,
      anchorText: "Link to B",
      startIndex: 0,
      endIndex: 0,
    };
    const linkToA: DocLink = {
      filePath: FILE_A,
      isInline: false,
      anchorText: "Link to A",
      startIndex: 0,
      endIndex: 0,
    };

    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]); // Start with A
    mockFileSystemService.readFile.mockImplementation(async (path) => {
      if (path === FILE_A) return docAContent;
      if (path === FILE_B) return docBContent;
      throw new Error(`Unexpected readFile call: ${path}`);
    });
    mockDocParserService.parse.mockImplementation((filePath, content) => {
      if (filePath === FILE_A) return { ...docA, content };
      if (filePath === FILE_B) return { ...docB, content };
      throw new Error(`Unexpected parse call: ${filePath}`);
    });
    mockLinkExtractorService.extractLinks.mockImplementation((filePath) => {
      if (filePath === FILE_A) return [linkToB];
      if (filePath === FILE_B) return [linkToA];
      return [];
    });

    const index = await docIndexService.buildIndex();

    expect(index.size).toBe(2);
    expect(mockFileSystemService.readFile).toHaveBeenCalledTimes(2); // A and B read once
    expect(mockDocParserService.parse).toHaveBeenCalledTimes(2); // A and B parsed once
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledTimes(2); // Links extracted from A and B

    const finalDocA = index.get(FILE_A)!;
    const finalDocB = index.get(FILE_B)!;
    expect(finalDocA.linksTo).toEqual([linkToB]);
    expect(finalDocB.linksTo).toEqual([linkToA]);
  });

  it("should handle links to non-markdown files", async () => {
    const docAContent = "# Doc A\n[Config](./config.json?mdr-include=true)";
    const jsonContent = JSON.stringify({ key: "value" });
    const docA = createMockDoc(FILE_A, { content: docAContent });
    const jsonDoc = createMockDoc(FILE_JSON, { content: jsonContent, isMarkdown: false });
    const linkToJson: DocLink = {
      filePath: FILE_JSON,
      isInline: false,
      anchorText: "Config",
      startIndex: 0,
      endIndex: 0,
    };

    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]);
    mockFileSystemService.readFile.mockImplementation(async (path) => {
      if (path === FILE_A) return docAContent;
      if (path === FILE_JSON) return jsonContent;
      throw new Error(`Unexpected readFile call: ${path}`);
    });
    mockDocParserService.parse.mockImplementation((filePath, content) => {
      if (filePath === FILE_A) return { ...docA, content };
      throw new Error(`Parse should not be called for non-markdown: ${filePath}`);
    });
    // getBlankDoc will be used for the JSON
    mockDocParserService.getBlankDoc.mockImplementation((filePath, docOverride) => {
      if (filePath === FILE_JSON)
        return {
          ...jsonDoc,
          content: docOverride?.content ?? "",
          isError: docOverride?.isError ?? false,
          errorReason: docOverride?.errorReason,
        };

      // Allow default mock for others if needed, though parse should handle docA
      return createMockDoc(filePath, {
        content: docOverride?.content ?? "",
        linksTo: [],
        isMarkdown: mockDocParserService.isMarkdown(filePath),
        isError: docOverride?.isError ?? false,
        errorReason: docOverride?.errorReason,
      });
    });

    mockLinkExtractorService.extractLinks.mockImplementation((filePath) => {
      if (filePath === FILE_A) return [linkToJson];
      // Should not be called for config.json
      if (filePath === FILE_JSON) throw new Error("ExtractLinks called on non-markdown");
      return [];
    });
    // Ensure isMarkdown returns correctly
    mockDocParserService.isMarkdown.mockImplementation((fp) => fp.endsWith(".md"));

    const index = await docIndexService.buildIndex();

    expect(index.size).toBe(2);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_A);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_JSON);
    expect(mockDocParserService.parse).toHaveBeenCalledTimes(1); // Only for Doc A
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(mockDocParserService.getBlankDoc).toHaveBeenCalledWith(FILE_JSON, {
      content: jsonContent,
      isMarkdown: false,
    }); // Called internally by getDoc for non-markdown
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledTimes(1); // Only for Doc A
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledWith(FILE_A, docAContent);

    const finalDocA = index.get(FILE_A)!;
    const finaljsonDoc = index.get(FILE_JSON)!;
    expect(finalDocA.linksTo).toEqual([linkToJson]);
    expect(finaljsonDoc.isMarkdown).toBe(false);
    expect(finaljsonDoc.linksTo).toEqual([]); // No links extracted from non-markdown
  });

  it("should create an error doc if readFile fails", async () => {
    const readError = new Error("File not found");
    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]);
    mockFileSystemService.readFile.mockRejectedValue(readError); // Simulate file read error
    // getBlankDoc will be used to create the error placeholder
    mockDocParserService.getBlankDoc.mockImplementation((filePath, docOverride) =>
      createMockDoc(filePath, {
        content: docOverride?.content ?? "",
        linksTo: [],
        isMarkdown: mockDocParserService.isMarkdown(filePath),
        isError: docOverride?.isError ?? false,
        errorReason: docOverride?.errorReason,
      })
    );

    const index = await docIndexService.buildIndex();

    expect(index.size).toBe(1);
    const errorDoc = index.get(FILE_A);
    expect(errorDoc).toBeDefined();
    expect(errorDoc?.isError).toBe(true);
    expect(errorDoc?.errorReason).toContain("File not found");
    expect(errorDoc?.content).toContain("");
    expect(mockDocParserService.parse).not.toHaveBeenCalled(); // Should not attempt parse
    expect(mockLinkExtractorService.extractLinks).not.toHaveBeenCalled(); // Should not extract links
    expect(mockDocParserService.getBlankDoc).toHaveBeenCalledWith(FILE_A, {
      isMarkdown: true,
      isError: true,
      errorReason: `Error loading content: ${readError.message}`,
    });
  });

  it("should create an error doc if parse fails", async () => {
    const docAContent = "-\nInvalid YAML\n-\n# Doc A"; // Malformed front matter perhaps
    const parseError = new Error("YAML parse error");
    mockFileSystemService.findFiles.mockResolvedValue([FILE_A]);
    mockFileSystemService.readFile.mockResolvedValue(docAContent);
    mockDocParserService.parse.mockImplementation((filePath, content) => {
      // Simulate the behavior of DocParserService: return a Doc with isError true
      const errorDoc = createMockDoc(filePath, {
        content,
        linksTo: [],
        isError: true,
        isMarkdown: true,
      });
      errorDoc.errorReason = `Failed to parse doc meta YAML: ${parseError.message}`;
      return errorDoc;
    });

    const index = await docIndexService.buildIndex();

    expect(index.size).toBe(1);
    const errorDoc = index.get(FILE_A);
    expect(errorDoc).toBeDefined();
    expect(errorDoc?.isError).toBe(true);
    expect(errorDoc?.errorReason).toContain(parseError.message);
    expect(errorDoc?.content).toBe(docAContent); // Content should still be there as per DocParserService logic
    expect(mockLinkExtractorService.extractLinks).not.toHaveBeenCalled(); // Should not extract links from error doc
  });

  it("should reuse existing docs from the map instead of re-reading/parsing", async () => {
    // Scenario: A -> B, C -> B. FindFiles returns A and C.
    const docAContent = "# Doc A\n[Link to B](./docB.md?mdr-include=true)";
    const docBContent = "# Doc B";
    const docCContent = "# Doc C\n[Link to B](./docB.md?mdr-include=true)";
    const docA = createMockDoc(FILE_A, { content: docAContent });
    const docB = createMockDoc(FILE_B, { content: docBContent });
    const docC = createMockDoc(FILE_C, { content: docCContent });
    const linkToBFromA: DocLink = {
      filePath: FILE_B,
      isInline: false,
      anchorText: "Link to B",
      startIndex: 0,
      endIndex: 0,
    };
    const linkToBFromC: DocLink = {
      filePath: FILE_B,
      isInline: false,
      anchorText: "Link to B",
      startIndex: 0,
      endIndex: 0,
    };

    mockFileSystemService.findFiles.mockResolvedValue([FILE_A, FILE_C]); // Start with A and C
    mockFileSystemService.readFile.mockImplementation(async (path) => {
      if (path === FILE_A) return docAContent;
      if (path === FILE_B) return docBContent;
      if (path === FILE_C) return docCContent;
      throw new Error(`Unexpected readFile call: ${path}`);
    });
    mockDocParserService.parse.mockImplementation((filePath, content) => {
      if (filePath === FILE_A) return { ...docA, content };
      if (filePath === FILE_B) return { ...docB, content };
      if (filePath === FILE_C) return { ...docC, content };
      throw new Error(`Unexpected parse call: ${filePath}`);
    });
    mockLinkExtractorService.extractLinks.mockImplementation((filePath) => {
      if (filePath === FILE_A) return [linkToBFromA];
      if (filePath === FILE_C) return [linkToBFromC];
      if (filePath === FILE_B) return []; // B has no links
      return [];
    });

    const index = await docIndexService.buildIndex();

    expect(index.size).toBe(3);
    expect(mockFileSystemService.readFile).toHaveBeenCalledTimes(3); // A, C (initial), B (discovered)
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_A);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_C);
    expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_B);
    expect(mockDocParserService.parse).toHaveBeenCalledTimes(3); // A, C, B parsed once each
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_A, docAContent);
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_C, docCContent);
    expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_B, docBContent);
    expect(mockLinkExtractorService.extractLinks).toHaveBeenCalledTimes(3); // Links extracted from A, C, B

    const finalDocA = index.get(FILE_A)!;
    const finalDocC = index.get(FILE_C)!;
    const finalDocB = index.get(FILE_B)!;
    expect(finalDocA.linksTo).toEqual([linkToBFromA]);
    expect(finalDocC.linksTo).toEqual([linkToBFromC]);
    expect(finalDocB.linksTo).toEqual([]);
  });

  describe("getDoc", () => {
    it("should read and parse a doc if not in cache", async () => {
      const docAContent = "# Doc A";
      const docA = createMockDoc(FILE_A, { content: docAContent });
      mockFileSystemService.readFile.mockResolvedValue(docAContent);
      mockDocParserService.parse.mockReturnValue(docA);

      const result = await docIndexService.getDoc(FILE_A);

      expect(result).toEqual(docA);
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_A);
      expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_A, docAContent);
      // Check internal map state (implementation detail, but useful here)
      // @ts-expect-error - Accessing private member for test verification
      const internalMap = docIndexService.docMap as DocIndex;
      expect(internalMap.has(FILE_A)).toBe(true);
      expect(internalMap.get(FILE_A)).toEqual(docA);
    });

    it("should return doc from cache if already loaded", async () => {
      const docAContent = "# Doc A";
      const docA = createMockDoc(FILE_A, { content: docAContent });
      mockFileSystemService.readFile.mockResolvedValue(docAContent);
      mockDocParserService.parse.mockReturnValue(docA);

      // Load it the first time
      await docIndexService.getDoc(FILE_A);

      // Reset call counts
      mockFileSystemService.readFile.mockClear();
      mockDocParserService.parse.mockClear();

      // Get it the second time
      const result = await docIndexService.getDoc(FILE_A);

      expect(result).toEqual(docA);
      expect(mockFileSystemService.readFile).not.toHaveBeenCalled();
      expect(mockDocParserService.parse).not.toHaveBeenCalled();
    });

    it("should return an error doc if readFile fails", async () => {
      const readError = new Error("Cannot read");
      mockFileSystemService.readFile.mockRejectedValue(readError);
      mockDocParserService.getBlankDoc.mockImplementation((filePath, docOverride) =>
        createMockDoc(filePath, {
          content: docOverride?.content ?? "",
          linksTo: [],
          isMarkdown: mockDocParserService.isMarkdown(filePath),
          isError: docOverride?.isError ?? false,
          errorReason: docOverride?.errorReason,
        })
      );

      const result = await docIndexService.getDoc(FILE_A);

      expect(result.isError).toBe(true);
      expect(result.filePath).toBe(FILE_A);
      expect(result.errorReason).toContain(readError.message);
      expect(mockDocParserService.parse).not.toHaveBeenCalled();
      expect(mockDocParserService.getBlankDoc).toHaveBeenCalledWith(FILE_A, {
        isMarkdown: true,
        isError: true,
        errorReason: `Error loading content: ${readError.message}`,
      });
    });
  });

  describe("getDocs", () => {
    it("should fetch multiple docs, utilizing cache", async () => {
      const docAContent = "# Doc A";
      const docBContent = "# Doc B";
      const docA = createMockDoc(FILE_A, { content: docAContent });
      const docB = createMockDoc(FILE_B, { content: docBContent });

      // Pre-load Doc A into cache
      mockFileSystemService.readFile.mockResolvedValueOnce(docAContent);
      mockDocParserService.parse.mockReturnValueOnce(docA);
      await docIndexService.getDoc(FILE_A);

      // Reset mocks for the getDocs call
      mockFileSystemService.readFile.mockClear();
      mockDocParserService.parse.mockClear();
      mockFileSystemService.readFile.mockResolvedValueOnce(docBContent); // For Doc B
      mockDocParserService.parse.mockReturnValueOnce(docB); // For Doc B

      const results = await docIndexService.getDocs([FILE_A, FILE_B, FILE_A]); // Request A, B, and A again

      expect(results).toHaveLength(2); // Duplicates should be handled
      expect(results).toEqual(expect.arrayContaining([docA, docB]));
      expect(mockFileSystemService.readFile).toHaveBeenCalledTimes(1); // Only called for B
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith(FILE_B);
      expect(mockDocParserService.parse).toHaveBeenCalledTimes(1); // Only called for B
      expect(mockDocParserService.parse).toHaveBeenCalledWith(FILE_B, docBContent);
    });
  });

  describe("getAgentAttachableDocs", () => {
    it("should return all markdown docs that are not global and have no auto-attachment globs", () => {
      const docA = createMockDoc(FILE_A, {
        content: "# Doc A",
        meta: { description: "Doc A", alwaysApply: false, globs: [] },
      });
      const docB = createMockDoc(FILE_B, {
        content: "# Doc B",
        meta: { description: "Doc B", alwaysApply: true, globs: [] },
      });
      const docC = createMockDoc(FILE_C, {
        content: "# Doc C",
        meta: { description: "Doc C", alwaysApply: false, globs: ["*.md"] },
      });
      const docD = createMockDoc(FILE_D, {
        content: "# Doc D",
        meta: { description: "Doc D", alwaysApply: false, globs: [] },
      });
      const docE = createMockDoc(FILE_E, {
        content: "# Doc E",
        meta: { description: "Doc E", alwaysApply: false, globs: ["*.md"] },
      });

      const docs = [docA, docB, docC, docD, docE];
      const index = new DocIndexService(
        mockConfig,
        mockFileSystemService,
        mockDocParserService,
        mockLinkExtractorService
      );
      index.setDocs(docs);

      const result = index.getAgentAttachableDocs();

      expect(result).toEqual([docA, docD]);
    });
  });
});
