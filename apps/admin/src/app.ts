// 运行时配置

import { HR_MANUAL_PATH } from "@admin/admin-route-registry";
import shanghaiGasLogo from "@admin/assets/logo.png";
import AvatarDropdown from "@admin/components/RightContent/AvatarDropdown";
import { SSO_CLIENT_CODE } from "@admin/constants/config";
import type { CurrentAdminUser } from "@admin/lib/current-admin-user";
import { getAdminCapabilitySummary } from "@admin/services/authorization";
import { loadCurrentAdminUser } from "@admin/services/current-user";
import { redirectToLogin, restoreLoginRedirectState } from "@admin/utils/auth";
import { QuestionCircleOutlined } from "@ant-design/icons";
import type { AdminCapabilitySummary } from "@iam/contracts";
import { UNAUTHORIZED } from "@iam/contracts/http";
import { history, Link } from "@umijs/max";
import { ConfigProvider } from "antd";
import { createElement, type ReactElement } from "react";
import "./global.less";
import { adminTheme } from "./theme";

ConfigProvider.config({
  holderRender: (children) => children,
  theme: adminTheme,
});

type InitialState = {
  currentUser?: CurrentAdminUser;
  capabilities?: AdminCapabilitySummary;
};

if (typeof window !== "undefined") {
  restoreLoginRedirectState();
}

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
export async function getInitialState(): Promise<InitialState> {
  try {
    const result = await loadCurrentAdminUser();
    if (result.kind === "unauthenticated") {
      redirectToLogin();
      return new Promise(() => {});
    }

    if (result.kind === "available") {
      const currentUser = result.user;
      const isHelpPage = history.location.pathname.replace(/\/$/, "") === `/iam-admin${HR_MANUAL_PATH}`;

      let capabilities: AdminCapabilitySummary;
      try {
        capabilities = await getAdminCapabilitySummary();
      } catch {
        if (!isHelpPage) history.replace("/403");
        return { currentUser };
      }

      if (capabilities.visibleModules.length === 0 && !isHelpPage) {
        history.replace("/403");
      }
      return { capabilities, currentUser };
    }
  } catch {
    // 保留当前入口；读取或响应校验失败不触发认证重定向。
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
        if (error?.response?.status === UNAUTHORIZED) {
          redirectToLogin();
          return new Promise(() => {});
        }
        return Promise.reject(error);
      },
    ],
  ],
};

export const layout = ({ initialState }: { initialState?: InitialState }) => {
  const username = initialState?.currentUser?.username ?? "";
  const name = initialState?.currentUser?.name || username;
  const displayName = username && name ? `${name}(${username})` : username;
  const avatarText = name?.[0] ?? username?.[0] ?? "";
  const renderBrand = () =>
    createElement("div", { className: "iam-admin-brand" }, [
      createElement("img", {
        alt: "上海燃气",
        className: "iam-admin-brand-logo",
        key: "logo",
        src: shanghaiGasLogo,
      }),
      createElement("div", { className: "iam-admin-brand-title", key: "title" }, [
        createElement("span", { key: "iam" }, "IAM"),
        createElement("span", { key: "console" }, "控制台"),
      ]),
    ]);

  return {
    title: "上海燃气 IAM",
    logo: false,
    layout: "mix" as const,
    splitMenus: false,
    token: { header: { heightLayoutHeader: 64 } },
    headerTitleRender: renderBrand,
    actionsRender: () => [
      createElement(Link, { to: HR_MANUAL_PATH, key: "help", className: "iam-admin-help-link" }, [
        createElement(QuestionCircleOutlined, { key: "icon", "aria-hidden": true }),
        createElement("span", { key: "label" }, "使用帮助"),
      ]),
    ],
    menu: {
      locale: false,
    },
    menuHeaderRender: (_logo: unknown, _title: unknown, props?: { isMobile?: boolean }) =>
      props?.isMobile === false ? null : renderBrand(),
    avatarProps: {
      size: 32,
      style: { fontSize: 18 },
      title: displayName,
      children: avatarText,
      className: "iam-admin-user-avatar",
      render: (_: unknown, dom: ReactElement) => createElement(AvatarDropdown, null, dom),
    },
  };
};
