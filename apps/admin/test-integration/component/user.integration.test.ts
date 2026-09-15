import {
  createUser,
  deleteUser,
  generateRandomPassword,
  getUser,
  resetUserPassword,
  searchUsers,
  updateUser,
  updateUserStatus,
} from '@admin/services/user';
import { UserStatus } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const userSearchQuery = vi.hoisted(() => vi.fn());
const userDetailQuery = vi.hoisted(() => vi.fn());
const userCreateMutate = vi.hoisted(() => vi.fn());
const userUpdateMutate = vi.hoisted(() => vi.fn());
const userUpdateStatusMutate = vi.hoisted(() => vi.fn());
const userDeleteMutate = vi.hoisted(() => vi.fn());
const userResetPasswordMutate = vi.hoisted(() => vi.fn());
const userGeneratePasswordQuery = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      user: {
        search: { query: userSearchQuery },
        detail: { query: userDetailQuery },
        create: { mutate: userCreateMutate },
        update: { mutate: userUpdateMutate },
        updateStatus: { mutate: userUpdateStatusMutate },
        delete: { mutate: userDeleteMutate },
        resetPassword: { mutate: userResetPasswordMutate },
        generatePassword: { query: userGeneratePasswordQuery },
      },
    },
  },
}));

describe('user service wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes search params to admin.user.search query', async () => {
    const params = {
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: '张三' },
        exactConditions: { statuses: [UserStatus.Enable] },
      },
    };

    await searchUsers(params as Parameters<typeof searchUsers>[0]);

    expect(userSearchQuery).toHaveBeenCalledWith(params);
  });

  it.each([
    {
      name: 'detail',
      call: () => getUser('zhangsan'),
      port: userDetailQuery,
      input: { username: 'zhangsan' },
    },
    {
      name: 'create',
      call: () =>
        createUser({ username: 'zhangsan' } as Parameters<
          typeof createUser
        >[0]),
      port: userCreateMutate,
      input: { username: 'zhangsan' },
    },
    {
      name: 'update',
      call: () => updateUser('zhangsan', { name: '张三丰' }),
      port: userUpdateMutate,
      input: { username: 'zhangsan', data: { name: '张三丰' } },
    },
    {
      name: 'status',
      call: () => updateUserStatus('zhangsan', UserStatus.Pause),
      port: userUpdateStatusMutate,
      input: { username: 'zhangsan', status: UserStatus.Pause },
    },
    {
      name: 'delete',
      call: () => deleteUser('zhangsan'),
      port: userDeleteMutate,
      input: { username: 'zhangsan' },
    },
    {
      name: 'reset password',
      call: () => resetUserPassword('zhangsan'),
      port: userResetPasswordMutate,
      input: { username: 'zhangsan' },
    },
    {
      name: 'generate password',
      call: () => generateRandomPassword(),
      port: userGeneratePasswordQuery,
      input: undefined,
    },
  ])('maps $name input to its procedure', async ({ call, port, input }) => {
    await call();
    expect(port).toHaveBeenCalledWith(input);
  });
});
