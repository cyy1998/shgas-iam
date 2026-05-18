import { ADMIN_ROLE_CODE } from '@admin/constants/config';

export default function access(initialState: {
  currentUser?: { username: string; name: string; roles: string[] };
}) {
  const roles = initialState?.currentUser?.roles ?? [];

  return {
    isAdmin: roles.includes(ADMIN_ROLE_CODE),
  };
}
