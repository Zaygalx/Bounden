import { redactString, redactToJson } from "./redact.js";

/**
 * Minimal structured logger. Every message and context object is passed
 * through the redactor — there is no code path that logs raw input.
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function emit(level: string, message: string, context?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const ctx = context ? ` ${redactToJson(context)}` : "";
  const line = `${ts} [bounden-worker] ${level} ${redactString(message)}${ctx}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const consoleLogger: Logger = {
  info: (m, c) => emit("info", m, c),
  warn: (m, c) => emit("warn", m, c),
  error: (m, c) => emit("error", m, c),
};

/** Test logger: captures redacted lines so tests can assert on them. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  info(message: string, context?: Record<string, unknown>): void {
    this.lines.push(`info ${redactString(message)} ${context ? redactToJson(context) : ""}`);
  }
  warn(message: string, context?: Record<string, unknown>): void {
    this.lines.push(`warn ${redactString(message)} ${context ? redactToJson(context) : ""}`);
  }
  error(message: string, context?: Record<string, unknown>): void {
    this.lines.push(`error ${redactString(message)} ${context ? redactToJson(context) : ""}`);
  }
  text(): string {
    return this.lines.join("\n");
  }
}
