import type { UserInfo } from '@/types/api';

export default function access(initialState: { userInfo?: UserInfo | null }) {
  return {
    isLoggedIn: !!initialState?.userInfo,
  };
}
