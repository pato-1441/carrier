# Carrier HappyRobot API

A small Hono API with two endpoints and a React analytics frontend:

- validate an MC number against the FMCSA public API
- return fake load data for a reference number in the format `ABC12345`
- expose a lightweight React analytics dashboard backed by the local JSON analytics file

All endpoints require an API key in the `x-api-key` header.

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

Returns the service name and the available routes.

### `GET /mc/:mcNumber/validate`

Validates MC numbers in the format `MC123456`.

Example:

```bash
curl -i http://localhost:3000/mc/MC654321/validate \
  -H 'x-api-key: your_internal_api_key'
```

### `GET /loads/:referenceNumber`

Returns fake load data for a reference number in the format `ABC12345`.

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

### `GET /analytics`

Returns the React analytics dashboard shell.

The page reads from the same local JSON analytics file used by the API and includes:

- request volume and latency summary cards
- response status breakdown
- endpoint-level performance summaries
- recent request activity with range and filter controls

### `GET /analytics/data`

Returns the dashboard data as JSON for the React frontend.

Optional query parameter:

- `range=1h`
- `range=24h`
- `range=7d`

## Common errors

- `401 Unauthorized`: missing or invalid `x-api-key`
- `400 Bad Request`: invalid MC number or load reference format
- `502 Bad Gateway`: FMCSA key missing, invalid, or FMCSA request failed

## Analytics file

Each successful or failed call to these two endpoints is stored as a JSON record in the analytics file:

- `GET /mc/:mcNumber/validate`
- `GET /loads/:referenceNumber`

Each record includes request metadata such as timestamp, request id, path, status code, duration, input, and validation outcome.

This is intentionally lightweight and works well for small internal analytics without deploying a database.
