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
  agent_outcomes: number;
  error_4xx: number;
  error_5xx: number;
  avg_latency_ms: number;
};

export type AnalyticsEndpointSummary = {
  endpoint: string;
  event_type: "mc_validation" | "load_lookup" | "agent_outcome";
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
  input?: string;
  normalized_input?: string;
  event_type: "mc_validation" | "load_lookup" | "agent_outcome";
  status_family: "2xx" | "4xx" | "5xx";
  error?: string;
  outcome_classification?: string;
  carrier_sentiment?: string | null;
  call_duration_ms?: number | null;
  accepted_offer_value?: number | null;
  decline_reason?: string | null;
  counteroffer_retries?: number | null;
};

export type AnalyticsOutcomeBreakdown = {
  classification: string;
  count: number;
  share: number;
  avg_call_duration_ms: number;
  total_accepted_offer_value: number;
  avg_counteroffer_retries: number;
};

export type AnalyticsDeclineReasonSummary = {
  reason: string;
  count: number;
  share: number;
};

export type AnalyticsCarrierSentimentSummary = {
  sentiment: string;
  count: number;
  share: number;
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
    total_agent_outcomes: number;
    total_carrier_sentiments: number;
    avg_call_duration_ms: number;
    total_accepted_offer_value: number;
    avg_counteroffer_retries: number;
  };
  status_breakdown: AnalyticsStatusBreakdown[];
  endpoints: AnalyticsEndpointSummary[];
  outcome_breakdown: AnalyticsOutcomeBreakdown[];
  carrier_sentiments: AnalyticsCarrierSentimentSummary[];
  decline_reasons: AnalyticsDeclineReasonSummary[];
  trend: AnalyticsTrendPoint[];
  recent_requests: AnalyticsRecentRequest[];
  alert: AnalyticsAlert;
};
