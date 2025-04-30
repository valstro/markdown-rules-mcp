import { vi, Mocked } from "vitest";
import { IDocFormatterService } from "./types.js";

export const createMockDocFormatterService = (): Mocked<IDocFormatterService> => ({
  formatContextOutput: vi.fn(),
  formatDoc: vi.fn(),
});
