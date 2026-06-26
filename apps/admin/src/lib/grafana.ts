import { GRAFANA_URL, SYSTEM_LOG_ENV } from '@admin/constants/config';

const REQUEST_DRILLDOWN_PATH = '/d/iam-request-drilldown/iam-request-drilldown';
const OVERVIEW_PATH = '/d/iam-overview/iam-overview';
const REQUEST_WINDOW_MS = 5 * 60 * 1000;

function normalizeService(sourceApp?: string | null) {
  if (sourceApp === 'iam-api') return 'api';
  if (sourceApp === 'iam-admin') return 'admin-api';
  if (sourceApp === 'iam-admin-api') return 'admin-api';
  if (sourceApp === 'iam-oidc-provider') return 'oidc-provider';
  if (sourceApp === 'apisix') return 'apisix';
  return 'All';
}

function buildGrafanaUrl(path: string) {
  if (!GRAFANA_URL) return null;
  return new URL(`${GRAFANA_URL}${path}`);
}

export function buildGrafanaOverviewUrl() {
  const url = buildGrafanaUrl(OVERVIEW_PATH);
  if (!url) return null;
  url.searchParams.set('orgId', '1');
  url.searchParams.set('var-env', SYSTEM_LOG_ENV);
  return url.toString();
}

export function buildAuditLogGrafanaUrl(input: {
  requestId?: string | null;
  traceId?: string | null;
  sourceApp?: string | null;
  eventTime?: string | Date | null;
}) {
  if (!input.requestId) return null;
  const url = buildGrafanaUrl(REQUEST_DRILLDOWN_PATH);
  if (!url) return null;

  const eventTime = input.eventTime ? new Date(input.eventTime).getTime() : Date.now();
  const center = Number.isFinite(eventTime) ? eventTime : Date.now();

  url.searchParams.set('orgId', '1');
  url.searchParams.set('from', String(center - REQUEST_WINDOW_MS));
  url.searchParams.set('to', String(center + REQUEST_WINDOW_MS));
  url.searchParams.set('var-env', SYSTEM_LOG_ENV);
  url.searchParams.set('var-service', normalizeService(input.sourceApp));
  url.searchParams.set('var-requestId', input.requestId);
  url.searchParams.set('var-traceId', input.traceId || '.*');
  return url.toString();
}
