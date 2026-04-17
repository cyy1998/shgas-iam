// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState(): Promise<{
  currentUser?: { username: string; roles: string[] };
}> {
  try {
    const res = await fetch('/public/user-info', {
      credentials: 'include',
    });

    if (res.status === 401) {
      const redirectUrl = encodeURIComponent(window.location.href);
      window.location.href = `/sso/authorize?client=iam&redirectUrl=${redirectUrl}`;
      return new Promise(() => {});
    }

    if (res.ok) {
      const body = await res.json();
      const roles = (body.data.roles as string[]) ?? [];

      if (!roles.includes('iam:admin')) {
        // Logged in but not an admin
        window.location.href = '/403';
        return new Promise(() => {});
      }

      return {
        currentUser: {
          username: body.data.username as string,
          roles,
        },
      };
    }
  } catch {
    // Network error — don't redirect
  }
  return {};
}

export const layout = () => {
  return {
    logo: 'https://img.alicdn.com/tfs/TB1YHEpwUT1gK0jSZFhXXaAtVXa-28-27.svg',
    menu: {
      locale: false,
    },
  };
};
