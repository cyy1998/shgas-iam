import {
  CAP_API_ENDPOINT,
  CAP_PAKO_URL,
  CAP_WASM_URL,
} from '@sso/constants/config';
import type { HumanVerificationAction } from '@sso/types/api';
import { ServiceError } from '@sso/utils/request';
import { ApiErrorCode } from '@iam/contracts';
import { message } from 'antd';

type Operation<T> = () => Promise<T>;
type RetryOperation<T> = (capToken: string) => Promise<T>;

function configureCapAssetUrls() {
  window.CAP_CUSTOM_WASM_URL = CAP_WASM_URL;
  window.CAP_PAKO_URL = CAP_PAKO_URL;
}

async function solveCap(action: HumanVerificationAction): Promise<string> {
  configureCapAssetUrls();
  const { default: Cap } = await import('cap-widget');
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
      error.code !== ApiErrorCode.HumanVerificationRequired
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
      ApiErrorCode.HumanVerificationRequired,
    );
  }
  return await retryOperation(capToken);
}
