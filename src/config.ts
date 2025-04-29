import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  MARKDOWN_GLOB_PATTERN: z.string().default("**/*.md"),
  PROJECT_ROOT: z.string().default(process.cwd()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  HOIST_ORDER: z.enum(["pre", "post"]).default("post"), // 'post' = dependencies first (hoist top)
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
