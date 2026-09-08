import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  clearPrimaryEmployment,
  createEmployment,
  endEmployment,
  pauseEmployment,
  resignUser,
  resumeEmployment,
  setPrimaryEmployment,
  transferEmployment,
  updateEmployment,
} from '@admin/services/employment';
import { ApiErrorCode } from '@iam/contracts';
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
      createEmployment({
        username: 'u',
        orgCode: 'ORG',
        posCode: 'DEV',
        isPrimary: false,
      }),
  },
  {
    procedure: 'update',
    run: () => updateEmployment(42, { description: '备注' }),
  },
  { procedure: 'pause', run: () => pauseEmployment(42) },
  { procedure: 'resume', run: () => resumeEmployment(42, 'ORG') },
  { procedure: 'end', run: () => endEmployment(42) },
  { procedure: 'resignUser', run: () => resignUser('zhangsan') },
  { procedure: 'setPrimary', run: () => setPrimaryEmployment(42) },
  { procedure: 'clearPrimary', run: () => clearPrimaryEmployment(42) },
  {
    procedure: 'transfer',
    run: () =>
      transferEmployment(42, {
        newOrgCode: 'ORG',
        newPosCode: 'DEV',
        isPrimary: false,
      }),
  },
];

describe('employment service mutation protocol', () => {
  it.each(commands)(
    'returns the unified result for $procedure',
    async ({ procedure, run }) => {
      const outcome = {
        changed: ['create', 'transfer'].includes(procedure),
        result: ['create', 'transfer'].includes(procedure) ? { id: 42 } : null,
      };
      server.use(
        http.post(`*/rpc/admin.employment.${procedure}`, () =>
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
      server.use(http.post(`*/rpc/admin.employment.${procedure}`, handler));
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
        http.post('*/rpc/admin.employment.update', () =>
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
      const error = await updateEmployment(42, { description: '备注' }).catch(
        (cause: unknown) => cause,
      );
      expect(error).not.toBeInstanceOf(AdminMutationCommittedError);
      expect(error).toMatchObject({ message: '请求失败' });
    },
  );
});
