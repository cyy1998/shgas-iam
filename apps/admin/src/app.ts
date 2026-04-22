// 运行时配置
import AvatarDropdown from '@/components/RightContent/AvatarDropdown';
import {
  ADMIN_ROLE_CODE,
  SSO_AUTHORIZE_URL,
  SSO_CLIENT_CODE,
} from '@/constants/config';
import { createElement, type ReactElement } from 'react';

type InitialState = { currentUser?: { username: string; roles: string[] } };

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState(): Promise<InitialState> {
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
      const currentUser = {
        username: body.data.username as string,
        roles,
      };

      if (
        !roles.includes(ADMIN_ROLE_CODE) &&
        window.location.pathname !== '/403'
      ) {
        // 非管理员跳转 403；若已在 /403 则不再跳，否则 getInitialState 永远不 resolve
        window.location.href = '/403';
        return new Promise(() => {});
      }

      return { currentUser };
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

export const layout = ({ initialState }: { initialState?: InitialState }) => {
  return {
    logo: 'https://img.alicdn.com/tfs/TB1YHEpwUT1gK0jSZFhXXaAtVXa-28-27.svg',
    menu: {
      locale: false,
    },
    avatarProps: {
      src: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
      size: 'small' as const,
      title: initialState?.currentUser?.username ?? '',
      render: (_: unknown, dom: ReactElement) =>
        createElement(AvatarDropdown, { children: dom }),
    },
  };
};
