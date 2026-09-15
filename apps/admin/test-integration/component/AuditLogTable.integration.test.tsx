import { getActionLabel } from '@admin/components/audit/auditLogDisplay';
import { buildConditions } from '@admin/components/audit/auditLogTable.helpers';
import { describe, expect, it } from 'vitest';

describe('AuditLogTable buildConditions', () => {
  it('preserves unknown actions in labels and search conditions', () => {
    expect(getActionLabel('auth.login.password.failure')).toBe(
      'auth.login.password.failure',
    );
    expect(getActionLabel('external.import.success')).toBe(
      'external.import.success',
    );
    expect(
      buildConditions(
        { actions: ['external.import.success'], outcome: 'failure' },
        {},
      ),
    ).toMatchObject({
      actions: ['external.import.success'],
      outcome: 'failure',
    });
  });

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
});
