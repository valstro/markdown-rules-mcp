import type { Config } from "../../config";

export const createConfigMock = (partialConfig: Partial<Config>): Config => ({
  PROJECT_ROOT: "/project",
  MARKDOWN_INCLUDE: "**/*.md",
  MARKDOWN_EXCLUDE:
    "**/node_modules/**,**/build/**,**/dist/**,**/.git/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/out/**,**/.cache/**,**/tmp/**,**/temp/**",
  USAGE_INSTRUCTIONS_PATH: "markdown-rules.md",
  LOG_LEVEL: "error",
  HOIST_CONTEXT: true,
  ...partialConfig,
});
