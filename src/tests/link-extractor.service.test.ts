import { describe, it, expect, vi, beforeEach, Mocked } from "vitest";
import { LinkExtractorService } from "../link-extractor.service.js";
import { IFileSystemService, DocLink } from "../types.js";
import { unwrapMock } from "../../setup.tests.js";
import { createMockFileSystemService } from "./__mocks__/file-system.service.mock.js";

vi.mock("./file-system.service.js");
describe("LinkExtractorService", () => {
  let mockFileSystemService: Mocked<IFileSystemService>;
  let linkExtractorService: LinkExtractorService;

  const DOC_FILE_PATH = "/path/to/source/doc.md";
  const SOURCE_DIR = "/path/to/source";

  beforeEach(() => {
    vi.resetAllMocks();

    mockFileSystemService = createMockFileSystemService();

    mockFileSystemService.getDirname.mockReturnValue(SOURCE_DIR);
    mockFileSystemService.resolvePath.mockImplementation((base, rel) => `${base}/${rel}`);
    linkExtractorService = new LinkExtractorService(unwrapMock(mockFileSystemService));
  });

  it("should be defined", () => {
    expect(linkExtractorService).toBeDefined();
  });

  it("should extract a single markdown link with ?md-link=true", () => {
    const content = "Some text [link text](./relative/link.md?md-link=true) more text.";
    const relativeLink = "./relative/link.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./relative/link.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link text",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a single markdown link with ?md-link=1", () => {
    const content = "Some text [link text](./relative/link.md?md-link=1) more text.";
    const relativeLink = "./relative/link.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./relative/link.md?md-link=1",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link text",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract multiple markdown links with ?md-link=true and ?md-link=1", () => {
    const content = `
      First link: [link1](../link1.md?md-link=true)
      Second link: [link2](./folder/link2.md?md-link=true&other=param)
      Third link: [link3](./folder/link3.md?md-link=1&other=param)
      Some other text.
    `;
    const relativeLink1 = "../link1.md";
    const relativeLink2 = "./folder/link2.md";
    const relativeLink3 = "./folder/link3.md";
    const expectedAbsolutePath1 = `${SOURCE_DIR}/${relativeLink1}`;
    const expectedAbsolutePath2 = `${SOURCE_DIR}/${relativeLink2}`;
    const expectedAbsolutePath3 = `${SOURCE_DIR}/${relativeLink3}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink1);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink2);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink3);
    expect(links).toHaveLength(3);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath1,
        rawLinkTarget: "../link1.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link1",
      },
      {
        filePath: expectedAbsolutePath2,
        rawLinkTarget: "./folder/link2.md?md-link=true&other=param",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link2",
      },
      {
        filePath: expectedAbsolutePath3,
        rawLinkTarget: "./folder/link3.md?md-link=1&other=param",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link3",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore links without ?md-link=true or ?md-link=1", () => {
    const content = `
      [link1](./link1.md)
      [link2](./link2.md?md-link=false)
      [link3](./link3.md?something=else)
    `;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(0);
    expect(mockFileSystemService.resolvePath).not.toHaveBeenCalled();
  });

  it("should handle links with HTML entities like &amp;", () => {
    const content = "Link: [encoded link](./path/to/file&amp;stuff.md?md-link=true)";
    const decodedRelativeLink = "./path/to/file&stuff.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${decodedRelativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, decodedRelativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./path/to/file&amp;stuff.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "encoded link",
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

  it("should handle path resolution errors gracefully", () => {
    const content = `
      [Valid Link](./valid.md?md-link=true)
      [Link Causing Resolution Error](./error-path.md?md-link=true)
    `;
    const validRelative = "./valid.md";
    const errorRelative = "./error-path.md";
    const validAbsolute = `${SOURCE_DIR}/${validRelative}`;
    const resolutionError = new Error("Cannot resolve path");

    mockFileSystemService.resolvePath.mockImplementation((base, rel) => {
      if (rel === validRelative) return `${base}/${rel}`;
      if (rel === errorRelative) throw resolutionError;
      throw new Error(`Unexpected path resolution call: ${base}, ${rel}`);
    });

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: validAbsolute,
        rawLinkTarget: "./valid.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Valid Link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, validRelative);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, errorRelative);
  });

  it("should correctly resolve paths relative to the source document's directory", () => {
    const content = "[link](./relative/path/doc.md?md-link=true)";
    const relativeLink = "./relative/path/doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./relative/path/doc.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should correctly resolve absolute paths relative to the source document's directory (using resolvePath)", () => {
    const content = "[link](/absolute/path/doc.md?md-link=true)";
    const absoluteLinkPath = "/absolute/path/doc.md";
    const expectedResolvedPath = `${SOURCE_DIR}/${absoluteLinkPath}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.getDirname).toHaveBeenCalledWith(DOC_FILE_PATH);
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, absoluteLinkPath);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedResolvedPath,
        rawLinkTarget: "/absolute/path/doc.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ?md-link=true&md-embed=true", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=true)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=true",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ?md-link=1&md-embed=1", () => {
    const content = "[inline link](./inline.md?md-link=1&md-embed=1)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=1&md-embed=1",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with specific lines range ?lines=45-100", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=45-100)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=45-100",
        isInline: true,
        inlineLinesRange: { from: 45, to: 100 },
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range starting from 0 ?lines=-100", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=-100)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=-100",
        isInline: true,
        inlineLinesRange: { from: 0, to: 100 },
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range ending at 'end' ?lines=34-", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=34-)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=34-",
        isInline: true,
        inlineLinesRange: { from: 34, to: "end" },
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with lines range ending at 'end' ?lines=34-end", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=34-end)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=34-end",
        isInline: true,
        inlineLinesRange: { from: 34, to: "end" },
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines parameter if inline is not true", () => {
    const content = "[link](./doc.md?md-link=true&mdr-lines=10-20)";
    const relativeLink = "./doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./doc.md?md-link=true&mdr-lines=10-20",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore invalid lines format and log warning", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=abc-def)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=abc-def",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines range where start > end and log warning", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=100-50)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=100-50",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines format with multiple hyphens and log warning", () => {
    const content = "[inline link](./inline.md?md-link=true&md-embed=10-20-30)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-link=true&md-embed=10-20-30",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a mix of inline and non-inline links", () => {
    const content = `
      [Normal Link](./normal.md?md-link=true)
      [Inline Link 1](./inline1.md?md-link=true&md-embed=10-20)
      [Inline Link 2](./inline2.md?md-link=1&md-embed=-5)
      [Ignored Link](./ignored.md)
      [Normal Link 2](../normal2.md?md-link=1)
      [Inline Link 3](./inline3.md?md-link=1&md-embed=50-)
    `;
    const relNormal = "./normal.md";
    const relInline1 = "./inline1.md";
    const relInline2 = "./inline2.md";
    const relNormal2 = "../normal2.md";
    const relInline3 = "./inline3.md";

    const absNormal = `${SOURCE_DIR}/${relNormal}`;
    const absInline1 = `${SOURCE_DIR}/${relInline1}`;
    const absInline2 = `${SOURCE_DIR}/${relInline2}`;
    const absNormal2 = `${SOURCE_DIR}/${relNormal2}`;
    const absInline3 = `${SOURCE_DIR}/${relInline3}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(5);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: absNormal,
        rawLinkTarget: "./normal.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link",
      },
      {
        filePath: absInline1,
        rawLinkTarget: "./inline1.md?md-link=true&md-embed=10-20",
        isInline: true,
        inlineLinesRange: { from: 10, to: 20 },
        anchorText: "Inline Link 1",
      },
      {
        filePath: absInline2,
        rawLinkTarget: "./inline2.md?md-link=1&md-embed=-5",
        isInline: true,
        inlineLinesRange: { from: 0, to: 5 },
        anchorText: "Inline Link 2",
      },
      {
        filePath: absNormal2,
        rawLinkTarget: "../normal2.md?md-link=1",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link 2",
      },
      {
        filePath: absInline3,
        rawLinkTarget: "./inline3.md?md-link=1&md-embed=50-",
        isInline: true,
        inlineLinesRange: { from: 50, to: "end" },
        anchorText: "Inline Link 3",
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

  it("should ignore links without ?md-link=true/1 or ?md-embed!=false", () => {
    const content = `
      [link1](./link1.md)
      [link2](./link2.md?md-link=false)
      [link3](./link3.md?something=else)
      [link4](./link4.md?md-embed=false)
    `;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(0);
    expect(mockFileSystemService.resolvePath).not.toHaveBeenCalled();
  });

  it("should extract an inline link with ONLY ?md-embed=true", () => {
    const content = "[inline link](./inline.md?md-embed=true)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=true",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ONLY ?md-embed=1", () => {
    const content = "[inline link](./inline.md?md-embed=1)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=1",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract an inline link with ONLY ?md-embed=<range>", () => {
    const content = "[inline link range](./inline.md?md-embed=10-20)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=10-20",
        isInline: true,
        inlineLinesRange: { from: 10, to: 20 },
        anchorText: "inline link range",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a non-inline link when ?md-link=true and ?md-embed=false", () => {
    const content = "[link](./doc.md?md-link=true&md-embed=false)";
    const relativeLink = "./doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./doc.md?md-link=true&md-embed=false",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines parameter if inline is false (md-link=true, md-embed=false)", () => {
    const content = "[link](./doc.md?md-link=true&md-embed=false&lines=10-20)";
    const relativeLink = "./doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./doc.md?md-link=true&md-embed=false&lines=10-20",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines parameter if inline is not requested (only md-link=true)", () => {
    const content = "[link](./doc.md?md-link=true)";
    const relativeLink = "./doc.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./doc.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore invalid lines format and log warning, embedding whole file (implicit link)", () => {
    const content = "[inline link](./inline.md?md-embed=abc-def)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=abc-def",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines range where start > end and log warning, embedding whole file (implicit link)", () => {
    const content = "[inline link](./inline.md?md-embed=100-50)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=100-50",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should ignore lines format with multiple hyphens and log warning, embedding whole file (implicit link)", () => {
    const content = "[inline link](./inline.md?md-embed=10-20-30)";
    const relativeLink = "./inline.md";
    const expectedAbsolutePath = `${SOURCE_DIR}/${relativeLink}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(mockFileSystemService.resolvePath).toHaveBeenCalledWith(SOURCE_DIR, relativeLink);
    expect(links).toHaveLength(1);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: expectedAbsolutePath,
        rawLinkTarget: "./inline.md?md-embed=10-20-30",
        isInline: true,
        inlineLinesRange: undefined,
        anchorText: "inline link",
      },
    ];
    expect(links).toEqual(expectedDocLinks);
  });

  it("should extract a mix of inline and non-inline links with implicit linking", () => {
    const content = `
      [Normal Link](./normal.md?md-link=true)
      [Inline Link 1](./inline1.md?md-embed=10-20)
      [Inline Link 2](./inline2.md?md-link=1&md-embed=-5)
      [Ignored Link](./ignored.md)
      [Normal Link 2](../normal2.md?md-link=1)
      [Inline Link 3](./inline3.md?md-embed=50-)
      [Ignored Link 2](./ignored2.md?md-embed=false)
    `;
    const relNormal = "./normal.md";
    const relInline1 = "./inline1.md";
    const relInline2 = "./inline2.md";
    const relNormal2 = "../normal2.md";
    const relInline3 = "./inline3.md";

    const absNormal = `${SOURCE_DIR}/${relNormal}`;
    const absInline1 = `${SOURCE_DIR}/${relInline1}`;
    const absInline2 = `${SOURCE_DIR}/${relInline2}`;
    const absNormal2 = `${SOURCE_DIR}/${relNormal2}`;
    const absInline3 = `${SOURCE_DIR}/${relInline3}`;

    const links = linkExtractorService.extractLinks(DOC_FILE_PATH, content);

    expect(links).toHaveLength(5);
    const expectedDocLinks: DocLink[] = [
      {
        filePath: absNormal,
        rawLinkTarget: "./normal.md?md-link=true",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link",
      },
      {
        filePath: absInline1,
        rawLinkTarget: "./inline1.md?md-embed=10-20",
        isInline: true,
        inlineLinesRange: { from: 10, to: 20 },
        anchorText: "Inline Link 1",
      },
      {
        filePath: absInline2,
        rawLinkTarget: "./inline2.md?md-link=1&md-embed=-5",
        isInline: true,
        inlineLinesRange: { from: 0, to: 5 },
        anchorText: "Inline Link 2",
      },
      {
        filePath: absNormal2,
        rawLinkTarget: "../normal2.md?md-link=1",
        isInline: false,
        inlineLinesRange: undefined,
        anchorText: "Normal Link 2",
      },
      {
        filePath: absInline3,
        rawLinkTarget: "./inline3.md?md-embed=50-",
        isInline: true,
        inlineLinesRange: { from: 50, to: "end" },
        anchorText: "Inline Link 3",
      },
    ];
    expect(links).toEqual(expect.arrayContaining(expectedDocLinks));
    expect(links).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: expect.stringContaining("ignored.md") }),
        expect.objectContaining({ filePath: expect.stringContaining("ignored2.md") }),
      ])
    );
    expect(mockFileSystemService.resolvePath).toHaveBeenCalledTimes(5);
  });
});
