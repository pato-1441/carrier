import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { Hono, type Context } from "hono";

import {
  appendAnalyticsEvent,
  getAnalyticsDashboardData,
  isAnalyticsRange,
} from "./lib/analytics.js";
import { lookupCarrierByDocketNumber } from "./lib/fmcsa.js";
import { buildLoadFromReference } from "./lib/load-generator.js";
import {
  isValidLoadReference,
  isValidMcNumberFormat,
  normalizeLoadReference,
  normalizeMcNumber,
  toDocketNumber,
} from "./lib/validation.js";
import { logger } from "./lib/logger.js";
import type { AnalyticsEvent, McValidationResult } from "./types.js";

type AppVariables = {
  requestId: string;
  analyticsEvent?: Omit<
    AnalyticsEvent,
    "request_id" | "timestamp" | "method" | "path" | "status_code" | "duration_ms"
  >;
};

export const app = new Hono<{ Variables: AppVariables }>();

const CLIENT_DIST_DIRECTORY = resolve(process.cwd(), "dist/client");

app.use("*", async (c, next) => {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID();
  const { method } = c.req;
  const url = new URL(c.req.url);

  c.set("requestId", requestId);
  c.header("x-request-id", requestId);

  try {
    await next();
  } finally {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const analyticsEvent = c.get("analyticsEvent");

    if (analyticsEvent) {
      try {
        await appendAnalyticsEvent({
          request_id: requestId,
          timestamp: new Date().toISOString(),
          method,
          path: url.pathname,
          status_code: c.res.status,
          duration_ms: durationMs,
          ...analyticsEvent,
        });
      } catch (error) {
        logger.error("Failed to persist analytics event.", {
          request_id: requestId,
          error: error instanceof Error ? error.message : "Unknown analytics error.",
        });
      }
    }

    logger.request({
      request_id: requestId,
      method,
      path: url.pathname,
      status: c.res.status,
      duration_ms: durationMs,
    });
  }
});

app.use("*", async (c, next) => {
  const requiredApiKey = process.env.API_KEY;
  const apiKey = c.req.header("x-api-key");
  const path = new URL(c.req.url).pathname;

  if (path.startsWith("/analytics")) {
    await next();
    return;
  }

  if (!requiredApiKey || apiKey !== requiredApiKey) {
    return c.json(
      {
        error: "Unauthorized",
      },
      401
    );
  }

  await next();
});

app.get("/", (c) => {
  return c.json({
    service: "carrier-happyrobot-api",
    endpoints: {
      validate_mc_number: "GET /mc/:mcNumber/validate",
      search_load_by_reference: "GET /loads/:referenceNumber",
      analytics_dashboard: "GET /analytics",
      analytics_data: "GET /analytics/data?range=24h",
    },
  });
});

app.get("/analytics", async (c) => {
  return serveAnalyticsFrontend(c, "index.html");
});

app.get("/analytics/assets/*", async (c) => {
  const relativePath = c.req.path.replace("/analytics/", "");

  return serveAnalyticsFrontend(c, relativePath);
});

app.get("/analytics/data", async (c) => {
  const requestedRange = c.req.query("range");
  const range = requestedRange && isAnalyticsRange(requestedRange) ? requestedRange : "24h";
  const data = await getAnalyticsDashboardData(range);

  return c.json(data);
});

app.get("/mc/:mcNumber/validate", async (c) => {
  const input = c.req.param("mcNumber");
  const normalizedMcNumber = normalizeMcNumber(input);

  if (!isValidMcNumberFormat(normalizedMcNumber)) {
    c.set("analyticsEvent", {
      event_type: "mc_validation",
      input,
      normalized_input: normalizedMcNumber,
      valid_format: false,
      error: "MC number must match the format MC followed by 1 to 8 digits.",
    });

    return c.json(
      {
        input,
        normalized_mc_number: normalizedMcNumber,
        valid_format: false,
        error: "MC number must match the format MC followed by 1 to 8 digits.",
      },
      400
    );
  }

  const docketNumber = toDocketNumber(normalizedMcNumber);

  try {
    const carrier = await lookupCarrierByDocketNumber(docketNumber);
    const payload: McValidationResult = {
      input,
      normalized_mc_number: normalizedMcNumber,
      docket_number: docketNumber,
      valid_format: true,
      found: carrier !== null,
      carrier,
    };

    c.set("analyticsEvent", {
      event_type: "mc_validation",
      input,
      normalized_input: normalizedMcNumber,
      docket_number: docketNumber,
      valid_format: true,
      found: carrier !== null,
    });

    return c.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected FMCSA lookup error.";

    c.set("analyticsEvent", {
      event_type: "mc_validation",
      input,
      normalized_input: normalizedMcNumber,
      docket_number: docketNumber,
      valid_format: true,
      found: false,
      error: message,
    });

    return c.json(
      {
        input,
        normalized_mc_number: normalizedMcNumber,
        docket_number: docketNumber,
        valid_format: true,
        found: false,
        error: message,
      },
      502
    );
  }
});

app.get("/loads/:referenceNumber", (c) => {
  const input = c.req.param("referenceNumber");
  const normalizedReference = normalizeLoadReference(input);

  if (!isValidLoadReference(normalizedReference)) {
    c.set("analyticsEvent", {
      event_type: "load_lookup",
      input,
      normalized_input: normalizedReference,
      valid_format: false,
      error:
        "Reference number must match the format ABC12345 (3 letters followed by 5 digits).",
    });

    return c.json(
      {
        input,
        valid_format: false,
        error:
          "Reference number must match the format ABC12345 (3 letters followed by 5 digits).",
      },
      400
    );
  }

  const load = buildLoadFromReference(normalizedReference);

  c.set("analyticsEvent", {
    event_type: "load_lookup",
    input,
    normalized_input: normalizedReference,
    valid_format: true,
    load_id: load.load_id,
  });

  return c.json(load);
});

async function serveAnalyticsFrontend(c: Context, relativePath: string) {
  try {
    const filePath = resolve(CLIENT_DIST_DIRECTORY, relativePath);
    const content = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    return new Response(content, {
      headers: {
        "content-type": mimeType,
      },
    });
  } catch {
    if (relativePath === "index.html") {
      return c.html(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HappyRobot Analytics</title>
  </head>
  <body style="font-family: Inter, sans-serif; padding: 2rem; color: #18181b;">
    <h1 style="font-size: 1.5rem; margin-bottom: 0.75rem;">HappyRobot Analytics</h1>
    <p style="margin-bottom: 0.5rem;">The React dashboard has not been built yet.</p>
    <p>Run <code>pnpm run build</code> or <code>pnpm run dev</code> before opening <code>/analytics</code>.</p>
  </body>
</html>`);
    }

    return c.notFound();
  }
}

function getMimeType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
