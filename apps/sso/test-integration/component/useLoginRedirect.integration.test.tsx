import { useLoginRedirect } from '@sso/pages/login/_hooks/useLoginRedirect';
import { describe, expect, it } from 'vitest';
import { renderHook } from '~sso/test/render';

describe('useLoginRedirect', () => {
  it('preserves percent-encoded pathname bytes across the login relay', () => {
    window.history.pushState(
      {},
      '',
      '/portal/login?client=independent&redirectUrl=https%3A%2F%2Fclient.example.com%2Fcallback%252Ftenant',
    );

    const result = renderHook(() => useLoginRedirect());

    expect(result.result.current.redirectUrl).toBe(
      'https://client.example.com/callback%2Ftenant',
    );
  });
});
