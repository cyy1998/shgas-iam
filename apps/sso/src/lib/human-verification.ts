import { CAP_API_ENDPOINT } from '@sso/constants/config';
import type { HumanVerificationAction } from '@sso/types/api';
import { ServiceError } from '@sso/utils/request';
import { ServiceStatusCode } from '@iam/contracts';
import { message } from 'antd';
import Cap from 'cap-widget';

type Operation<T> = () => Promise<T>;
type RetryOperation<T> = (capToken: string) => Promise<T>;

async function solveCap(action: HumanVerificationAction): Promise<string> {
  const previousFetch = window.CAP_CUSTOM_FETCH;

  window.CAP_CUSTOM_FETCH = (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('X-Cap-Action', action);
    return (previousFetch ?? fetch)(input, {
      ...init,
      headers,
    });
  };

  try {
    const cap = new Cap({ apiEndpoint: CAP_API_ENDPOINT });
    const result = await cap.solve();
    if (!result.success || !result.token) {
      throw new Error('Cap solve failed');
    }
    return result.token;
  } finally {
    window.CAP_CUSTOM_FETCH = previousFetch;
  }
}

export async function withHumanVerification<T>(
  action: HumanVerificationAction,
  operation: Operation<T>,
  retryOperation: RetryOperation<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      !(error instanceof ServiceError) ||
      error.code !== ServiceStatusCode.HumanVerificationRequired
    ) {
      throw error;
    }
  }

  let capToken: string;
  try {
    capToken = await solveCap(action);
  } catch (error) {
    message.error('安全校验失败，请重试');
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError(
      '安全校验失败，请重试',
      ServiceStatusCode.HumanVerificationRequired,
    );
  }
  return await retryOperation(capToken);
}
