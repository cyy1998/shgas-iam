// 运行时配置
import { ADMIN_ROLE_CODE, SSO_AUTHORIZE_URL, SSO_CLIENT_CODE } from '@/constants/config';

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState(): Promise<{
  currentUser?: { username: string; roles: string[] };
}> {
  try {
    const res = await fetch('/public/user-info', {
      credentials: 'include',
      headers: {
        Client: SSO_CLIENT_CODE,
      },
    });

    if (res.status === 401) {
      const redirectUrl = encodeURIComponent(window.location.href);
      window.location.href = `${SSO_AUTHORIZE_URL}?client=${SSO_CLIENT_CODE}&redirectUrl=${redirectUrl}`;
      return new Promise(() => {});
    }

    if (res.ok) {
      const body = await res.json();
      const roles = (body.data.roles as string[]) ?? [];

      if (!roles.includes(ADMIN_ROLE_CODE)) {
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

export const request = {
  requestInterceptors: [
    (config: any) => {
      return {
        ...config,
        headers: {
          ...config.headers,
          Client: SSO_CLIENT_CODE,
        },
      };
    },
  ],
};

export const layout = () => {
  return {
    logo: 'https://img.alicdn.com/tfs/TB1YHEpwUT1gK0jSZFhXXaAtVXa-28-27.svg',
    menu: {
      locale: false,
    },
  };
};
