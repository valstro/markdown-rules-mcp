import { vi, Mocked } from "vitest";
import { IDocParserService } from "../../types.js";

export function createMockDocParserService(): Mocked<IDocParserService> {
  return {
    parse: vi.fn(),
    getBlankDoc: vi.fn(),
    isMarkdown: vi.fn((fileName) => fileName.toLowerCase().endsWith(".md")),
  };
}
