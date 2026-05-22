import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  AnalyticsAlert,
  AnalyticsDashboardData,
  AnalyticsDeclineReasonSummary,
  AnalyticsEndpointSummary,
  AnalyticsEvent,
  AnalyticsOutcomeBreakdown,
  AnalyticsRange,
  AnalyticsRecentRequest,
  AnalyticsStatusBreakdown,
  AnalyticsTrendPoint,
} from "../types.js";

const DEFAULT_ANALYTICS_FILE_PATH = resolve(process.cwd(), "data/request-analytics.json");
const RANGE_TO_MS: Record<AnalyticsRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

let writeQueue = Promise.resolve();

export function appendAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const filePath = getAnalyticsFilePath();

    await mkdir(dirname(filePath), { recursive: true });

    const existingEvents = await readAnalyticsEvents(filePath);
    existingEvents.push(event);

    await writeFile(filePath, JSON.stringify(existingEvents, null, 2));
  });

  return writeQueue;
}

export async function getAnalyticsDashboardData(
  range: AnalyticsRange = "24h"
): Promise<AnalyticsDashboardData> {
  await writeQueue;

  const events = await readAnalyticsEvents(getAnalyticsFilePath());
  const now = new Date();
  const rangeStart = new Date(now.getTime() - RANGE_TO_MS[range]);
  const filteredEvents = events.filter((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    return Number.isFinite(eventTime) && eventTime >= rangeStart.getTime();
  });
  const sortedEvents = [...filteredEvents].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );

  const totals = buildTotals(filteredEvents);

  return {
    range,
    generated_at: now.toISOString(),
    totals,
    status_breakdown: buildStatusBreakdown(filteredEvents),
    endpoints: buildEndpointSummaries(filteredEvents),
    outcome_breakdown: buildOutcomeBreakdown(filteredEvents),
    decline_reasons: buildDeclineReasons(filteredEvents),
    trend: buildTrend(filteredEvents, range, now),
    recent_requests: sortedEvents.slice(0, 20).map(toRecentRequest),
    alert: buildAlert(sortedEvents),
  };
}

export function isAnalyticsRange(value: string): value is AnalyticsRange {
  return value in RANGE_TO_MS;
}

function getAnalyticsFilePath(): string {
  return process.env.ANALYTICS_FILE_PATH
    ? resolve(process.env.ANALYTICS_FILE_PATH)
    : DEFAULT_ANALYTICS_FILE_PATH;
}

async function readAnalyticsEvents(filePath: string): Promise<AnalyticsEvent[]> {
  try {
    const content = await readFile(filePath, "utf8");

    if (content.trim().length === 0) {
      return [];
    }

    const parsed = JSON.parse(content) as unknown;

    return Array.isArray(parsed) ? (parsed as AnalyticsEvent[]) : [];
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function buildTotals(events: AnalyticsEvent[]): AnalyticsDashboardData["totals"] {
  const totalRequests = events.length;
  const successfulRequests = events.filter((event) => event.status_code < 400).length;
  const error4xx = events.filter(
    (event) => event.status_code >= 400 && event.status_code < 500
  ).length;
  const error5xx = events.filter((event) => event.status_code >= 500).length;
  const outcomeEvents = events.filter((event) => event.event_type === "agent_outcome");

  return {
    total_requests: totalRequests,
    success_rate: toPercentage(successfulRequests, totalRequests),
    avg_latency_ms: average(events.map((event) => event.duration_ms)),
    p95_latency_ms: percentile(events.map((event) => event.duration_ms), 95),
    error_4xx: error4xx,
    error_5xx: error5xx,
    total_agent_outcomes: outcomeEvents.length,
    avg_call_duration_ms: average(
      outcomeEvents.map((event) => event.call_duration_ms).filter(isNumber)
    ),
    total_accepted_offer_value: roundToSingleDecimal(
      outcomeEvents
        .map((event) => event.accepted_offer_value)
        .filter(isNumber)
        .reduce((sum, value) => sum + value, 0)
    ),
    avg_counteroffer_retries: average(
      outcomeEvents.map((event) => event.counteroffer_retries).filter(isNumber)
    ),
  };
}

function buildStatusBreakdown(events: AnalyticsEvent[]): AnalyticsStatusBreakdown[] {
  const total = events.length;

  return [
    buildStatusBucket("2xx", events.filter((event) => event.status_code < 400).length, total),
    buildStatusBucket(
      "4xx",
      events.filter((event) => event.status_code >= 400 && event.status_code < 500).length,
      total
    ),
    buildStatusBucket("5xx", events.filter((event) => event.status_code >= 500).length, total),
  ];
}

function buildStatusBucket(
  label: AnalyticsStatusBreakdown["label"],
  count: number,
  total: number
): AnalyticsStatusBreakdown {
  return {
    label,
    count,
    share: toPercentage(count, total),
  };
}

function buildEndpointSummaries(events: AnalyticsEvent[]): AnalyticsEndpointSummary[] {
  const grouped = new Map<string, AnalyticsEvent[]>();

  for (const event of events) {
    const endpoint = getEndpointLabel(event);
    const existing = grouped.get(endpoint) ?? [];
    existing.push(event);
    grouped.set(endpoint, existing);
  }

  return [...grouped.entries()]
    .map(([endpoint, groupedEvents]) => {
      const successCount = groupedEvents.filter((event) => event.status_code < 400).length;
      const errorCount = groupedEvents.length - successCount;
      const sortedByTimestamp = [...groupedEvents].sort(
        (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );

      return {
        endpoint,
        event_type: groupedEvents[0].event_type,
        total_requests: groupedEvents.length,
        success_rate: toPercentage(successCount, groupedEvents.length),
        avg_latency_ms: average(groupedEvents.map((event) => event.duration_ms)),
        p95_latency_ms: percentile(groupedEvents.map((event) => event.duration_ms), 95),
        error_rate: toPercentage(errorCount, groupedEvents.length),
        last_seen_at: sortedByTimestamp[0]?.timestamp ?? null,
      };
    })
    .sort((left, right) => right.total_requests - left.total_requests);
}

function buildTrend(
  events: AnalyticsEvent[],
  range: AnalyticsRange,
  now: Date
): AnalyticsTrendPoint[] {
  const config = getTrendConfig(range);
  const firstBucketStart = now.getTime() - config.bucketMs * (config.bucketCount - 1);

  return Array.from({ length: config.bucketCount }, (_, index) => {
    const bucketStart = firstBucketStart + index * config.bucketMs;
    const bucketEnd = bucketStart + config.bucketMs;
    const bucketEvents = events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();

      return eventTime >= bucketStart && eventTime < bucketEnd;
    });

    return {
      bucket_start: new Date(bucketStart).toISOString(),
      label: formatTrendLabel(bucketStart, range),
      total_requests: bucketEvents.length,
      agent_outcomes: bucketEvents.filter((event) => event.event_type === "agent_outcome").length,
      error_4xx: bucketEvents.filter(
        (event) => event.status_code >= 400 && event.status_code < 500
      ).length,
      error_5xx: bucketEvents.filter((event) => event.status_code >= 500).length,
      avg_latency_ms: average(bucketEvents.map((event) => event.duration_ms)),
    };
  });
}

function buildOutcomeBreakdown(events: AnalyticsEvent[]): AnalyticsOutcomeBreakdown[] {
  const outcomeEvents = events.filter(
    (event): event is AnalyticsEvent & { outcome_classification: string } =>
      event.event_type === "agent_outcome" && typeof event.outcome_classification === "string"
  );
  const grouped = new Map<string, AnalyticsEvent[]>();

  for (const event of outcomeEvents) {
    const key = event.outcome_classification;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([classification, groupedEvents]) => ({
      classification,
      count: groupedEvents.length,
      share: toPercentage(groupedEvents.length, outcomeEvents.length),
      avg_call_duration_ms: average(
        groupedEvents.map((event) => event.call_duration_ms).filter(isNumber)
      ),
      total_accepted_offer_value: roundToSingleDecimal(
        groupedEvents
          .map((event) => event.accepted_offer_value)
          .filter(isNumber)
          .reduce((sum, value) => sum + value, 0)
      ),
      avg_counteroffer_retries: average(
        groupedEvents.map((event) => event.counteroffer_retries).filter(isNumber)
      ),
    }))
    .sort((left, right) => right.count - left.count);
}

function buildDeclineReasons(events: AnalyticsEvent[]): AnalyticsDeclineReasonSummary[] {
  const declineEvents = events.filter(
    (event): event is AnalyticsEvent & { decline_reason: string } =>
      event.event_type === "agent_outcome" &&
      typeof event.decline_reason === "string" &&
      event.decline_reason.trim().length > 0
  );
  const grouped = new Map<string, number>();

  for (const event of declineEvents) {
    const key = event.decline_reason.trim();
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return [...grouped.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      share: toPercentage(count, declineEvents.length),
    }))
    .sort((left, right) => right.count - left.count);
}

function getTrendConfig(range: AnalyticsRange): { bucketCount: number; bucketMs: number } {
  switch (range) {
    case "1h":
      return { bucketCount: 12, bucketMs: 5 * 60 * 1000 };
    case "7d":
      return { bucketCount: 7, bucketMs: 24 * 60 * 60 * 1000 };
    case "24h":
    default:
      return { bucketCount: 24, bucketMs: 60 * 60 * 1000 };
  }
}

function buildAlert(events: AnalyticsEvent[]): AnalyticsAlert {
  const recentWindowStart = Date.now() - 15 * 60 * 1000;
  const recent5xx = events.filter((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    return event.status_code >= 500 && eventTime >= recentWindowStart;
  });

  if (recent5xx.length > 0) {
    const hottestEndpoint = mostFrequentEndpoint(recent5xx);

    return {
      severity: "critical",
      title: "Elevated server errors detected",
      message: `${recent5xx.length} recent 5xx response${recent5xx.length === 1 ? "" : "s"} on ${hottestEndpoint}.`,
    };
  }

  const recent4xx = events.filter((event) => {
    const eventTime = new Date(event.timestamp).getTime();

    return event.status_code >= 400 && event.status_code < 500 && eventTime >= recentWindowStart;
  });

  if (recent4xx.length > 0) {
    return {
      severity: "warning",
      title: "Client-side validation noise is up",
      message: `${recent4xx.length} recent 4xx response${recent4xx.length === 1 ? "" : "s"} were recorded in the last 15 minutes.`,
    };
  }

  return {
    severity: "healthy",
    title: "Traffic looks steady",
    message: "No elevated error patterns were detected in the most recent window.",
  };
}

function mostFrequentEndpoint(events: AnalyticsEvent[]): string {
  const counts = new Map<string, number>();

  for (const event of events) {
    const endpoint = getEndpointLabel(event);
    counts.set(endpoint, (counts.get(endpoint) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown";
}

function toRecentRequest(event: AnalyticsEvent): AnalyticsRecentRequest {
  return {
    request_id: event.request_id,
    timestamp: event.timestamp,
    method: event.method,
    path: event.path,
    endpoint: getEndpointLabel(event),
    status_code: event.status_code,
    duration_ms: Math.round(event.duration_ms),
    input: event.input,
    normalized_input: event.normalized_input,
    event_type: event.event_type,
    status_family: getStatusFamily(event.status_code),
    error: event.error,
    outcome_classification: event.outcome_classification,
    call_duration_ms: event.call_duration_ms ?? null,
    accepted_offer_value: event.accepted_offer_value ?? null,
    decline_reason: event.decline_reason ?? null,
    counteroffer_retries: event.counteroffer_retries ?? null,
  };
}

function getEndpointLabel(event: AnalyticsEvent): string {
  if (event.event_type === "mc_validation") {
    return "/mc/:mcNumber/validate";
  }

  if (event.event_type === "load_lookup") {
    return "/loads/:referenceNumber";
  }

  if (event.event_type === "agent_outcome") {
    return "/webhooks/agent-outcome";
  }

  return event.path;
}

function getStatusFamily(statusCode: number): AnalyticsRecentRequest["status_family"] {
  if (statusCode >= 500) {
    return "5xx";
  }

  if (statusCode >= 400) {
    return "4xx";
  }

  return "2xx";
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundToSingleDecimal(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );

  return roundToSingleDecimal(sorted[index] ?? 0);
}

function toPercentage(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return roundToSingleDecimal((count / total) * 100);
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatTrendLabel(timestamp: number, range: AnalyticsRange): string {
  if (range === "7d") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }).format(timestamp);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: range === "1h" ? "2-digit" : undefined,
  }).format(timestamp);
}
