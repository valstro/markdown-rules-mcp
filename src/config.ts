import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  MARKDOWN_GLOB_PATTERN: z.string().default("**/*.md"),
  PROJECT_ROOT: z.string().default(process.cwd()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  CONTEXT_SORT_ORDER: z
    .enum(["topological", "reverse-topological"])
    .default("topological")
    .describe(
      "The sort order for the context. 'topological' = an item appears AFTER items it depends on. 'reverse-topological' = an item appears BEFORE items it depends on."
    ),
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
