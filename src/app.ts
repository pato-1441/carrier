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

  if (path === "/" || path.startsWith("/analytics")) {
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
  return c.redirect("/analytics", 302);
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

app.get("/loads", (c) => {
  return respondToMissingLoadReference(c);
});

app.get("/loads/", (c) => {
  return respondToMissingLoadReference(c);
});

app.get("/loads/:referenceNumber", (c) => {
  return respondToLoadLookup(c, c.req.param("referenceNumber"));
});

app.post("/webhooks/agent-outcome", async (c) => {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch {
    c.set("analyticsEvent", {
      event_type: "agent_outcome",
      input: "invalid_json",
      normalized_input: "invalid_json",
      error: "Webhook body must be valid JSON.",
    });

    return c.json(
      {
        error: "Webhook body must be valid JSON.",
      },
      400
    );
  }

  if (!isRecord(payload)) {
    c.set("analyticsEvent", {
      event_type: "agent_outcome",
      input: "invalid_payload",
      normalized_input: "invalid_payload",
      error: "Webhook body must be a JSON object.",
    });

    return c.json(
      {
        error: "Webhook body must be a JSON object.",
      },
      400
    );
  }

  const rawClassification = payload.outcome_classification;
  const normalizedClassification = normalizeOutcomeClassification(rawClassification);

  if (!normalizedClassification) {
    c.set("analyticsEvent", {
      event_type: "agent_outcome",
      input: toOptionalString(rawClassification) ?? "missing_outcome_classification",
      normalized_input: "missing_outcome_classification",
      error: "outcome_classification is required.",
    });

    return c.json(
      {
        error: "outcome_classification is required.",
      },
      400
    );
  }

  const outcomeReasoning = toOptionalString(payload.outcome_reasoning);
  const carrierSentiment = normalizeCarrierSentiment(payload.carrier_sentiment);
  const declineReason = toOptionalString(payload.decline_reason);
  const callDurationMs = toOptionalNumber(payload.call_duration);
  const acceptedOfferValue = toOptionalNumber(payload.accepted_offer_value);
  const counterofferRetries = firstDefinedNumber(
    toOptionalNumber(payload.counteroffer_retries),
    toOptionalNumber(payload.counteroffers_retries)
  );

  c.set("analyticsEvent", {
    event_type: "agent_outcome",
    input: normalizedClassification,
    normalized_input: normalizedClassification,
    outcome_classification: normalizedClassification,
    outcome_reasoning: outcomeReasoning,
    carrier_sentiment: carrierSentiment,
    call_duration_ms: callDurationMs,
    accepted_offer_value: acceptedOfferValue,
    decline_reason: declineReason,
    counteroffer_retries: counterofferRetries,
  });

  return c.json(
    {
      ok: true,
      received: {
        outcome_classification: normalizedClassification,
        outcome_reasoning: outcomeReasoning ?? null,
        carrier_sentiment: carrierSentiment ?? null,
        call_duration_ms: callDurationMs,
        accepted_offer_value: acceptedOfferValue,
        decline_reason: declineReason ?? null,
        counteroffer_retries: counterofferRetries,
      },
    },
    202
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respondToMissingLoadReference(c: Context) {
  c.set("analyticsEvent", {
    event_type: "load_lookup",
    input: "",
    normalized_input: "",
    valid_format: false,
    error: "Reference number is required and must match the format ABC12345.",
  });

  return c.json(
    {
      input: "",
      valid_format: false,
      error: "Reference number is required and must match the format ABC12345.",
    },
    400
  );
}

function respondToLoadLookup(c: Context, input: string) {
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
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOutcomeClassification(value: unknown): string | undefined {
  const normalizedValue = toOptionalString(value);

  return normalizedValue ? normalizedValue.toLowerCase() : undefined;
}

function normalizeCarrierSentiment(value: unknown): string | undefined {
  const normalizedValue = toOptionalString(value);

  return normalizedValue ? normalizedValue.toLowerCase() : undefined;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function firstDefinedNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }

  return null;
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
