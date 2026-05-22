import { after, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { app } from "../src/app.js";
import type { AnalyticsEvent } from "../src/types.js";

const AUTH_HEADERS = {
  "x-api-key": "duckyapikeyhappyrobot21may",
};
const analyticsDirectory = mkdtempSync(join(tmpdir(), "carrier-happyrobot-"));
const analyticsFilePath = join(analyticsDirectory, "request-analytics.json");

process.env.ANALYTICS_FILE_PATH = analyticsFilePath;

beforeEach(async () => {
  await writeFile(analyticsFilePath, "[]");
});

after(async () => {
  await rm(analyticsDirectory, { recursive: true, force: true });
});

describe("API key protection", () => {
  it("redirects the home page to /analytics without an API key", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/");

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/analytics");
    assert.ok(response.headers.get("x-request-id"));
  });

  it("allows the analytics dashboard without an API key", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/analytics");

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await response.text(), /HappyRobot Analytics/);
  });
});

describe("GET /analytics/data", () => {
  it("returns dashboard aggregates from the local analytics file", async () => {
    const events: AnalyticsEvent[] = [
      {
        request_id: "req_ok",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/loads/ABC12345",
        status_code: 200,
        duration_ms: 120,
        event_type: "load_lookup",
        input: "ABC12345",
        normalized_input: "ABC12345",
        valid_format: true,
        load_id: "ABC12345",
      },
      {
        request_id: "req_err",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/mc/MC123456/validate",
        status_code: 502,
        duration_ms: 680,
        event_type: "mc_validation",
        input: "MC123456",
        normalized_input: "MC123456",
        valid_format: true,
        found: false,
        docket_number: "123456",
        error: "FMCSA unavailable",
      },
      {
        request_id: "req_webhook",
        timestamp: new Date().toISOString(),
        method: "POST",
        path: "/webhooks/agent-outcome",
        status_code: 202,
        duration_ms: 18,
        event_type: "agent_outcome",
        input: "success",
        normalized_input: "success",
        outcome_classification: "success",
        carrier_sentiment: "positive",
        call_duration_ms: 74905,
        accepted_offer_value: 12300,
        counteroffer_retries: 2,
      },
    ];

    await writeFile(analyticsFilePath, JSON.stringify(events, null, 2));

    const response = await app.request("/analytics/data?range=24h");

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;
    const totals = body.totals as Record<string, unknown>;
    const endpoints = body.endpoints as Array<Record<string, unknown>>;
    const outcomeBreakdown = body.outcome_breakdown as Array<Record<string, unknown>>;
    const carrierSentiments = body.carrier_sentiments as Array<Record<string, unknown>>;
    const trend = body.trend as Array<Record<string, unknown>>;

    assert.equal(totals.total_requests, 3);
    assert.equal(totals.error_5xx, 1);
    assert.equal(totals.total_agent_outcomes, 1);
    assert.equal(totals.total_carrier_sentiments, 1);
    assert.equal(totals.total_accepted_offer_value, 12300);
    assert.equal(endpoints.length, 3);
    assert.equal(endpoints[0]?.endpoint, "/loads/:referenceNumber");
    assert.equal(outcomeBreakdown[0]?.classification, "success");
    assert.equal(carrierSentiments[0]?.sentiment, "positive");
    assert.equal(trend.some((point) => point.agent_outcomes === 1), true);
  });
});

describe("GET /loads/:referenceNumber", () => {
  it("returns a deterministic load for a valid reference number", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/loads/ABC12345", {
      headers: AUTH_HEADERS,
    });

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(body).sort(), [
      "commodity_type",
      "delivery_datetime",
      "destination",
      "equipment_type",
      "load_id",
      "loadboard_rate",
      "notes",
      "origin",
      "pickup_datetime",
      "weight",
    ]);
    assert.equal(body.load_id, "ABC12345");
    assert.ok(response.headers.get("x-request-id"));

    const events = JSON.parse(
      await readFile(analyticsFilePath, "utf8")
    ) as AnalyticsEvent[];
    const [event] = events;

    assert.equal(events.length, 1);
    assert.equal(event.event_type, "load_lookup");
    assert.equal(event.input, "ABC12345");
    assert.equal(event.load_id, "ABC12345");
    assert.equal(event.status_code, 200);
    assert.equal(event.valid_format, true);
  });

  it("normalizes hyphenated reference numbers before lookup", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/loads/abc-12345", {
      headers: AUTH_HEADERS,
    });

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.load_id, "ABC12345");
  });

  it("rejects an invalid reference number format", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/loads/AB12345", {
      headers: AUTH_HEADERS,
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.valid_format, false);
  });

  it("rejects a missing reference number with a helpful 400 response", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/loads/", {
      headers: AUTH_HEADERS,
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.valid_format, false);
    assert.equal(body.error, "Reference number is required and must match the format ABC12345.");
  });
});

describe("GET /mc/:mcNumber/validate", () => {
  it("rejects invalid MC formats before calling FMCSA", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("fetch should not be called for invalid MC input");
    });

    const response = await app.request("/mc/ABC123/validate", {
      headers: AUTH_HEADERS,
    });

    fetchMock.mock.restore();

    assert.equal(response.status, 400);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.valid_format, false);
  });

  it("returns carrier data when FMCSA finds a match", async () => {
    process.env.FMCSA_WEB_KEY = "test-key";
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const restoreFetch = mock.method(globalThis, "fetch", async () => {
      return new Response(
        JSON.stringify({
          content: [
            {
              allowToOperate: "Y",
              outOfService: "N",
              dotNumber: 123456,
              mcNumber: 654321,
              legalName: "Happy Robot Logistics LLC",
              dbaName: "Happy Robot",
              telephone: "555-0100",
              phyStreet: "123 Carrier Ave",
              phyCity: "Austin",
              phyState: "TX",
              phyZip: "78701",
              phyCountry: "US",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    });

    const response = await app.request("/mc/MC654321/validate", {
      headers: AUTH_HEADERS,
    });

    restoreFetch.mock.restore();

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(body.valid_format, true);
    assert.equal(body.found, true);
    assert.equal(body.normalized_mc_number, "MC654321");
  });

  it("normalizes digits-only MC input before lookup", async () => {
    process.env.FMCSA_WEB_KEY = "test-key";
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const restoreFetch = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      assert.match(String(input), /docket-number\/892312/);

      return new Response(JSON.stringify({ content: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const response = await app.request("/mc/892312/validate", {
      headers: AUTH_HEADERS,
    });

    restoreFetch.mock.restore();

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(body.valid_format, true);
    assert.equal(body.found, false);
    assert.equal(body.normalized_mc_number, "MC892312");
    assert.equal(body.docket_number, "892312");
  });

  it("normalizes hyphenated MC input before lookup", async () => {
    process.env.FMCSA_WEB_KEY = "test-key";
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const restoreFetch = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      assert.match(String(input), /docket-number\/343521/);

      return new Response(JSON.stringify({ content: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const response = await app.request("/mc/MC-343521/validate", {
      headers: AUTH_HEADERS,
    });

    restoreFetch.mock.restore();

    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(body.valid_format, true);
    assert.equal(body.found, false);
    assert.equal(body.normalized_mc_number, "MC343521");
    assert.equal(body.docket_number, "343521");
  });
});

describe("POST /webhooks/agent-outcome", () => {
  it("stores normalized webhook analytics fields", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/webhooks/agent-outcome", {
      method: "POST",
      headers: {
        ...AUTH_HEADERS,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        outcome_classification: "Not_Interested",
        outcome_reasoning:
          "No conversation content provided; cannot determine outcome, treating as not interested due to missing information.",
        carrier_sentiment: "Neutral",
        call_duration: "74905",
        accepted_offer_value: "12300",
        decline_reason: "Out of salary range.",
        counteroffers_retries: 2,
      }),
    });

    assert.equal(response.status, 202);

    const body = (await response.json()) as Record<string, unknown>;
    const received = body.received as Record<string, unknown>;

    assert.equal(received.outcome_classification, "not_interested");
    assert.equal(received.carrier_sentiment, "neutral");
    assert.equal(received.call_duration_ms, 74905);
    assert.equal(received.accepted_offer_value, 12300);
    assert.equal(received.counteroffer_retries, 2);

    const events = JSON.parse(
      await readFile(analyticsFilePath, "utf8")
    ) as AnalyticsEvent[];
    const [event] = events;

    assert.equal(events.length, 1);
    assert.equal(event.event_type, "agent_outcome");
    assert.equal(event.outcome_classification, "not_interested");
    assert.equal(event.carrier_sentiment, "neutral");
    assert.equal(event.call_duration_ms, 74905);
    assert.equal(event.accepted_offer_value, 12300);
    assert.equal(event.decline_reason, "Out of salary range.");
    assert.equal(event.counteroffer_retries, 2);
    assert.equal(event.status_code, 202);
  });
});
