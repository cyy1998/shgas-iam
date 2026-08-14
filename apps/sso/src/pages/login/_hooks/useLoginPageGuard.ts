import {
  checkCustomSsoLoginPageGuard,
  checkOidcLoginPageGuard,
} from '@sso/services/login-page-guard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidOidcReturnHandle } from './oidc-return';

export type LoginPageGuardStatus =
  | 'checking'
  | 'continuing'
  | 'invalid_request'
  | 'login'
  | 'unavailable'
  | 'unsafe';

const GUARD_TIMEOUT_MS = 10_000;

function initialStatus(input: {
  isUnsafeEntry: boolean;
  oidcReturn: string;
}): LoginPageGuardStatus {
  if (input.isUnsafeEntry)
    return 'unsafe';
  if (input.oidcReturn && !isValidOidcReturnHandle(input.oidcReturn))
    return 'invalid_request';
  return 'checking';
}

export function useLoginPageGuard(input: {
  client: string;
  isUnsafeEntry: boolean;
  isContinuationReady: boolean;
  oidcReturn: string;
  redirectAfterLogin: () => void;
  redirectUrl: string;
  state?: string;
}) {
  const {
    client,
    isContinuationReady,
    isUnsafeEntry,
    oidcReturn,
    redirectAfterLogin,
    redirectUrl,
    state,
  } = input;
  const continuationKey = JSON.stringify([
    client,
    isUnsafeEntry,
    oidcReturn,
    redirectUrl,
    state,
  ]);
  const continuationInitialStatus = initialStatus({
    isUnsafeEntry,
    oidcReturn,
  });
  const [attempt, setAttempt] = useState(0);
  const requestGenerationRef = useRef(0);
  const [guardState, setGuardState] = useState<{
    continuationKey: string;
    status: LoginPageGuardStatus;
  }>(() => ({
    continuationKey,
    status: continuationInitialStatus,
  }));
  const continuationChanged = guardState.continuationKey !== continuationKey;
  if (continuationChanged) {
    setGuardState({
      continuationKey,
      status: continuationInitialStatus,
    });
  }
  const status = continuationChanged
    ? continuationInitialStatus
    : guardState.status;

  useEffect(() => {
    if (isUnsafeEntry)
      return;
    if (oidcReturn && !isValidOidcReturnHandle(oidcReturn))
      return;
    const requestGeneration = ++requestGenerationRef.current;
    const abortController = new AbortController();
    void (async () => {
      let timeout: number | undefined;
      try {
        const guardRequest = oidcReturn
          ? checkOidcLoginPageGuard(oidcReturn, abortController.signal)
          : checkCustomSsoLoginPageGuard(
              { client, redirectUrl, state },
              abortController.signal,
            );
        const outcome = await Promise.race([
          guardRequest,
          new Promise<never>((_resolve, reject) => {
            timeout = window.setTimeout(() => {
              abortController.abort();
              reject(new Error('login page guard timed out'));
            }, GUARD_TIMEOUT_MS);
          }),
        ]);
        if (requestGenerationRef.current !== requestGeneration)
          return;
        if (outcome === 'continue') {
          setGuardState({ continuationKey, status: 'continuing' });
          return;
        }
        setGuardState({ continuationKey, status: outcome });
      }
      catch {
        if (requestGenerationRef.current === requestGeneration) {
          setGuardState({ continuationKey, status: 'unavailable' });
        }
      }
      finally {
        if (timeout !== undefined)
          window.clearTimeout(timeout);
      }
    })();
    return () => {
      abortController.abort();
      if (requestGenerationRef.current === requestGeneration)
        requestGenerationRef.current += 1;
    };
  }, [
    attempt,
    client,
    continuationInitialStatus,
    continuationKey,
    isUnsafeEntry,
    oidcReturn,
    redirectUrl,
    state,
  ]);

  useEffect(() => {
    if (status === 'continuing' && isContinuationReady)
      redirectAfterLogin();
  }, [isContinuationReady, redirectAfterLogin, status]);

  const retry = useCallback(() => {
    setGuardState({ continuationKey, status: 'checking' });
    setAttempt(value => value + 1);
  }, [continuationKey]);
  return { retry, status };
}
