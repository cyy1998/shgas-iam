import { AdminMutationCommittedError } from '@admin/services/admin-mutation';
import {
  createPosition,
  deletePosition,
  updatePosition,
  updatePositionStatus,
} from '@admin/services/position';
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
    run: () => createPosition({ posCode: 'DEV', posName: '开发', status: 1 }),
  },
  {
    procedure: 'update',
    run: () => updatePosition('DEV', { posName: '开发' }),
  },
  { procedure: 'updateStatus', run: () => updatePositionStatus('DEV', 1) },
  { procedure: 'delete', run: () => deletePosition('DEV') },
];

describe('position service mutation protocol', () => {
  it.each(commands)(
    'returns the unified result for $procedure',
    async ({ procedure, run }) => {
      const outcome = {
        changed: procedure === 'create',
        result:
          procedure === 'create' ? { posCode: 'DEV', posName: '开发' } : null,
      };
      server.use(
        http.post(`*/rpc/admin.position.${procedure}`, () =>
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
      server.use(http.post(`*/rpc/admin.position.${procedure}`, handler));
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
        http.post('*/rpc/admin.position.update', () =>
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
      const error = await updatePosition('DEV', { posName: '开发' }).catch(
        (cause: unknown) => cause,
      );
      expect(error).not.toBeInstanceOf(AdminMutationCommittedError);
      expect(error).toMatchObject({ message: '请求失败' });
    },
  );
});
