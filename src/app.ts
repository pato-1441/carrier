import { Hono } from "hono";

import { lookupCarrierByDocketNumber } from "./lib/fmcsa.js";
import { buildLoadFromReference } from "./lib/load-generator.js";
import {
  isValidLoadReference,
  isValidMcNumberFormat,
  normalizeLoadReference,
  normalizeMcNumber,
  toDocketNumber,
} from "./lib/validation.js";
import type { McValidationResult } from "./types.js";

export const app = new Hono();

app.use("*", async (c, next) => {
  const requiredApiKey = process.env.API_KEY;
  const apiKey = c.req.header("x-api-key");

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
    },
  });
});

app.get("/mc/:mcNumber/validate", async (c) => {
  const input = c.req.param("mcNumber");
  const normalizedMcNumber = normalizeMcNumber(input);

  if (!isValidMcNumberFormat(normalizedMcNumber)) {
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

    return c.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected FMCSA lookup error.";

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

  return c.json(buildLoadFromReference(normalizedReference));
});
