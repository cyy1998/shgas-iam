import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import { ApiErrorCode } from '@iam/contracts';
import { TRPCClientError } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { runAdminMutation } from './admin-mutation';

const client = apiClient.admin.clientSso;
type Inputs = inferRouterInputs<AppRouter>['admin']['clientSso'];
type Outputs = inferRouterOutputs<AppRouter>['admin']['clientSso'];
export type ClientSsoDetail = Outputs['detail'];
export type ClientSsoConfig = Inputs['selectProtocol']['data']['config'];
export type ClientSsoSecret = Outputs['readSecret'];

export class ClientSsoSecretReadError extends Error {}

export class ClientSsoMutationRejectedError extends Error {
  constructor(cause: unknown) {
    super('操作被拒绝，请检查输入和权限后再发起操作。', { cause });
    this.name = ClientSsoMutationRejectedError.name;
  }
}

async function runClientSsoMutation<T>(operation: () => Promise<T>) {
  try {
    return await runAdminMutation(operation);
  } catch (error) {
    if (
      error instanceof TRPCClientError &&
      error.data?.httpStatus >= 400 &&
      error.data?.httpStatus < 500
    ) {
      throw new ClientSsoMutationRejectedError(error);
    }
    throw error;
  }
}

export const clientSsoService = {
  rotateSecret: (clientCode: string) =>
    runClientSsoMutation(() => client.rotateSecret.mutate({ clientCode })),
  readSecret: async (clientCode: string) => {
    try {
      return await client.readSecret.mutate({ clientCode });
    } catch (error) {
      throw new ClientSsoSecretReadError(
        error instanceof TRPCClientError &&
          error.data?.serviceCode ===
            ApiErrorCode.AdminClientSecretReadAuditFailed
          ? '读取审计未确认，未交付 Secret。可主动重新读取当前值。'
          : '当前 Secret 未取得，可能是响应丢失或权限不足。可核对权限后主动重新读取；不会自动轮换或重试。',
      );
    }
  },
  detail: (clientCode: string) => client.detail.query({ clientCode }),
  save: (clientCode: string, data: Inputs['save']['data']) =>
    runClientSsoMutation(() => client.save.mutate({ clientCode, data })),
  selectProtocol: (clientCode: string, config: ClientSsoConfig) =>
    runClientSsoMutation(() =>
      client.selectProtocol.mutate({ clientCode, data: { config } }),
    ),
  setEnabled: (clientCode: string, enabled: boolean) =>
    runClientSsoMutation(() =>
      client.setEnabled.mutate({ clientCode, data: { enabled } }),
    ),
};
