export type Load = {
  load_id: string;
  origin: string;
  destination: string;
  pickup_datetime: string;
  delivery_datetime: string;
  equipment_type: string;
  loadboard_rate: number;
  notes: string;
  weight: number;
  commodity_type: string;
};

export type AnalyticsEvent = {
  request_id: string;
  timestamp: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  event_type: "mc_validation" | "load_lookup" | "agent_outcome";
  input?: string;
  normalized_input?: string;
  valid_format?: boolean;
  found?: boolean;
  docket_number?: string;
  load_id?: string;
  error?: string;
  outcome_classification?: string;
  outcome_reasoning?: string;
  carrier_sentiment?: string | null;
  call_duration_ms?: number | null;
  accepted_offer_value?: number | null;
  decline_reason?: string | null;
  counteroffer_retries?: number | null;
};

export type AnalyticsRange = "1h" | "24h" | "7d";

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
  event_type: AnalyticsEvent["event_type"];
  total_requests: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  last_seen_at: string | null;
};

export type AnalyticsStatusBreakdown = {
  label: "2xx" | "4xx" | "5xx";
  count: number;
  share: number;
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
  event_type: AnalyticsEvent["event_type"];
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

export type AnalyticsAlert = {
  severity: "critical" | "warning" | "healthy";
  title: string;
  message: string;
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

export type McValidationResult = {
  input: string;
  normalized_mc_number: string;
  docket_number: string;
  valid_format: boolean;
  found: boolean;
  carrier: null | {
    legal_name: string | null;
    dba_name: string | null;
    dot_number: number | null;
    mc_number: number | null;
    allowed_to_operate: boolean | null;
    out_of_service: boolean | null;
    phone: string | null;
    address: {
      street: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      country: string | null;
    };
  };
};
