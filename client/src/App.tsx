import { startTransition, useDeferredValue, useEffect, useState } from "react";

import type {
  AnalyticsDashboardData,
  AnalyticsOutcomeBreakdown,
  AnalyticsRange,
  AnalyticsRecentRequest,
} from "./types";

const RANGE_OPTIONS: AnalyticsRange[] = ["1h", "24h", "7d"];
const POLLING_INTERVAL_MS = 5_000;

export function App() {
  const [range, setRange] = useState<AnalyticsRange>("24h");
  const [reloadTick, setReloadTick] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "2xx" | "4xx" | "5xx">("all");
  const [endpointFilter, setEndpointFilter] = useState("all");
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const normalizedQuery = deferredSearch.trim().toLowerCase();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReloadTick((current) => current + 1);
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/analytics/data?range=${encodeURIComponent(range)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Dashboard request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as AnalyticsDashboardData;
        setData(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unexpected dashboard loading error."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [range, reloadTick]);

  const filteredRequests = !data
    ? []
    : data.recent_requests.filter((request) => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          request.request_id.toLowerCase().includes(normalizedQuery) ||
          request.path.toLowerCase().includes(normalizedQuery) ||
          (request.input ?? "").toLowerCase().includes(normalizedQuery) ||
          (request.normalized_input ?? "").toLowerCase().includes(normalizedQuery) ||
          (request.outcome_classification ?? "").toLowerCase().includes(normalizedQuery) ||
          (request.decline_reason ?? "").toLowerCase().includes(normalizedQuery);
        const matchesStatus = statusFilter === "all" || request.status_family === statusFilter;
        const matchesEndpoint = endpointFilter === "all" || request.endpoint === endpointFilter;

        return matchesQuery && matchesStatus && matchesEndpoint;
      });

  const hasAnalytics = (data?.totals.total_requests ?? 0) > 0;

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-[112rem] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <header className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Analytics
            </h1>
            <p className="text-sm text-zinc-500">
              Request analytics loaded from the local JSON file.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 border border-zinc-200 bg-white p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      setRange(option);
                    })
                  }
                  className={
                    option === range
                      ? "bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                      : "px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
                  }
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">
                {data ? `Updated ${formatDateTime(data.generated_at)}` : "Loading analytics"}
              </span>
              {data?.alert && hasAnalytics ? (
                <div className="flex items-center gap-3 border border-zinc-200 px-3 py-1.5">
                  <span
                    className={
                      data.alert.severity === "critical"
                        ? "h-2.5 w-2.5 bg-rose-500"
                        : data.alert.severity === "warning"
                          ? "h-2.5 w-2.5 bg-amber-400"
                          : "h-2.5 w-2.5 bg-emerald-500"
                    }
                  />
                  <span className="text-sm font-medium text-zinc-900">
                    {formatOperationalLabel(data.alert.severity)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setReloadTick((current) => current + 1)}
                className="border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <section className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Total requests"
            value={data ? compactNumber(data.totals.total_requests) : "—"}
          />
          <MetricCard
            label="Success rate"
            value={data ? formatPercent(data.totals.success_rate) : "—"}
          />
          <MetricCard
            label="Average latency"
            value={data ? formatLatency(data.totals.avg_latency_ms) : "—"}
          />
          <MetricCard
            label="P95 latency"
            value={data ? formatLatency(data.totals.p95_latency_ms) : "—"}
          />
          <MetricCard
            label="4xx errors"
            value={data ? numberFormat(data.totals.error_4xx) : "—"}
          />
          <MetricCard
            label="5xx errors"
            value={data ? numberFormat(data.totals.error_5xx) : "—"}
          />
          <MetricCard
            label="Agent outcomes"
            value={data ? compactNumber(data.totals.total_agent_outcomes) : "—"}
          />
          <MetricCard
            label="Avg call duration"
            value={data ? formatCallDuration(data.totals.avg_call_duration_ms) : "—"}
          />
          <MetricCard
            label="Accepted offer total"
            value={data ? formatCurrency(data.totals.total_accepted_offer_value) : "—"}
          />
          <MetricCard
            label="Avg counteroffers"
            value={data ? data.totals.avg_counteroffer_retries.toFixed(1) : "—"}
          />
        </section>

        {!hasAnalytics && !isLoading ? (
          <section className="border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <h2 className="text-base font-semibold text-zinc-900">No analytics yet</h2>
            <p className="mt-2 text-sm text-zinc-500">
              This page only shows data that exists in the local analytics JSON file.
            </p>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <article className="border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Status breakdown</h2>
            <div className="mt-4 space-y-4">
              {(data?.status_breakdown ?? []).map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-700">{item.label}</span>
                    <span className="text-zinc-500">
                      {numberFormat(item.count)} · {formatPercent(item.share)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden bg-zinc-100">
                    <div
                      className={
                        item.label === "2xx"
                          ? "h-full bg-emerald-500"
                          : item.label === "4xx"
                            ? "h-full bg-amber-400"
                            : "h-full bg-rose-500"
                      }
                      style={{ width: `${Math.max(item.share, item.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Endpoints</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="pb-3 pr-4 font-medium">Endpoint</th>
                    <th className="pb-3 pr-4 font-medium">Requests</th>
                    <th className="pb-3 pr-4 font-medium">Success</th>
                    <th className="pb-3 pr-4 font-medium">Avg</th>
                    <th className="pb-3 font-medium">P95</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-sm">
                  {(data?.endpoints ?? []).map((endpoint) => (
                    <tr key={endpoint.endpoint}>
                      <td className="py-3 pr-4 font-mono text-zinc-700">{endpoint.endpoint}</td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {numberFormat(endpoint.total_requests)}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {formatPercent(endpoint.success_rate)}
                      </td>
                      <td className="py-3 pr-4 text-zinc-600">
                        {formatLatency(endpoint.avg_latency_ms)}
                      </td>
                      <td className="py-3 text-zinc-600">
                        {formatLatency(endpoint.p95_latency_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <article className="border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Traffic trend</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Request volume and agent outcomes from the JSON analytics feed.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <TrendChart points={data?.trend ?? []} />
            </div>
          </article>

          <article className="border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Outcome breakdown</h2>
            <div className="mt-4 space-y-4">
              {(data?.outcome_breakdown ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">No webhook outcomes recorded yet.</p>
              ) : (
                (data?.outcome_breakdown ?? []).map((item) => (
                  <OutcomeRow key={item.classification} item={item} />
                ))
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <article className="border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Outcome metrics</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="pb-3 pr-4 font-medium">Classification</th>
                    <th className="pb-3 pr-4 font-medium">Count</th>
                    <th className="pb-3 pr-4 font-medium">Share</th>
                    <th className="pb-3 pr-4 font-medium">Avg call</th>
                    <th className="pb-3 pr-4 font-medium">Accepted total</th>
                    <th className="pb-3 font-medium">Avg retries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-sm">
                  {(data?.outcome_breakdown ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        Waiting for agent outcome webhooks.
                      </td>
                    </tr>
                  ) : (
                    (data?.outcome_breakdown ?? []).map((item) => (
                      <tr key={item.classification}>
                        <td className="py-3 pr-4 font-mono text-zinc-700">{item.classification}</td>
                        <td className="py-3 pr-4 text-zinc-600">{numberFormat(item.count)}</td>
                        <td className="py-3 pr-4 text-zinc-600">{formatPercent(item.share)}</td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {formatCallDuration(item.avg_call_duration_ms)}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {formatCurrency(item.total_accepted_offer_value)}
                        </td>
                        <td className="py-3 text-zinc-600">
                          {item.avg_counteroffer_retries.toFixed(1)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Decline reasons</h2>
            <div className="mt-4 space-y-3">
              {(data?.decline_reasons ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">No decline reasons have been reported yet.</p>
              ) : (
                (data?.decline_reasons ?? []).map((item) => (
                  <div
                    key={item.reason}
                    className="border border-zinc-200 bg-zinc-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-900">{item.reason}</p>
                      <p className="text-xs text-zinc-500">
                        {numberFormat(item.count)} · {formatPercent(item.share)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="border border-zinc-200 bg-white">
          <div className="space-y-4 border-b border-zinc-200 p-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Recent requests</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Latest records from the selected time range.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="text"
                placeholder="Search by request id, path, outcome, or decline reason"
                className="min-w-0 flex-1 border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
              />

              <select
                value={endpointFilter}
                onChange={(event) => setEndpointFilter(event.target.value)}
                className="border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              >
                <option value="all">All endpoints</option>
                {(data?.endpoints ?? []).map((endpoint) => (
                  <option key={endpoint.endpoint} value={endpoint.endpoint}>
                    {endpoint.endpoint}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | "2xx" | "4xx" | "5xx")
                }
                className="border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="2xx">2xx</option>
                <option value="4xx">4xx</option>
                <option value="5xx">5xx</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setEndpointFilter("all");
                  setStatusFilter("all");
                }}
                className="border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 font-medium">Endpoint</th>
                  <th className="px-5 py-3 font-medium">Path</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                  <th className="px-5 py-3 font-medium">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-sm">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-zinc-500">
                      No requests match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <RequestRow key={request.request_id} request={request} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-zinc-950">{value}</p>
    </article>
  );
}

function TrendChart({ points }: { points: AnalyticsDashboardData["trend"] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        No trend data available.
      </div>
    );
  }

  const height = 240;
  const width = 720;
  const padding = 20;
  const maxValue = Math.max(
    1,
    ...points.map((point) => Math.max(point.total_requests, point.agent_outcomes))
  );
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const toY = (value: number) =>
    height - padding - ((height - padding * 2) * value) / maxValue;

  const requestLine = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${padding + stepX * index} ${toY(point.total_requests)}`)
    .join(" ");
  const outcomeLine = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${padding + stepX * index} ${toY(point.agent_outcomes)}`
    )
    .join(" ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 bg-zinc-900" />
          Requests
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 bg-sky-500" />
          Agent outcomes
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-zinc-200"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          className="stroke-zinc-200"
        />
        <path d={requestLine} fill="none" stroke="#18181b" strokeWidth="3" strokeLinecap="round" />
        <path d={outcomeLine} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
        {points.map((point, index) => {
          const x = padding + stepX * index;

          return (
            <g key={point.bucket_start}>
              <circle cx={x} cy={toY(point.total_requests)} r="4" fill="#18181b" />
              <circle cx={x} cy={toY(point.agent_outcomes)} r="4" fill="#0ea5e9" />
            </g>
          );
        })}
      </svg>

      <div className="grid grid-cols-4 gap-2 text-xs text-zinc-500 sm:grid-cols-6 lg:grid-cols-8">
        {points.map((point) => (
          <div key={point.bucket_start} className="truncate">
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeRow({ item }: { item: AnalyticsOutcomeBreakdown }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-sm text-zinc-700">{item.classification}</p>
        <p className="text-xs text-zinc-500">
          {numberFormat(item.count)} · {formatPercent(item.share)}
        </p>
      </div>
      <div className="h-2 overflow-hidden bg-zinc-100">
        <div className="h-full bg-sky-500" style={{ width: `${Math.max(item.share, 6)}%` }} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        <span>Avg call {formatCallDuration(item.avg_call_duration_ms)}</span>
        <span>Accepted {formatCurrency(item.total_accepted_offer_value)}</span>
        <span>Retries {item.avg_counteroffer_retries.toFixed(1)}</span>
      </div>
    </div>
  );
}

function RequestRow({ request }: { request: AnalyticsRecentRequest }) {
  const badgeClassName =
    request.status_family === "5xx"
      ? "border-rose-200 bg-rose-100 text-rose-700"
      : request.status_family === "4xx"
        ? "border-amber-200 bg-amber-100 text-amber-700"
        : "border-emerald-200 bg-emerald-100 text-emerald-700";

  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-5 py-3 text-zinc-500">{formatTime(request.timestamp)}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex border px-2 py-0.5 text-xs font-medium ${badgeClassName}`}
        >
          {request.status_code}
        </span>
      </td>
      <td className="px-5 py-3 font-mono text-zinc-700">{request.method}</td>
      <td className="px-5 py-3 font-mono text-zinc-700">{request.endpoint}</td>
      <td className="px-5 py-3 font-mono text-xs text-zinc-500">{request.path}</td>
      <td className="px-5 py-3 text-zinc-600">{formatLatency(request.duration_ms)}</td>
      <td className="px-5 py-3 text-zinc-600">{formatRequestDetails(request)}</td>
      <td className="px-5 py-3 font-mono text-xs text-zinc-400">{request.request_id}</td>
    </tr>
  );
}

function numberFormat(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatLatency(value: number) {
  return `${Math.round(value)}ms`;
}

function formatSeconds(value: number) {
  return `${(value / 1000).toFixed(1)}s`;
}

function formatCallDuration(value: number) {
  return `${formatLatency(value)} / ${formatSeconds(value)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatRequestDetails(request: AnalyticsRecentRequest) {
  if (request.event_type === "agent_outcome") {
    const parts = [
      request.outcome_classification ?? "agent_outcome",
      request.call_duration_ms ? formatLatency(request.call_duration_ms) : null,
      request.accepted_offer_value ? formatCurrency(request.accepted_offer_value) : null,
      request.decline_reason ?? null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  return request.normalized_input ?? request.input ?? "—";
}

function formatOperationalLabel(severity: AnalyticsDashboardData["alert"]["severity"]) {
  if (severity === "critical") {
    return "System disruption detected";
  }

  if (severity === "warning") {
    return "Minor issues detected";
  }

  return "All systems operational";
}
