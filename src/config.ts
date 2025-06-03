import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const DEFAULT_MARKDOWN_INCLUDE = "**/*.md";
const DEFAULT_MARKDOWN_EXCLUDE =
  "**/node_modules/**,**/build/**,**/dist/**,**/.git/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/out/**,**/.cache/**,**/tmp/**,**/temp/**";
const DEFAULT_LOG_LEVEL = "info" as const;
const DEFAULT_PROJECT_ROOT = process.cwd();
const DEFAULT_HOIST_CONTEXT = true;

const preprocessMarkdownPattern = (value: string, defaultValue: string) => {
  if (!value) return defaultValue;
  return value;
};

const preprocessLogLevel = (value: string) => {
  if (!value) return DEFAULT_LOG_LEVEL;
  return value;
};

const preprocessProjectRoot = (value: string) => {
  if (!value) return DEFAULT_PROJECT_ROOT;
  return value;
};

const preprocessHoistContext = (value: string | boolean) => {
  if (value === undefined || value === null) return DEFAULT_HOIST_CONTEXT;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowerValue = value.toLowerCase();
    if (lowerValue === "true" || lowerValue === "1") return true;
    if (lowerValue === "false" || lowerValue === "0") return false;
  }
  return DEFAULT_HOIST_CONTEXT;
};

const configSchema = z.object({
  MARKDOWN_INCLUDE: z
    .string()
    .transform((val) => preprocessMarkdownPattern(val, DEFAULT_MARKDOWN_INCLUDE))
    .default(DEFAULT_MARKDOWN_INCLUDE),
  MARKDOWN_EXCLUDE: z
    .string()
    .transform((val) => preprocessMarkdownPattern(val, DEFAULT_MARKDOWN_EXCLUDE))
    .default(DEFAULT_MARKDOWN_EXCLUDE),
  LOG_LEVEL: z
    .enum(["silent", "debug", "info", "warn", "error"])
    .transform(preprocessLogLevel)
    .default(DEFAULT_LOG_LEVEL),
  HOIST_CONTEXT: z
    .union([z.string(), z.boolean()])
    .transform(preprocessHoistContext)
    .default(DEFAULT_HOIST_CONTEXT),
  USAGE_INSTRUCTIONS_PATH: z.string().optional(),
  PROJECT_ROOT: z.string().transform(preprocessProjectRoot).default(DEFAULT_PROJECT_ROOT),
});

export type Config = z.infer<typeof configSchema>;

try {
  console.error("Starting, about to parse config");
  configSchema.parse(process.env);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  console.error(`Error parsing config: ${errorMessage}`);
  process.exit(1);
}

export const config = configSchema.parse(process.env);
console.error("Parsed config", config);
