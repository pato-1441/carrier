# Carrier HappyRobot API

A small Hono API with two endpoints:

- validate an MC number against the FMCSA public API
- return fake load data for a reference number in the format `ABC12345`

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
```

Notes:

- `FMCSA_WEB_KEY` is required for `GET /mc/:mcNumber/validate`
- `API_KEY` is required for every request and must be sent as `x-api-key`
- if the FMCSA key is missing or rejected, the MC validation endpoint will return `502`

## Install and run locally

```bash
pnpm install
pnpm run dev
```

The API will start on `http://localhost:3000` unless `PORT` is overridden.

## Run with Docker

Build the image:

```bash
docker build -t carrier-happyrobot-api .
```

Run the container with your `.env` file:

```bash
docker run --rm -p 3000:3000 --env-file .env carrier-happyrobot-api
```

## Run with Docker Compose

```bash
docker compose up --build
```

The included [compose.yaml](/Users/pato/Documents/carrier-happyrobot/compose.yaml) reads values from your local `.env`.

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

## Common errors

- `401 Unauthorized`: missing or invalid `x-api-key`
- `400 Bad Request`: invalid MC number or load reference format
- `502 Bad Gateway`: FMCSA key missing, invalid, or FMCSA request failed
