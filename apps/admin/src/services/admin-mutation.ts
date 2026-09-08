import { ApiErrorCode } from '@iam/contracts';

export class AdminMutationCommittedError extends Error {
  constructor(cause: unknown) {
    super('操作已生效，但后续处理失败，请刷新确认并联系管理员修复');
    this.name = AdminMutationCommittedError.name;
    this.cause = cause;
  }
}

export async function runAdminMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  try {
    return await mutation();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'data' in error &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'serviceCode' in error.data &&
      error.data.serviceCode === ApiErrorCode.AdminMutationCommitted
    ) {
      throw new AdminMutationCommittedError(error);
    }
    throw error;
  }
}
