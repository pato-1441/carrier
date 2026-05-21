import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { app } from "../src/app.js";

const AUTH_HEADERS = {
  "x-api-key": "duckyapikeyhappyrobot21may",
};

describe("API key protection", () => {
  it("returns 401 when the API key is missing", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/");

    assert.equal(response.status, 401);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.error, "Unauthorized");
    assert.ok(response.headers.get("x-request-id"));
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
});

describe("GET /mc/:mcNumber/validate", () => {
  it("rejects invalid MC formats before calling FMCSA", async () => {
    process.env.API_KEY = "duckyapikeyhappyrobot21may";

    const response = await app.request("/mc/12345/validate", {
      headers: AUTH_HEADERS,
    });

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
});
