import { Mocked, vi } from "vitest";

vi.mock("./logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

export function unwrapMock<T>(mock: Mocked<T>): T {
  return mock as unknown as T;
}
