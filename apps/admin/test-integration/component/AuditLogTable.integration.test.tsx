import {
  getActionLabel,
  outcomeLabels,
  targetTypeLabels,
} from '@admin/components/audit/auditLogDisplay';
import { buildConditions } from '@admin/components/audit/auditLogTable.helpers';
import { describe, expect, it } from 'vitest';

describe('AuditLogTable buildConditions', () => {
  it('displays canonical Chinese labels and leaves unknown actions intact', () => {
    expect(getActionLabel('auth.login')).toBe('登录');
    expect(getActionLabel('auth.login.password')).toBe('密码登录');
    expect(getActionLabel('auth.login.mobile')).toBe('手机登录');
    expect(getActionLabel('auth.login.local')).toBe('本地会话登录');
    expect(getActionLabel('auth.login.oa')).toBe('OA 登录');
    expect(getActionLabel('auth.login.wechat')).toBe('微信登录');
    expect(getActionLabel('auth.login.password.failure')).toBe(
      'auth.login.password.failure',
    );
    expect(getActionLabel('external.import.success')).toBe(
      'external.import.success',
    );
    expect(outcomeLabels.failure).toBe('失败');
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

  it('labels the exact Principal Session audit target', () => {
    expect(targetTypeLabels.principal_session).toBe('Principal Session');
  });
});
