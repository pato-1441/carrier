import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type {
  AnalyticsDashboardData,
  AnalyticsEndpointSummary,
  AnalyticsRange,
  AnalyticsRecentRequest,
} from "./types";

const RANGE_OPTIONS: AnalyticsRange[] = ["1h", "24h", "7d"];
const STATUS_BAR_TONES = {
  "2xx": "bg-emerald-500",
  "4xx": "bg-amber-400",
  "5xx": "bg-rose-500",
} as const;
const SPLIT_COLORS = ["#2563eb", "#7c3aed", "#0f766e", "#f59e0b"];

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
          request.input.toLowerCase().includes(normalizedQuery) ||
          request.normalized_input.toLowerCase().includes(normalizedQuery);
        const matchesStatus = statusFilter === "all" || request.status_family === statusFilter;
        const matchesEndpoint = endpointFilter === "all" || request.endpoint === endpointFilter;

        return matchesQuery && matchesStatus && matchesEndpoint;
      });

  const splitSegments = buildSplitSegments(data?.endpoints ?? []);
  const trendMax =
    !data || data.trend.length === 0
      ? 0
      : Math.max(...data.trend.map((point) => point.total_requests), 0);
  const trendGuide = {
    max: trendMax,
    mid: Math.round(trendMax / 2),
    labels: !data || data.trend.length === 0 ? ([] as string[]) : pickTrendLabels(data.trend.map((point) => point.label)),
  };

  const zeroState = !isLoading && data && data.totals.total_requests === 0;

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <TopBar />

        <div className="flex-1 overflow-auto bg-zinc-50">
          <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 md:p-8">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  API Overview
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Real-time health and performance metrics for inbound logistics traffic.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-md border border-zinc-200 bg-white p-1 shadow-sm">
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
                          ? "rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                          : "rounded px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900"
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setReloadTick((current) => current + 1)}
                  className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
                  aria-label="Refresh dashboard"
                >
                  <RefreshIcon />
                </button>
              </div>
            </section>

            {errorMessage ? (
              <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {errorMessage}
              </section>
            ) : null}

            <AlertBanner
              alert={data?.alert}
              generatedAt={data?.generated_at ?? null}
              isLoading={isLoading}
            />

            <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard
                label="Total Requests"
                value={data ? compactNumber(data.totals.total_requests) : "—"}
                accent="bg-white"
                meta="Live"
                icon={<TrendIcon />}
              />
              <MetricCard
                label="Success Rate"
                value={data ? formatPercent(data.totals.success_rate) : "—"}
                accent="bg-white"
                meta={data ? (data.totals.success_rate >= 99.5 ? "Target 99.9%" : "Below target") : "Target 99.9%"}
                progress={data?.totals.success_rate ?? 0}
              />
              <MetricCard
                label="Avg Latency"
                value={data ? formatLatency(data.totals.avg_latency_ms) : "—"}
                accent="bg-white"
                icon={<ClockIcon />}
              />
              <MetricCard
                label="P95 Latency"
                value={data ? formatLatency(data.totals.p95_latency_ms) : "—"}
                accent="bg-amber-50/60 border-amber-200"
                meta={
                  data
                    ? data.totals.p95_latency_ms > 800
                      ? "Tail risk"
                      : data.totals.p95_latency_ms > 300
                        ? "Elevated"
                        : "Stable"
                    : "Stable"
                }
                textTone="text-amber-900"
                metaTone="bg-amber-100 text-amber-700"
                icon={<BoltIcon />}
              />
              <MetricCard
                label="4xx Client Errors"
                value={data ? numberFormat(data.totals.error_4xx) : "—"}
                accent="bg-white"
                meta={
                  data && data.totals.total_requests > 0
                    ? `${formatPercent((data.totals.error_4xx / data.totals.total_requests) * 100)} of total`
                    : "0% of total"
                }
              />
              <MetricCard
                label="5xx Server Errors"
                value={data ? numberFormat(data.totals.error_5xx) : "—"}
                accent="bg-rose-50/60 border-rose-200"
                meta={data && data.totals.error_5xx > 0 ? "Spike" : "Quiet"}
                textTone="text-rose-600"
                metaTone="bg-rose-100 text-rose-600"
              />
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article className="lg:col-span-2 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-900">Traffic Volume &amp; Errors</h2>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-600">
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      Total Requests
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-600">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      5xx Errors
                    </div>
                  </div>
                </div>

                <div className="relative mt-4 flex min-h-56 items-end gap-1">
                  <div className="absolute inset-y-0 left-0 flex w-10 flex-col justify-between border-r border-zinc-100 pb-6 pr-2 text-right text-[10px] text-zinc-400">
                    <span>{compactNumber(trendGuide.max)}</span>
                    <span>{compactNumber(trendGuide.mid)}</span>
                    <span>0</span>
                  </div>
                  <div className="absolute bottom-6 left-10 right-0 border-t border-zinc-200" />
                  <div className="absolute left-10 right-0 top-2 border-t border-dashed border-zinc-100" />
                  <div className="absolute bottom-1/2 left-10 right-0 border-t border-dashed border-zinc-100" />

                  <div className="flex h-full flex-1 items-end gap-1.5 pb-6 pl-12 pt-2">
                    {(data?.trend ?? []).map((point) => {
                      const height =
                        trendGuide.max > 0
                          ? Math.max(12, Math.round((point.total_requests / trendGuide.max) * 100))
                          : 12;
                      const errorRatio =
                        point.total_requests > 0
                          ? Math.max(
                              0,
                              Math.min(90, Math.round((point.error_5xx / point.total_requests) * 100))
                            )
                          : 0;

                      return (
                        <div
                          key={point.bucket_start}
                          className="group relative flex-1 rounded-t-sm bg-blue-100 transition hover:bg-blue-200"
                          style={{ height: `${height}%` }}
                          title={`${point.label}: ${point.total_requests} requests`}
                        >
                          <div className="absolute bottom-0 h-full w-full rounded-t-sm bg-blue-500" />
                          {errorRatio > 0 ? (
                            <div
                              className="absolute bottom-0 w-full rounded-t-sm bg-rose-500"
                              style={{ height: `${errorRatio}%` }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="absolute bottom-0 left-12 right-0 flex justify-between text-[10px] text-zinc-400">
                    {trendGuide.labels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
              </article>

              <div className="flex flex-col gap-6">
                <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 text-sm font-semibold text-zinc-900">Response Status</h2>
                  <div className="space-y-4">
                    {(data?.status_breakdown ?? []).map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className="w-12 text-right font-mono text-xs text-zinc-500">{item.label}</div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full ${STATUS_BAR_TONES[item.label]}`}
                            style={{ width: `${Math.max(item.share, item.count > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <div className="w-12 text-right text-xs font-medium text-zinc-900">
                          {formatPercent(item.share)}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="flex flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-900">Traffic Split</h2>
                    <span className="text-xs text-blue-600">View details</span>
                  </div>
                  <div className="relative flex flex-1 items-center justify-center">
                    <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90 transform">
                      <circle cx="60" cy="60" r="45" fill="none" stroke="#f4f4f5" strokeWidth="20" />
                      {splitSegments.map((segment) => (
                        <circle
                          key={segment.key}
                          cx="60"
                          cy="60"
                          r="45"
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="20"
                          strokeDasharray={`${segment.length} ${segment.remainder}`}
                          strokeDashoffset={segment.offset}
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-xl font-semibold text-zinc-900">
                          {data?.endpoints.length ?? 0}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                          Endpoints
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
                    {(data?.endpoints ?? []).map((endpoint, index) => (
                      <div key={endpoint.endpoint} className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <div
                          className="h-2.5 w-2.5 rounded"
                          style={{ backgroundColor: SPLIT_COLORS[index % SPLIT_COLORS.length] }}
                        />
                        {shortEndpointLabel(endpoint)}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="space-y-4 border-b border-zinc-200 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-zinc-900">Live Request Activity</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                      aria-label="Export activity"
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white transition hover:bg-zinc-800"
                    >
                      <CodeIcon />
                      View in API Explorer
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-60 flex-1">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      type="text"
                      placeholder="Search by request_id, input, or path..."
                      className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <select
                    value={endpointFilter}
                    onChange={(event) => setEndpointFilter(event.target.value)}
                    className="rounded-md border border-zinc-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All Endpoints</option>
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
                    className="rounded-md border border-zinc-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">Status: All</option>
                    <option value="2xx">2xx Success</option>
                    <option value="4xx">4xx Error</option>
                    <option value="5xx">5xx Error</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setEndpointFilter("all");
                      setStatusFilter("all");
                    }}
                    className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-200"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse whitespace-nowrap text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50">
                      {["Time", "Status", "Method", "Endpoint", "Path", "Duration", "Input", "Request ID"].map((label) => (
                        <th
                          key={label}
                          className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-sm text-zinc-500">
                          No requests match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((request) => <RequestRow key={request.request_id} request={request} />)
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-200 p-4 text-sm text-zinc-500">
                <span>
                  Showing {filteredRequests.length} of {data?.recent_requests.length ?? 0} recent requests
                </span>
                <div className="flex items-center gap-1">
                  <button className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-zinc-400" disabled>
                    Previous
                  </button>
                  <button className="rounded-md border border-zinc-200 bg-white px-3 py-1 font-medium text-zinc-900 transition hover:bg-zinc-50">
                    Next
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-sm">
              {zeroState ? (
                <div className="mx-auto max-w-xl">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                    <DatabaseIcon />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900">No analytics captured yet</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    This dashboard reads directly from your local JSON analytics file. Make a few API calls to
                    <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">/loads/:referenceNumber</code>
                    or
                    <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">/mc/:mcNumber/validate</code>
                    and the charts will populate automatically.
                  </p>
                </div>
              ) : (
                <div className="mx-auto max-w-md">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                    <CheckIcon />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {data && data.totals.error_5xx > 0 ? "Degradation Warning Active" : "No Degradation Warnings"}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {data && data.totals.error_5xx > 0
                      ? "Recent 5xx responses or elevated latency suggest the workflow needs investigation."
                      : "All endpoints are operating within normal latency parameters. P95 latency is stable across the board."}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="dark-sidebar hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-400 lg:flex">
      <div className="flex h-14 items-center border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white ring-1 ring-zinc-800">
            <CubeIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">HappyRobot</p>
            <p className="text-xs text-zinc-500">Blacklight analytics</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto py-4">
        <SidebarGroup
          title="Workflows"
          items={[
            { label: "Editor", badge: "ctrl+w" },
            { label: "Runs", badge: "ctrl+r" },
            { label: "Experiments", badge: "Beta", tone: "blue" },
          ]}
          hasChevron
        />
        <SidebarGroup
          title="Evals"
          items={[
            { label: "Northstars" },
            { label: "Custom Tests" },
            { label: "Adversarial", badge: "New", tone: "emerald" },
          ]}
        />
        <SidebarGroup
          title="Monitor"
          items={[
            { label: "Analytics", active: true },
            { label: "Errors" },
            { label: "Flags" },
            { label: "Northstar Audits" },
          ]}
        />
        <SidebarGroup
          title="Workflow settings"
          items={[
            { label: "General" },
            { label: "Variables" },
            { label: "Approval Process" },
            { label: "Out of Office" },
            { label: "Signals" },
          ]}
        />
      </div>

      <div className="border-t border-zinc-800 p-3">
        <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800/50">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-700 text-white ring-1 ring-zinc-600">
              <FolderIcon />
            </div>
            <span className="truncate font-medium">Logistics API Prod</span>
          </div>
          <ChevronUpDownIcon />
        </button>
      </div>
    </aside>
  );
}

function SidebarGroup({
  title,
  items,
  hasChevron = false,
}: {
  title: string;
  items: Array<{ label: string; badge?: string; tone?: "blue" | "emerald"; active?: boolean }>;
  hasChevron?: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <div className="flex items-center gap-2">
          {hasChevron ? <ChevronLeftIcon /> : null}
          {title}
        </div>
      </div>
      <nav className="space-y-0.5">
        {items.map((item) => (
          <a
            key={item.label}
            href="#"
            className={
              item.active
                ? "flex items-center border-l-2 border-white bg-zinc-800/80 px-4 py-1.5 text-sm font-medium text-white"
                : "flex items-center justify-between px-4 py-1.5 text-sm transition hover:bg-zinc-800/50 hover:text-zinc-200"
            }
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={
                  item.tone === "blue"
                    ? "rounded border border-blue-800/50 bg-blue-950/40 px-1.5 py-0.5 text-[10px] text-blue-400"
                    : item.tone === "emerald"
                      ? "rounded border border-emerald-800/50 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-400"
                      : "rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                }
              >
                {item.badge}
              </span>
            ) : null}
          </a>
        ))}
      </nav>
    </section>
  );
}

function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center text-sm">
        <DatabaseStackIcon className="mr-2 h-4 w-4 shrink-0 text-zinc-500" />
        <span className="truncate font-medium text-zinc-600">Inbound Carrier Sales</span>
        <BreadcrumbChevron />
        <span className="hidden text-zinc-600 sm:block">Monitor</span>
        <BreadcrumbChevron />
        <span className="hidden font-medium text-zinc-900 sm:block">Analytics</span>
      </div>

      <div className="flex items-center gap-4">
        <button className="hidden items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 sm:flex">
          <div className="h-4 w-4 rounded-full bg-blue-500 ring-2 ring-white" />
          Ask Frontal
        </button>
        <div className="hidden h-4 w-px bg-zinc-200 sm:block" />
        <button className="flex items-center gap-2 text-sm text-zinc-600 transition hover:text-zinc-900">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-200 text-xs font-medium text-orange-700">
            JD
          </div>
        </button>
      </div>
    </header>
  );
}

function AlertBanner({
  alert,
  generatedAt,
  isLoading,
}: {
  alert: AnalyticsDashboardData["alert"] | undefined;
  generatedAt: string | null;
  isLoading: boolean;
}) {
  const tone =
    alert?.severity === "critical"
      ? {
          shell: "bg-rose-50 border-rose-200",
          iconWrap: "bg-rose-100 text-rose-600",
          title: "text-rose-900",
          body: "text-rose-700",
          button: "text-rose-700 border-rose-200 hover:text-rose-900",
        }
      : alert?.severity === "warning"
        ? {
            shell: "bg-amber-50 border-amber-200",
            iconWrap: "bg-amber-100 text-amber-600",
            title: "text-amber-900",
            body: "text-amber-700",
            button: "text-amber-700 border-amber-200 hover:text-amber-900",
          }
        : {
            shell: "bg-emerald-50 border-emerald-200",
            iconWrap: "bg-emerald-100 text-emerald-600",
            title: "text-emerald-900",
            body: "text-emerald-700",
            button: "text-emerald-700 border-emerald-200 hover:text-emerald-900",
          };

  return (
    <section className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${tone.shell}`}>
      <div className="flex items-start gap-3 sm:items-center">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:mt-0 ${tone.iconWrap}`}>
          <AlertIcon />
        </div>
        <div>
          <h3 className={`text-sm font-semibold ${tone.title}`}>
            {isLoading ? "Refreshing analytics dashboard" : alert?.title ?? "Dashboard ready"}
          </h3>
          <p className={`mt-0.5 text-sm ${tone.body}`}>
            {isLoading
              ? "Fetching the latest metrics from the local analytics file."
              : alert?.message ??
                "No alert data is available yet. Make a few requests to populate the dashboard."}
          </p>
          {generatedAt ? (
            <p className="mt-1 text-xs text-zinc-500">Updated {formatUpdatedTime(generatedAt)}</p>
          ) : null}
        </div>
      </div>
      <button className={`whitespace-nowrap rounded-md border bg-white/50 px-3 py-1.5 text-sm font-medium transition hover:bg-white ${tone.button}`}>
        View Logs
      </button>
    </section>
  );
}

function MetricCard({
  label,
  value,
  accent,
  meta,
  textTone = "text-zinc-900",
  metaTone = "bg-zinc-100 text-zinc-500",
  icon,
  progress,
}: {
  label: string;
  value: string;
  accent: string;
  meta?: string;
  textTone?: string;
  metaTone?: string;
  icon?: ReactNode;
  progress?: number;
}) {
  return (
    <article className={`rounded-xl border border-zinc-200 p-4 shadow-sm ${accent}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold ${textTone}`}>{value}</span>
        {meta ? <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${metaTone}`}>{meta}</span> : null}
      </div>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}

function RequestRow({ request }: { request: AnalyticsRecentRequest }) {
  const rowTone =
    request.status_family === "5xx"
      ? "bg-rose-50/30 hover:bg-rose-50"
      : request.status_family === "4xx"
        ? "bg-amber-50/20 hover:bg-amber-50/40"
        : "hover:bg-zinc-50";
  const durationTone =
    request.status_family === "5xx"
      ? "text-rose-600 font-medium"
      : request.duration_ms >= 800
        ? "text-amber-600 font-medium"
        : "text-zinc-500";

  return (
    <tr className={`group transition-colors ${rowTone}`}>
      <td className={`px-5 py-3 ${request.status_family === "5xx" ? "font-medium text-rose-500" : "text-zinc-500"}`}>
        {formatRowTime(request.timestamp)}
      </td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${statusTone(request.status_family)}`}>
          {request.status_code}
        </span>
      </td>
      <td className="px-5 py-3">
        <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-medium ${methodTone(request.method)}`}>
          {request.method}
        </span>
      </td>
      <td className="px-5 py-3 font-mono text-zinc-700">{request.endpoint}</td>
      <td className="px-5 py-3 font-mono text-xs text-zinc-500">{request.path}</td>
      <td className={`px-5 py-3 ${durationTone}`}>{formatLatency(request.duration_ms)}</td>
      <td className="px-5 py-3 text-sm text-zinc-700">{request.normalized_input}</td>
      <td className="px-5 py-3 font-mono text-xs text-zinc-400 group-hover:text-zinc-600">
        {request.request_id}
      </td>
    </tr>
  );
}

function buildSplitSegments(endpoints: AnalyticsEndpointSummary[]) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const totalRequests = endpoints.reduce((sum, endpoint) => sum + endpoint.total_requests, 0);
  let traversed = 0;

  return endpoints.map((endpoint, index) => {
    const share = totalRequests > 0 ? endpoint.total_requests / totalRequests : 0;
    const length = share * circumference;
    const offset = circumference - traversed;
    traversed += length;

    return {
      key: endpoint.endpoint,
      color: SPLIT_COLORS[index % SPLIT_COLORS.length],
      length,
      remainder: circumference - length,
      offset,
    };
  });
}

function pickTrendLabels(labels: string[]) {
  if (labels.length <= 4) {
    return labels;
  }

  return [
    labels[0],
    labels[Math.floor(labels.length / 3)],
    labels[Math.floor((labels.length * 2) / 3)],
    labels[labels.length - 1],
  ];
}

function shortEndpointLabel(endpoint: AnalyticsEndpointSummary) {
  return endpoint.endpoint.includes("/mc/") ? "MC Val" : "Load Lkp";
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

function formatUpdatedTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRowTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusTone(statusFamily: AnalyticsRecentRequest["status_family"]) {
  if (statusFamily === "5xx") {
    return "border-rose-200 bg-rose-100 text-rose-800";
  }

  if (statusFamily === "4xx") {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }

  return "border-emerald-200 bg-emerald-100 text-emerald-800";
}

function methodTone(method: string) {
  return method === "POST"
    ? "border border-blue-100 bg-blue-50 text-blue-600"
    : "border border-purple-100 bg-purple-50 text-purple-600";
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8-8 8-4-4-6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7Z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6L11 5H5a2 2 0 0 0-2 2Z" />
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function BreadcrumbChevron() {
  return (
    <svg className="mx-2 hidden h-4 w-4 text-zinc-400 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0-3-3m3 3 3-3m2 8H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m10 20 4-16m4 4 4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function DatabaseStackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
