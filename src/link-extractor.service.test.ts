import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { LinkExtractorService } from "./link-extractor.service";
import { IFileSystemService, DocLink } from "./types.js";
import { unwrapMock } from "../setup.tests.js";

vi.mock("./file-system.service.js");

function createMockFileSystemService(): Mocked<IFileSystemService> {
  return {
    findFiles: vi.fn(),
    readFile: vi.fn(),
    resolvePath: vi.fn(),
    getDirname: vi.fn(),
    getProjectRoot: vi.fn(),
    pathExists: vi.fn(),
  };
}
describe("LinkExtractorService", () => {
  let mockFileSystemService: Mocked<IFileSystemService>;
  let linkExtractorService: LinkExtractorService;

  const DOC_FILE_PATH = "/path/to/source/doc.md";
  const SOURCE_DIR = "/path/to/source";

  beforeEach(() => {
    vi.resetAllMocks();

    mockFileSystemService = createMockFileSystemService();

    mockFileSystemService.getDirname.mockReturnValue(SOURCE_DIR);
    mockFileSystemService.resolvePath.mockImplementation((base, rel) => {
      if (rel.startsWith("/")) {
        const root = mockFileSystemService.getProjectRoot() || "/project";
        return `${root}${rel.startsWith("/") ? rel : "/" + rel}`;
      }
      const parts = base.split("/");
      if (base.endsWith(".md")) parts.pop();
      const relParts = rel.split("/");
      for (const part of relParts) {
        if (part === "..") {
          parts.pop();
        } else if (part !== ".") {
          parts.push(part);
        }
      }
      return parts.join("/");
    });
    mockFileSystemService.getProjectRoot.mockReturnValue("/project");

    linkExtractorService = new LinkExtractorService(unwrapMock(mockFileSystemService));
  });

  it("should be defined", () => {
    expect(linkExtractorService).toBeDefined();
  });

  it("should extract a single markdown link with ?mdr-include=true", () => {
    const content = "Some text [link text](./relative/link.md?mdr-include=true) more text.";
    const relativeLink = "./relative/link.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/relative/link.md`;
    const startIndex = content.indexOf("[link text]");
    const endIndex = startIndex + "[link text](./relative/link.md?mdr-include=true)".length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link text",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a single markdown link with ?mdr-include=1", () => {
    const content = "Some text [link text](./relative/link.md?mdr-include=1) more text.";
    const relativeLink = "./relative/link.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/relative/link.md`;
    const startIndex = content.indexOf("[link text]");
    const endIndex = startIndex + "[link text](./relative/link.md?mdr-include=1)".length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link text",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract multiple markdown links with ?mdr-include=true and ?mdr-include=1", () => {
    const link1Text = "[link1](../link1.md?mdr-include=true)";
    const link2Text = "[link2](./folder/link2.md?mdr-include=true&other=param)";
    const link3Text = "[link3](./folder/link3.md?mdr-include=1&other=param)";
    const content = `
      First link: ${link1Text}
      Second link: ${link2Text}
      Third link: ${link3Text}
      Some other text.
    `;
    const relativeLink1 = "../link1.md";
    const relativeLink2 = "./folder/link2.md";
    const relativeLink3 = "./folder/link3.md";
    const expectedAbsolutePath1 = `${SOURCE_DIR.substring(0, SOURCE_DIR.lastIndexOf("/"))}/link1.md`;
    const expectedAbsolutePath2 = `${SOURCE_DIR}/folder/link2.md`;
    const expectedAbsolutePath3 = `${SOURCE_DIR}/folder/link3.md`;

    const startIndex1 = content.indexOf(link1Text);
    const endIndex1 = startIndex1 + link1Text.length;
    const startIndex2 = content.indexOf(link2Text);
    const endIndex2 = startIndex2 + link2Text.length;
    const startIndex3 = content.indexOf(link3Text);
    const endIndex3 = startIndex3 + link3Text.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink1);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink2);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink3);
    expect(links).toHaveLength(3);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath1,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link1",
        startIndex: startIndex1,
        endIndex: endIndex1,
      },
      {
        filePath: expectedAbsolutePath2,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link2",
        startIndex: startIndex2,
        endIndex: endIndex2,
      },
      {
        filePath: expectedAbsolutePath3,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link3",
        startIndex: startIndex3,
        endIndex: endIndex3,
      },
    ];
    expect(links).toEqual(expect.arrayContaining(expectedDocLinks));
  });

  it("should ignore links without ?mdr-include=true or ?mdr-include=1", () => {
    const content = `
      [link1](./link1.md)
      [link2](./link2.md?mdr-include=false)
      [link3](./link3.md?something=else)
    `;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(0);
    expect(mockFileSystemService.resolvePath).not.toHaveBeenCalled();
  });

  it("should handle links with HTML entities like &amp;", () => {
    const linkText = "[encoded link](./path/to/file&amp;stuff.md?mdr-include=true)";
    const content = `Link: ${linkText}`;
    const decodedRelativeLink = "./path/to/file&stuff.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/path/to/file&stuff.md`;
    const startIndex = content.indexOf(linkText);
    const endIndex = startIndex + linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, decodedRelativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "encoded link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should return an empty array if no markdown links are found", () => {
    const content = "This document has no markdown links.";
    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);
    expect(links).toEqual([]);
    expect(mockFileSystemService.resolvePath).not.toHaveBeenCalled();
  });

  it("should handle path resolution errors gracefully (still extract valid links)", () => {
    const validLinkText = "[Valid Link](./valid.md?mdr-include=true)";
    const errorLinkText = "[Link Causing Resolution Error](./error-path.md?mdr-include=true)";
    const content = `
      ${validLinkText}
      ${errorLinkText}
    `;
    const validRelative = "./valid.md";
    const errorRelative = "./error-path.md";
    const validAbsolute = `${SOURCE_DIR}/valid.md`;
    const resolutionError = new Error("Cannot resolve path");

    mockFileSystemService.resolvePath.mockImplementation((base, rel) => {
      if (rel === validRelative) return `${base}/valid.md`;
      if (rel === errorRelative) throw resolutionError;
      throw new Error(`Unexpected path resolution call: base=${base}, rel=${rel}`);
    });

    const startIndexValid = content.indexOf(validLinkText);
    const endIndexValid = startIndexValid + validLinkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: validAbsolute,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Valid Link",
        startIndex: startIndexValid,
        endIndex: endIndexValid,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, validRelative);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, errorRelative);
  });

  it("should correctly resolve paths relative to the source document's directory", () => {
    const linkText = "[link](./relative/path/doc.md?mdr-include=true)";
    const content = linkText;
    const relativeLink = "./relative/path/doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/relative/path/doc.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should correctly resolve absolute paths starting with / relative to project root", () => {
    const linkText = "[link](/absolute/path/doc.md?mdr-include=true)";
    const content = linkText;
    const absoluteLinkPath = "/absolute/path/doc.md";
    const expectedResolvedPath = `/project/absolute/path/doc.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(
      mockFileSystemService.getProjectRoot(),
      absoluteLinkPath.substring(1)
    );
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedResolvedPath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ?mdr-include=true&mdr-inline=true", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ?mdr-include=1&mdr-inline=1", () => {
    const linkText = "[inline link](./inline.md?mdr-include=1&mdr-inline=1)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with specific lines range ?lines=45-100", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=45-100)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: { from: 45, to: 100 },
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range starting from 0 ?lines=-100", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=-100)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: { from: 0, to: 100 },
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range ending at 'end' ?lines=34-", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=34-)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: { from: 34, to: "end" },
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range ending at 'end' ?lines=34-end", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=34-end)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: { from: 34, to: "end" },
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines parameter if inline is not true", () => {
    const linkText = "[link](./doc.md?mdr-include=true&mdr-lines=10-20)";
    const content = linkText;
    const relativeLink = "./doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/doc.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore invalid lines format and log warning", () => {
    const linkText =
      "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=abc-def)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines range where start > end and log warning", () => {
    const linkText = "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=100-50)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines format with multiple hyphens and log warning", () => {
    const linkText =
      "[inline link](./inline.md?mdr-include=true&mdr-inline=true&mdr-lines=10-20-30)";
    const content = linkText;
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/inline.md`;
    const startIndex = 0;
    const endIndex = linkText.length;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
        startIndex: startIndex,
        endIndex: endIndex,
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a mix of inline and non-inline links", () => {
    const linkNormal1 = "[Normal Link](./normal.md?mdr-include=true)";
    const linkInline1 =
      "[Inline Link 1](./inline1.md?mdr-include=true&mdr-inline=true&mdr-lines=10-20)";
    const linkInline2 = "[Inline Link 2](./inline2.md?mdr-include=1&mdr-inline=1&mdr-lines=-5)";
    const linkIgnored = "[Ignored Link](./ignored.md)";
    const linkNormal2 = "[Normal Link 2](../normal2.md?mdr-include=1)";
    const linkInline3 = "[Inline Link 3](./inline3.md?mdr-include=1&mdr-inline=1&mdr-lines=50-)";

    const content = `
      ${linkNormal1}
      ${linkInline1}
      ${linkInline2}
      ${linkIgnored}
      ${linkNormal2}
      ${linkInline3}
    `;
    const relNormal = "./normal.md";
    const relInline1 = "./inline1.md";
    const relInline2 = "./inline2.md";
    const relNormal2 = "../normal2.md";
    const relInline3 = "./inline3.md";

    const absNormal = `${SOURCE_DIR}/normal.md`;
    const absInline1 = `${SOURCE_DIR}/inline1.md`;
    const absInline2 = `${SOURCE_DIR}/inline2.md`;
    const absNormal2 = `${SOURCE_DIR.substring(0, SOURCE_DIR.lastIndexOf("/"))}/normal2.md`;
    const absInline3 = `${SOURCE_DIR}/inline3.md`;

    const idxNormal1 = content.indexOf(linkNormal1);
    const idxInline1 = content.indexOf(linkInline1);
    const idxInline2 = content.indexOf(linkInline2);
    const idxNormal2 = content.indexOf(linkNormal2);
    const idxInline3 = content.indexOf(linkInline3);

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(5);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: absNormal,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link",
        startIndex: idxNormal1,
        endIndex: idxNormal1 + linkNormal1.length,
      },
      {
        filePath: absInline1,
        isInline: true,
        inlineLinesRange: { from: 10, to: 20 },
        anchorText: "Inline Link 1",
        startIndex: idxInline1,
        endIndex: idxInline1 + linkInline1.length,
      },
      {
        filePath: absInline2,
        isInline: true,
        inlineLinesRange: { from: 0, to: 5 },
        anchorText: "Inline Link 2",
        startIndex: idxInline2,
        endIndex: idxInline2 + linkInline2.length,
      },
      {
        filePath: absNormal2,
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link 2",
        startIndex: idxNormal2,
        endIndex: idxNormal2 + linkNormal2.length,
      },
      {
        filePath: absInline3,
        isInline: true,
        inlineLinesRange: { from: 50, to: "end" },
        anchorText: "Inline Link 3",
        startIndex: idxInline3,
        endIndex: idxInline3 + linkInline3.length,
      },
    ];
    expect(links).toEqual(expect.arrayContaining(expectedDocLinks));
    expect(links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: expect.stringContaining("ignored.md") }),
      ])
    );
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledTimes(5);
  });
});
