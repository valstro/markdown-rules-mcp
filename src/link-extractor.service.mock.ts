import { vi, Mocked } from "vitest";
import { ILinkExtractorService } from "./types.js";

export function createMockLinkExtractorService(): Mocked<ILinkExtractorService> {
  return {
    extractLinks: vi.fn().mockReturnValue([]), // Default to no links
  };
}
