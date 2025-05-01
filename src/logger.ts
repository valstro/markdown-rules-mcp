import { config } from "./config.js";

const logLevel = config.LOG_LEVEL;

const logLevelMap = {
  silent: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const currentLogLevel = logLevelMap[logLevel];

export const logger = {
  log: (message: string) => {
    if (currentLogLevel <= logLevelMap.info) {
      console.error(`[MD-INFO] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel <= logLevelMap.info) {
      console.error(`[MD-INFO] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel <= logLevelMap.debug) {
      console.error(`[MD-DEBUG] ${message}`);
    }
  },
  error: (message: string) => {
    if (currentLogLevel <= logLevelMap.error) {
      console.error(`[MD-ERROR] ${message}`);
    }
  },
  warn: (message: string) => {
    if (currentLogLevel <= logLevelMap.warn) {
      console.error(`[MD-WARN] ${message}`);
    }
  },
};
