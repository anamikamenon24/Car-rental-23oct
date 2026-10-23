// Structured JSON logger: one line per event on stdout/stderr, ready for Vercel log drains.
// Never log secrets: keys that look sensitive are redacted.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|signature|card|pan|cvc|api[_-]?key/i;

function minLevel(): number {
  const env = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "warn" : "info")) as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: (value as { code?: unknown }).code,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
      cause: value.cause && depth < 3 ? sanitize(value.cause, depth + 1) : undefined,
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return depth > 4 ? "[array]" : value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 4) return "[object]";
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : sanitize(v, depth + 1)]),
    );
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function createLogger(base: Record<string, unknown>): Logger {
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[level] < minLevel()) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg,
      ...(sanitize({ ...base, ...fields }) as Record<string, unknown>),
    });
    if (level === "error" || level === "warn") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const log = createLogger({ service: "driveeasy" });
