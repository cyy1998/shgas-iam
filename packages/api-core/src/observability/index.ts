export interface ObservabilityContext {
  requestId?: string | null;
  traceId?: string | null;
}

export interface ObservabilityLogFields {
  requestId: string | null;
  traceId: string | null;
}

function normalizeObservabilityValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function pickObservabilityContext(input: ObservabilityContext | null | undefined): ObservabilityLogFields {
  return {
    requestId: normalizeObservabilityValue(input?.requestId),
    traceId: normalizeObservabilityValue(input?.traceId),
  };
}

export function observabilityLogFields(input: ObservabilityContext | null | undefined): ObservabilityLogFields {
  return pickObservabilityContext(input);
}
