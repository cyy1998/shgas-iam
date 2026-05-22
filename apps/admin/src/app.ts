// 运行时配置
import AvatarDropdown from '@admin/components/RightContent/AvatarDropdown';
import {
  ADMIN_ROLE_CODE,
  API_PREFIX,
  SSO_CLIENT_CODE,
} from '@admin/constants/config';
import { redirectToLogin } from '@admin/utils/auth';
import { history } from '@umijs/max';
import { createElement, type ReactElement } from 'react';
import './global.less';

type InitialState = {
  currentUser?: { username: string; name: string; roles: string[] };
};

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState(): Promise<InitialState> {
  try {
    const res = await fetch(`${API_PREFIX}/public/user-info`, {
      credentials: 'include',
      headers: {
        Client: SSO_CLIENT_CODE,
      },
    });

    if (res.status === 401) {
      redirectToLogin();
      return new Promise(() => {});
    }

    if (res.ok) {
      const body = await res.json();
      const roles = (body.data.roles as string[]) ?? [];
      const currentUser = {
        username: body.data.username as string,
        name: (body.data.name as string | undefined) ?? '',
        roles,
      };

      if (!roles.includes(ADMIN_ROLE_CODE)) {
        history.replace('/403');
        return { currentUser };
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
  responseInterceptors: [
    [
      (response: any) => response,
      (error: any) => {
        if (error?.response?.status === 401) {
          redirectToLogin();
          return new Promise(() => {});
        }
        return Promise.reject(error);
      },
    ],
  ],
};

export const layout = ({ initialState }: { initialState?: InitialState }) => {
  const username = initialState?.currentUser?.username ?? '';
  const name = initialState?.currentUser?.name || username;
  const displayName = username && name ? `${name}(${username})` : username;
  const avatarText = name?.[0] ?? username?.[0] ?? '';

  return {
    title: '上海燃气 IAM',
    logo: false,
    menu: {
      locale: false,
    },
    menuHeaderRender: () =>
      createElement('div', { className: 'iam-admin-brand' }, [
        createElement(
          'div',
          { className: 'iam-admin-brand-mark', key: 'mark' },
          'IAM',
        ),
        createElement(
          'div',
          { className: 'iam-admin-brand-copy', key: 'copy' },
          [
            createElement(
              'div',
              { className: 'iam-admin-brand-title', key: 'title' },
              '上海燃气 IAM',
            ),
            createElement(
              'div',
              { className: 'iam-admin-brand-subtitle', key: 'subtitle' },
              'Admin Console',
            ),
          ],
        ),
      ]),
    avatarProps: {
      size: 'small' as const,
      title: displayName,
      children: avatarText,
      className: 'iam-admin-user-avatar',
      render: (_: unknown, dom: ReactElement) =>
        createElement(AvatarDropdown, { children: dom }),
    },
  };
};
