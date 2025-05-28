import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  MARKDOWN_INCLUDE: z.string().default("**/*.md"),
  MARKDOWN_EXCLUDE: z
    .string()
    .default(
      "**/node_modules/**,**/build/**,**/dist/**,**/.git/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/out/**,**/.cache/**,**/tmp/**,**/temp/**"
    ),
  LOG_LEVEL: z.enum(["silent", "debug", "info", "warn", "error"]).default("info"),
  HOIST_CONTEXT: z.boolean().default(true),
  USAGE_INSTRUCTIONS_PATH: z.string().optional(),
  PROJECT_ROOT: z.string().default(process.cwd()),
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
