# Carrier HappyRobot API

A small Hono API with business endpoints, an agent outcome webhook, and a React analytics frontend:

- validate an MC number against the FMCSA public API
- return fake load data for a reference number in the format `ABC12345`
- ingest end-of-call agent outcome webhooks
- expose a lightweight React analytics dashboard backed by the local JSON analytics file

All API and webhook endpoints require an API key in the `x-api-key` header.

## Requirements

- Node.js 18+ if you want to run it locally without Docker
- pnpm
- Docker, if you want to run it in a container
- An FMCSA API key for live MC number validation

## Environment variables

Create a local `.env` file from [.env.example](/Users/pato/Documents/carrier-happyrobot/.env.example):

```bash
cp .env.example .env
```

Set these values:

```bash
FMCSA_WEB_KEY=your_real_fmcsa_web_key
API_KEY=your_internal_api_key
PORT=3000
ANALYTICS_FILE_PATH=./data/request-analytics.json
```

Notes:

- `FMCSA_WEB_KEY` is required for `GET /mc/:mcNumber/validate`
- `API_KEY` is required for every request and must be sent as `x-api-key`
- `ANALYTICS_FILE_PATH` controls where request analytics are stored locally
- if the FMCSA key is missing or rejected, the MC validation endpoint will return `502`

## One-command bootstrap

Run the bootstrap script from the repository root:

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

The script:

- verifies `pnpm` is installed
- creates `.env` from `.env.example` if needed
- creates the local `data` directory if missing
- installs dependencies with `pnpm install`
- runs the full test suite with `pnpm test`

After bootstrap finishes, start the app with:

```bash
pnpm run dev
```

The API will run on `http://localhost:3000` and the analytics dashboard will be available at `http://localhost:3000/analytics`.

## Install and run locally

```bash
pnpm install
pnpm run dev
```

The API will start on `http://localhost:3000` unless `PORT` is overridden.

For the two business endpoints, the API also stores lightweight analytics in a local JSON file. By default that file is written to `./data/request-analytics.json`.
You can view the built dashboard at `http://localhost:3000/analytics`.

If you want to work on the React UI directly during development, run the backend and frontend in separate terminals:

```bash
pnpm run dev
pnpm run dev:client
```

The Vite client runs on `http://localhost:5173` and proxies `GET /analytics/data` to the Hono API on port `3000`.

## Run with Docker

Build the image:

```bash
docker build -t carrier-happyrobot-api .
```

Run the container with your `.env` file:

```bash
docker run --rm -p 3000:3000 --env-file .env carrier-happyrobot-api
```

If you want to persist analytics outside the container, mount a local folder:

```bash
docker run --rm -p 3000:3000 --env-file .env \
  -v "$(pwd)/data:/app/data" \
  carrier-happyrobot-api
```

## Run with Docker Compose

```bash
docker compose up --build
```

The included [compose.yaml](/Users/pato/Documents/carrier-happyrobot/compose.yaml) reads values from your local `.env`.
It also mounts `./data` into the container so analytics survive restarts.

## Test

```bash
pnpm test
```

## Endpoints

### `GET /`

Redirects to `/analytics`.

### `GET /mc/:mcNumber/validate`

Validates MC numbers and normalizes common input variants like `MC123456`, `MC-123456`, or `123456`.

Example:

```bash
curl -i http://localhost:3000/mc/MC654321/validate \
  -H 'x-api-key: your_internal_api_key'
```

### `GET /loads/:referenceNumber`

Returns fake load data for a reference number and normalizes common variants like `ABC12345` or `ABC-12345`.

Example:

```bash
curl -i http://localhost:3000/loads/ABC12345 \
  -H 'x-api-key: your_internal_api_key'
```

Returned load shape:

```json
{
  "load_id": "ABC12345",
  "origin": "Austin, TX",
  "destination": "Phoenix, AZ",
  "pickup_datetime": "2026-05-26T17:34:28.665Z",
  "delivery_datetime": "2026-05-28T14:42:03.972Z",
  "equipment_type": "Dry Van",
  "loadboard_rate": 4780,
  "notes": "Must track with Macropoint.",
  "weight": 7763,
  "commodity_type": "Produce"
}
```

### `POST /webhooks/agent-outcome`

Stores the final agent outcome payload in the same local analytics JSON file used by the dashboard.

Example:

```bash
curl -i http://localhost:3000/webhooks/agent-outcome \
  -H 'x-api-key: your_internal_api_key' \
  -H 'content-type: application/json' \
  -d '{
    "outcome_classification": "not_interested",
    "outcome_reasoning": "No conversation content provided; cannot determine outcome.",
    "carrier_sentiment": "neutral",
    "call_duration": 74905,
    "accepted_offer_value": 12300,
    "decline_reason": "Out of salary range.",
    "counteroffer_retries": 2
  }'
```

Accepted payload fields:

- `outcome_classification` required
- `outcome_reasoning` optional
- `carrier_sentiment` optional
- `call_duration` optional, stored as milliseconds
- `accepted_offer_value` optional
- `decline_reason` optional
- `counteroffer_retries` optional

For compatibility, the webhook also accepts `counteroffers_retries`.

### `GET /analytics`

Returns the React analytics dashboard shell.

The page reads from the same local JSON analytics file used by the API and includes:

- request volume and latency summary cards
- response status breakdown
- endpoint-level performance summaries
- agent outcome totals and decline reason summaries
- request and webhook trend visualization
- recent request activity with range and filter controls

### `GET /analytics/data`

Returns the dashboard data as JSON for the React frontend.

Optional query parameter:

- `range=1h`
- `range=24h`
- `range=7d`

The JSON response now includes webhook-driven aggregates such as `outcome_breakdown`, `carrier_sentiments`, `decline_reasons`, and outcome totals inside `totals`.

## Common errors

- `401 Unauthorized`: missing or invalid `x-api-key`
- `400 Bad Request`: invalid MC number or load reference format
- `502 Bad Gateway`: FMCSA key missing, invalid, or FMCSA request failed

## Analytics file

Each successful or failed call to these routes is stored as a JSON record in the analytics file:

- `GET /mc/:mcNumber/validate`
- `GET /loads/:referenceNumber`
- `POST /webhooks/agent-outcome`

Each record includes request metadata such as timestamp, request id, path, status code, duration, and event-specific fields like validation results or agent outcome metrics.

This is intentionally lightweight and works well for small internal analytics without deploying a database.
