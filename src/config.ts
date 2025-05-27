import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  MARKDOWN_GLOB_PATTERN: z.string().default("**/*.md"),
  LOG_LEVEL: z.enum(["silent", "debug", "info", "warn", "error"]).default("info"),
  HOIST_CONTEXT: z.boolean().default(true),
  USAGE_INSTRUCTIONS_PATH: z.string().optional(),
  PROJECT_ROOT: z.string().default(process.cwd()),
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
