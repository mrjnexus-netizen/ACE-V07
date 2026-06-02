import pino from "pino";

const redactFields = [
  "req.headers.authorization",
  "body.password",
  "body.encrypted_value",
  "body.masterKey",
];

const logger = pino({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  redact: redactFields,
  timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`, // ISO 8601 timestamp
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    return { module: "api-server" }; // Default module source
  },
  ...(process.env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname", // Ignore default fields for cleaner output
      },
    },
  }),
});

export const createChildLogger = (moduleName: string) => {
  return logger.child({ module: moduleName });
};

export { logger };
