import { vi, Mocked } from "vitest";
import { IDocIndexService, Doc } from "./types.js";

export function createMockDocIndexService(): Mocked<IDocIndexService> {
  return {
    getDoc: vi.fn(),
    buildIndex: vi.fn(),
    loadInitialDocs: vi.fn(),
    recursivelyResolveAndLoadLinks: vi.fn(),
    getDocs: vi.fn(),
    getAgentAttachableDocs: vi.fn(),
    getDocMap: vi.fn(() => new Map()),
    docs: [],
  };
}

export function createMockDoc(filePath: string, options: Partial<Doc> = {}): Doc {
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

/*

function createMockDoc(filePath: string, options: Partial<Doc> = {}): Doc {
  const {
    content = "",
    linksTo = [],
    isMarkdown = true,
    isError = false,
    errorReason,
    meta = { description: undefined, globs: [], alwaysApply: false },
  } = options;
  return {
    filePath,
    content,
    linksTo,
    isMarkdown,
    isError,
    errorReason: errorReason !== undefined ? errorReason : isError ? "Mock Error" : undefined,
    contentLinesBeforeParsed: content.split("\n").length,
    meta,
  };
}
  */
