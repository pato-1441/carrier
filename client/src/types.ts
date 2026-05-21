export type AnalyticsRange = "1h" | "24h" | "7d";

export type AnalyticsAlert = {
  severity: "critical" | "warning" | "healthy";
  title: string;
  message: string;
};

export type AnalyticsStatusBreakdown = {
  label: "2xx" | "4xx" | "5xx";
  count: number;
  share: number;
};

export type AnalyticsTrendPoint = {
  bucket_start: string;
  label: string;
  total_requests: number;
  error_4xx: number;
  error_5xx: number;
  avg_latency_ms: number;
};

export type AnalyticsEndpointSummary = {
  endpoint: string;
  event_type: "mc_validation" | "load_lookup";
  total_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  last_seen_at: string | null;
};

export type AnalyticsRecentRequest = {
  request_id: string;
  timestamp: string;
  method: string;
  path: string;
  endpoint: string;
  status_code: number;
  duration_ms: number;
  input: string;
  normalized_input: string;
  event_type: "mc_validation" | "load_lookup";
  status_family: "2xx" | "4xx" | "5xx";
  error?: string;
};

export type AnalyticsDashboardData = {
  range: AnalyticsRange;
  generated_at: string;
  totals: {
    total_requests: number;
    success_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    error_4xx: number;
    error_5xx: number;
  };
  status_breakdown: AnalyticsStatusBreakdown[];
  endpoints: AnalyticsEndpointSummary[];
  trend: AnalyticsTrendPoint[];
  recent_requests: AnalyticsRecentRequest[];
  alert: AnalyticsAlert;
};
