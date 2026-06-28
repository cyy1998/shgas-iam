import { UserStatus } from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUser,
  generateRandomPassword,
  getUser,
  searchUsers,
  updateUserStatus,
} from '../user';

const userSearchQuery = vi.hoisted(() => vi.fn());
const userDetailQuery = vi.hoisted(() => vi.fn());
const userCreateMutate = vi.hoisted(() => vi.fn());
const userUpdateStatusMutate = vi.hoisted(() => vi.fn());
const userGeneratePasswordQuery = vi.hoisted(() => vi.fn());

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      user: {
        search: { query: userSearchQuery },
        detail: { query: userDetailQuery },
        create: { mutate: userCreateMutate },
        updateStatus: { mutate: userUpdateStatusMutate },
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

  it('wraps detail, create, status and password procedures', () => {
    getUser('zhangsan');
    createUser({ username: 'zhangsan' } as Parameters<typeof createUser>[0]);
    updateUserStatus('zhangsan', UserStatus.Pause);
    generateRandomPassword();

    expect(userDetailQuery).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userCreateMutate).toHaveBeenCalledWith({ username: 'zhangsan' });
    expect(userUpdateStatusMutate).toHaveBeenCalledWith({
      username: 'zhangsan',
      status: UserStatus.Pause,
    });
    expect(userGeneratePasswordQuery).toHaveBeenCalledWith(undefined);
  });
});
