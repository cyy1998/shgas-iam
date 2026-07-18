import { ApiErrorCode } from '@iam/contracts';
import { message } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceError } from '../../utils/request';
import { withHumanVerification } from '../human-verification';

const capSolve = vi.hoisted(() => vi.fn());

vi.mock('cap-widget', () => {
  function MockCap() {
    return {
      solve: capSolve,
    };
  }

  return { default: vi.fn(MockCap) };
});

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    message: {
      ...actual.message,
      error: vi.fn(),
    },
  };
});

describe('withHumanVerification', () => {
  afterEach(() => {
    capSolve.mockReset();
    vi.mocked(message.error).mockReset();
    window.CAP_CUSTOM_FETCH = undefined;
  });

  it('returns the original operation result when no verification is required', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const retryOperation = vi.fn();

    await expect(
      withHumanVerification('passwordLogin', operation, retryOperation),
    ).resolves.toBe('ok');

    expect(retryOperation).not.toHaveBeenCalled();
  });

  it('solves Cap and retries with the returned token', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(
        new ServiceError(
          '需要安全校验',
          ApiErrorCode.HumanVerificationRequired,
        ),
      );
    const retryOperation = vi.fn().mockResolvedValue('verified');
    capSolve.mockResolvedValue({ success: true, token: 'cap-token' });

    await expect(
      withHumanVerification('mobileLogin', operation, retryOperation),
    ).resolves.toBe('verified');

    expect(retryOperation).toHaveBeenCalledWith('cap-token');
    expect(window.CAP_CUSTOM_FETCH).toBeUndefined();
  });

  it('reports Cap failure and throws a service error without retrying', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(
        new ServiceError(
          '需要安全校验',
          ApiErrorCode.HumanVerificationRequired,
        ),
      );
    const retryOperation = vi.fn();
    capSolve.mockResolvedValue({ success: false });

    await expect(
      withHumanVerification('sendSmsCode', operation, retryOperation),
    ).rejects.toMatchObject({
      code: ApiErrorCode.HumanVerificationRequired,
      message: '安全校验失败，请重试',
    });

    expect(message.error).toHaveBeenCalledWith('安全校验失败，请重试');
    expect(retryOperation).not.toHaveBeenCalled();
  });
});
