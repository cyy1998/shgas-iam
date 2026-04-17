export default function access(initialState: {
  currentUser?: { username: string; roles: string[] };
}) {
  const roles = initialState?.currentUser?.roles ?? [];

  return {
    isAdmin: roles.includes('iam:admin'),
  };
}
