import { vi, Mocked } from "vitest";
import { IFileSystemService } from "../../types.js";

export function createMockFileSystemService(): Mocked<IFileSystemService> {
  return {
    findFiles: vi.fn(),
    readFile: vi.fn(),
    resolvePath: vi.fn((...paths) => paths.join("/")), // Simple path join for tests
    getDirname: vi.fn((filePath) => filePath.substring(0, filePath.lastIndexOf("/"))),
    getProjectRoot: vi.fn(() => "/project"),
    pathExists: vi.fn(),
    getRelativePath: vi.fn((filePath) => filePath),
  };
}
