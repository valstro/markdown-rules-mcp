import type { Config } from "../../config";

export const createConfigMock = (partialConfig: Partial<Config>): Config => ({
  PROJECT_ROOT: "/project",
  MARKDOWN_GLOB_PATTERN: "**/*.md",
  LOG_LEVEL: "error",
  HOIST_CONTEXT: true,
  ...partialConfig,
});
