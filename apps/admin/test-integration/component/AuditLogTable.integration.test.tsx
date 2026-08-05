import { buildConditions } from '@admin/pages/audit-logs/components/AuditLogTable';
import { targetTypeLabels } from '@admin/pages/audit-logs/components/auditLogDisplay';
import { describe, expect, it } from 'vitest';

describe('AuditLogTable buildConditions', () => {
  it('maps trimmed request and trace ids into audit log search conditions', () => {
    expect(
      buildConditions(
        {
          requestId: ' req-1 ',
          traceId: ' 11111111111111111111111111111111 ',
        },
        {},
      ),
    ).toMatchObject({
      requestId: 'req-1',
      traceId: '11111111111111111111111111111111',
    });
  });

  it('labels the exact Principal Session audit target', () => {
    expect(targetTypeLabels.principal_session).toBe('Principal Session');
  });
});
