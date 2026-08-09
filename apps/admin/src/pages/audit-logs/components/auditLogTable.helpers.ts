import type { AuditLogSearchConditions } from '@admin/services/audit';

function trimValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function compactConditions(
  conditions: Partial<AuditLogSearchConditions>,
): AuditLogSearchConditions {
  return Object.fromEntries(
    Object.entries(conditions).filter(([, value]) => value !== undefined),
  ) as AuditLogSearchConditions;
}

export function buildConditions(
  params: Record<string, unknown>,
  fixedConditions: Partial<AuditLogSearchConditions>,
) {
  const range = params.eventTimeRange;
  const [from, to] = Array.isArray(range) ? range : [];
  const actions = Array.isArray(params.actions)
    ? params.actions.filter(
        (value): value is string => typeof value === 'string',
      )
    : undefined;

  return compactConditions({
    actions: actions && actions.length > 0 ? actions : undefined,
    outcome: trimValue(params.outcome) as AuditLogSearchConditions['outcome'],
    actorType: trimValue(
      params.actorType,
    ) as AuditLogSearchConditions['actorType'],
    actorKeyword: trimValue(params.actorKeyword),
    targetType: trimValue(
      params.targetType,
    ) as AuditLogSearchConditions['targetType'],
    targetKeyword: trimValue(params.targetKeyword),
    requestId: trimValue(params.requestId),
    traceId: trimValue(params.traceId),
    eventTimeFrom: from ? new Date(String(from)) : undefined,
    eventTimeTo: to ? new Date(String(to)) : undefined,
    ...fixedConditions,
  });
}
