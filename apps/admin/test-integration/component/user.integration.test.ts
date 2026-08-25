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

  it('passes search params to admin.user.search query', () => {
    const params = {
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: '张三' },
        exactConditions: { statuses: [UserStatus.Enable] },
      },
    };

    searchUsers(params as Parameters<typeof searchUsers>[0]);

    expect(userSearchQuery).toHaveBeenCalledWith(params);
  });

  it('wraps detail and every User mutation procedure', () => {
    getUser('zhangsan');
    createUser({ username: 'zhangsan' } as Parameters<typeof createUser>[0]);
    updateUser('zhangsan', { name: '张三丰' });
    updateUserStatus('zhangsan', UserStatus.Pause);
    deleteUser('zhangsan');
    resetUserPassword('zhangsan');
    generateRandomPassword();

    expect(userDetailQuery).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userCreateMutate).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userUpdateMutate).toHaveBeenCalledWith({
      username: 'zhangsan',
      data: { name: '张三丰' },
    });
    expect(userUpdateStatusMutate).toHaveBeenCalledWith({
      username: 'zhangsan',
      status: UserStatus.Pause,
    });
    expect(userDeleteMutate).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userResetPasswordMutate).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userGeneratePasswordQuery).toHaveBeenCalledWith(undefined);
  });
});
