type LogLevel = "INFO" | "WARN" | "ERROR";

type LogFields = Record<string, unknown>;

type RequestLogFields = {
  request_id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
};

type LogEntry = LogFields & {
  timestamp: string;
  level: LogLevel;
  message: string;
};

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
} as const;

const PRETTY_LOGS =
  process.env.LOG_FORMAT?.toLowerCase() !== "json" && process.env.NODE_ENV !== "production";

const COLOR_LOGS = PRETTY_LOGS && process.stdout.isTTY;

function colorize(value: string, color: keyof typeof ANSI): string {
  if (!COLOR_LOGS) {
    return value;
  }

  return `${ANSI[color]}${value}${ANSI.reset}`;
}

function formatTimestamp(timestamp: string): string {
  return timestamp.slice(11, 19);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatFieldValue(key: string, value: unknown): string {
  if (typeof value === "number" && key.endsWith("_ms")) {
    return `${formatNumber(value)}ms`;
  }

  if (typeof value === "number" && (key === "status" || key === "status_code")) {
    const status = String(value);

    if (value >= 500) {
      return colorize(status, "red");
    }

    if (value >= 400) {
      return colorize(status, "yellow");
    }

    return colorize(status, "green");
  }

  if (typeof value === "string" && key === "method") {
    return colorize(value, "cyan");
  }

  if (typeof value === "string") {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatPretty(entry: LogEntry): string {
  const { timestamp, level, message, ...fields } = entry;
  const details = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${colorize(key, "gray")}=${formatFieldValue(key, value)}`)
    .join(" ");

  return [
    colorize(formatTimestamp(timestamp), "dim"),
    colorize(level.padEnd(5, " "), level === "ERROR" ? "red" : level === "WARN" ? "yellow" : "blue"),
    message,
    details,
  ]
    .filter(Boolean)
    .join(" ");
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };

  const line = PRETTY_LOGS ? formatPretty(entry) : JSON.stringify(entry);

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function getRequestLevel(status: number): LogLevel {
  if (status >= 500) {
    return "ERROR";
  }

  if (status >= 400) {
    return "WARN";
  }

  return "INFO";
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    write("INFO", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write("WARN", message, fields);
  },
  error(message: string, fields?: LogFields): void {
    write("ERROR", message, fields);
  },
  request(fields: RequestLogFields): void {
    write(getRequestLevel(fields.status), `${fields.method} ${fields.path}`, fields);
  },
  serverStarted(port: number): void {
    write("INFO", `Server running on http://localhost:${port}`);
  },
};
