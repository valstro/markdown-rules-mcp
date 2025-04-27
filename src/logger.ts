import { config } from "./config.js";

const logLevel = config.LOG_LEVEL;

const logLevelMap = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = logLevelMap[logLevel];

export const logger = {
  log: (message: string) => {
    if (currentLogLevel <= logLevelMap.info) {
      console.error(`[MARKDOWN-RULES-INFO] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel <= logLevelMap.info) {
      console.error(`[MARKDOWN-RULES-INFO] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel <= logLevelMap.debug) {
      console.error(`[MARKDOWN-RULES-DEBUG] ${message}`);
    }
  },
  error: (message: string) => {
    if (currentLogLevel <= logLevelMap.error) {
      console.error(`[MARKDOWN-RULES-ERROR] ${message}`);
    }
  },
  warn: (message: string) => {
    if (currentLogLevel <= logLevelMap.warn) {
      console.error(`[MARKDOWN-RULES-WARN] ${message}`);
    }
  },
};
