import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  createUser,
  deleteUser,
  resetUserPassword,
  updateUser,
  updateUserStatus,
} from '@admin/services/user';
import { ApiErrorCode, UserStatus, UserType } from '@iam/contracts';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '~admin/test/mocks/server';

vi.mock('@admin/constants/config', () => ({
  API_PREFIX: 'http://localhost',
  SSO_CLIENT_CODE: 'iam-admin',
}));

const commands = [
  {
    procedure: 'create',
    run: () =>
      createUser({
        username: 'new-user',
        name: '新用户',
        userType: UserType.Formal,
      }),
  },
  {
    procedure: 'update',
    run: () => updateUser('new-user', { name: '新用户' }),
  },
  { procedure: 'resetPassword', run: () => resetUserPassword('new-user') },
  {
    procedure: 'updateStatus',
    run: () => updateUserStatus('new-user', UserStatus.Pause),
  },
  { procedure: 'delete', run: () => deleteUser('new-user') },
];

describe('user service mutation protocol', () => {
  it.each(commands)(
    'returns the unified result for $procedure',
    async ({ procedure, run }) => {
      const outcome = {
        changed: procedure === 'create',
        result:
          procedure === 'create'
            ? {
                user: { username: 'new-user' },
                username: 'new-user',
                generatedPassword: 'initial-password',
              }
            : procedure === 'resetPassword'
              ? 'new-password'
              : null,
      };
      server.use(
        http.post(`*/rpc/admin.user.${procedure}`, () =>
          HttpResponse.json([{ result: { data: outcome } }]),
        ),
      );
      const result = await run();
      expect(result).toEqual(outcome);
    },
  );

  it.each(commands)(
    'classifies explicit committed failure for $procedure without replaying',
    async ({ procedure, run }) => {
      const handler = vi.fn(() =>
        HttpResponse.json(
          [
            {
              error: {
                message: 'internal propagation failure',
                code: -32603,
                data: {
                  code: 'INTERNAL_SERVER_ERROR',
                  httpStatus: 500,
                  serviceCode: ApiErrorCode.AdminMutationCommitted,
                },
              },
            },
          ],
          { status: 500 },
        ),
      );
      server.use(http.post(`*/rpc/admin.user.${procedure}`, handler));
      const error = await run().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(AdminMutationCommittedError);
      expect(error).toMatchObject({
        message: '操作已生效，但后续处理失败，请刷新确认并联系管理员修复',
      });
      expect(handler).toHaveBeenCalledTimes(1);
    },
  );

  it.each([400, 404, 409, 500])(
    'does not mistake HTTP %s failures for committed outcomes',
    async (status) => {
      server.use(
        http.post('*/rpc/admin.user.update', () =>
          HttpResponse.json(
            [
              {
                error: {
                  message: '请求失败',
                  code: -32603,
                  data: { httpStatus: status },
                },
              },
            ],
            { status },
          ),
        ),
      );
      const error = await updateUser('new-user', { name: '新用户' }).catch(
        (cause: unknown) => cause,
      );
      expect(error).not.toBeInstanceOf(AdminMutationCommittedError);
      expect(error).toMatchObject({ message: '请求失败' });
    },
  );
});
