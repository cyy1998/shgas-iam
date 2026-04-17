import { ADMIN_ROLE_CODE } from '@/constants/config';

export default function access(initialState: {
  currentUser?: { username: string; roles: string[] };
}) {
  const roles = initialState?.currentUser?.roles ?? [];

  return {
    isAdmin: roles.includes(ADMIN_ROLE_CODE),
  };
}
