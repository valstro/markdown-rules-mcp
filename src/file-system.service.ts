import { glob } from "glob";
import fs from "fs/promises";
import path from "path";
import { Config } from "./config.js";
import { IFileSystemService } from "./types.js";
import { logger } from "./logger.js";

/**
 * Manages the file system operations.
 *
 * @remarks
 * This service is responsible for finding all markdown files in the project based on the glob pattern,
 * and reading the files and returning their content.
 * It also resolves relative paths to absolute paths among other path related operations.
 *
 * @example
 * ```typescript
 * const fileSystem = new FileSystemService(config);
 * const files = await fileSystem.findFiles();
 * ```
 */
export class FileSystemService implements IFileSystemService {
  constructor(private config: Config) {}

  /**
   * Find all files matching the glob pattern in the project root
   * @returns absolute paths to all files matching the pattern
   */
  findFiles(): Promise<string[]> {
    return glob(this.config.MARKDOWN_GLOB_PATTERN, {
      cwd: this.config.PROJECT_ROOT,
      absolute: true,
    });
  }

  /**
   * Read a file and return its content
   * @param path - The path to the file to read
   * @returns The content of the file
   */
  readFile(path: string): Promise<string> {
    return fs.readFile(path, "utf-8");
  }

  /**
   * Check if a path exists (file or directory).
   * @param path - The path to check.
   * @returns True if the path exists, false otherwise.
   */
  async pathExists(pathToCheck: string): Promise<boolean> {
    try {
      await fs.access(pathToCheck);
      return true;
    } catch (error: any) {
      // Specifically check for ENOENT (Error NO ENTry)
      if (error.code === "ENOENT") {
        return false;
      }
      // Log other unexpected errors but still return false as access failed
      logger.error(`Error checking path existence for "${pathToCheck}": ${error.message}`);
      return false;
    }
  }

  /**
   * Resolve a relative or absolute path to an absolute path
   * @param relativeOrAbsolutePath - The path to resolve
   * @returns The absolute path
   */
  resolvePath(...paths: string[]): string {
    return path.resolve(...paths);
  }

  /**
   * Get the directory name of a file path
   * @param relativeOrAbsolutePath - The path to get the directory name of
   * @returns The absolute directory name of the file path
   */
  getDirname(relativeOrAbsolutePath: string): string {
    return path.dirname(relativeOrAbsolutePath);
  }

  /**
   * Get the project root
   * @returns The project root
   */
  getProjectRoot(): string {
    return this.config.PROJECT_ROOT;
  }
}
