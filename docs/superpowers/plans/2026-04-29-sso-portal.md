# SSO Portal (`apps/sso`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 monorepo 内新建 `apps/sso` (`@iam/sso`)，将 `example/sso-login` 的 SSO 登录、找回密码、个人信息、维护页 4 个页面以 UMI Max + React + Antd 重写并接入现有后端。

**Architecture:** 单页应用，UMI Max 全局 `layout: false`，4 条路由：`/login`、`/reset-password`、`/user-info`、`/system-maintenance`。SSO 端点通过 `/sso/.well-known/authentication-configuration` 动态获取并缓存到 UMI Max model；REST API 通过 `utils/request.ts` 的 fetch 封装统一解包 `{code,message,data}` 信封并处理 401/维护态分支。

**Tech Stack:** UMI Max 4.x、React 18、Ant Design 5、`@iam/shared`、TypeScript 5。

**Spec：** `docs/superpowers/specs/2026-04-29-sso-portal-design.md`

**测试策略：** 仓库当前未配置测试框架 (CLAUDE.md 明确说明)，本计划不引入 TDD。每个任务通过 `pnpm --filter @iam/sso typecheck` + 启动 `pnpm --filter @iam/sso dev` 手工冒烟来验证；每个任务完成后立即 commit。

---

## File Map

| 文件 | 责任 |
| --- | --- |
| `apps/sso/package.json` | 工作空间元数据 / 依赖 / 脚本 |
| `apps/sso/tsconfig.json` | UMI Max ts 配置 + alias |
| `apps/sso/typings.d.ts` | UMI Max 模块声明 |
| `apps/sso/.umirc.ts` | 路由 / 代理 / antd / model / initialState / layout:false |
| `apps/sso/.env.example` / `.gitignore` / `.eslintrc.js` / `.prettierrc` / `.prettierignore` / `.lintstagedrc` / `.stylelintrc.js` | 工程配置（与 admin 对齐） |
| `apps/sso/src/constants/config.ts` | `API_BASE` / `SSO_CLIENT_CODE` / `WELL_KNOWN_URL` |
| `apps/sso/src/constants/index.ts` | re-export |
| `apps/sso/src/types/api.d.ts` | `ApiEnvelope` / `UserInfo` / `AuthConfig` 等业务类型 |
| `apps/sso/src/utils/request.ts` | fetch 封装 + 信封解包 + 401 / 维护态处理 |
| `apps/sso/src/utils/form-check.ts` | 手机号 / 密码强度校验 |
| `apps/sso/src/utils/url.ts` | query string 工具 |
| `apps/sso/src/lib/sso.ts` | `fetchAuthenticationConfig` / `buildAuthorizeUrl` / `buildLogoutUrl` |
| `apps/sso/src/models/sso.ts` | UMI Max model：`authConfig` / `userInfo` 全局共享 |
| `apps/sso/src/services/auth.ts` | 登录 / 短信登录 / 登出 |
| `apps/sso/src/services/public.ts` | 当前用户 / 改密 / 改手机号 |
| `apps/sso/src/services/open.ts` | 找回密码相关 + 维护态查询 |
| `apps/sso/src/app.ts` | UMI 运行时：`getInitialState` 预拉 SSO config + user-info |
| `apps/sso/src/access.ts` | 简单访问策略（user-info 必须有 userInfo） |
| `apps/sso/src/assets/{bg.jpg,logo.png,password1.png,password2.png,password3.png,password_no2.png,password_no3.png}` | 静态资源 |
| `apps/sso/src/pages/system-maintenance/{index.tsx,index.less}` | 维护页 |
| `apps/sso/src/pages/login/{index.tsx,index.less}` | 登录页（PWD/SMS/BMN） |
| `apps/sso/src/pages/reset-password/{index.tsx,index.less}` | 找回密码（3 步） |
| `apps/sso/src/pages/user-info/{index.tsx,index.less,_components/TopBar.tsx}` | 个人信息（改密/绑手机） |

---

## Task 1: 工程脚手架

**Files:**
- Create: `apps/sso/package.json`
- Create: `apps/sso/tsconfig.json`
- Create: `apps/sso/typings.d.ts`
- Create: `apps/sso/.gitignore`
- Create: `apps/sso/.eslintrc.js`
- Create: `apps/sso/.prettierrc`
- Create: `apps/sso/.prettierignore`
- Create: `apps/sso/.lintstagedrc`
- Create: `apps/sso/.stylelintrc.js`
- Create: `apps/sso/.env.example`

- [ ] **Step 1: 写 `apps/sso/package.json`**

```json
{
  "name": "@iam/sso",
  "private": true,
  "author": "cyy",
  "scripts": {
    "build": "max build",
    "dev": "max dev",
    "format": "prettier --cache --write .",
    "postinstall": "max setup",
    "setup": "max setup",
    "start": "npm run dev",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ant-design/icons": "^5.0.1",
    "@ant-design/pro-components": "^2.4.4",
    "@iam/shared": "workspace:*",
    "@umijs/max": "^4.6.45",
    "antd": "^5.4.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.33",
    "@types/react-dom": "^18.0.11",
    "lint-staged": "^13.2.0",
    "prettier": "^2.8.7",
    "prettier-plugin-organize-imports": "^3.2.2",
    "prettier-plugin-packagejson": "^2.4.3",
    "typescript": "^5.0.3"
  }
}
```

- [ ] **Step 2: 写 `apps/sso/tsconfig.json`** (与 admin 对齐，但不需要 api 私有别名，因为 sso 不直接吃 api 的内部源码)

```json
{
  "extends": "./src/.umi/tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@@/*": ["./src/.umi/*"],
      "@umijs/max": ["./node_modules/@umijs/max"],
      "@umijs/max/typings": ["./src/.umi/typings"]
    }
  }
}
```

- [ ] **Step 3: 写 `apps/sso/typings.d.ts`**

```ts
import '@umijs/max/typings';
```

- [ ] **Step 4: 写 `apps/sso/.gitignore`** (复制 admin 内容)

```
/node_modules
/.env.local
/.umirc.local.ts
/config/config.local.ts
/src/.umi
/src/.umi-production
/src/.umi-test
/.umi
/.umi-production
/.umi-test
/dist
/.mfsu
.swc
.turbopack
```

- [ ] **Step 5: 写 lint / prettier 配置** （4 个文件，内容均拷贝自 admin 同名文件）

读取 `apps/admin/.eslintrc.js`, `apps/admin/.prettierrc`, `apps/admin/.prettierignore`, `apps/admin/.lintstagedrc`, `apps/admin/.stylelintrc.js` 的真实内容写入 `apps/sso/` 同名文件。**不要凭空臆造内容**——逐个 Read admin 文件、Write sso 文件。

- [ ] **Step 6: 写 `apps/sso/.env.example`**

```dotenv
# SSO 客户端代码（与后端 client 字段对应）
UMI_APP_SSO_CLIENT_CODE=iam

# /.well-known/authentication-configuration 端点（默认走同域 proxy）
UMI_APP_WELL_KNOWN_URL=/sso/.well-known/authentication-configuration
```

- [ ] **Step 7: 安装依赖 + 让 UMI 生成 .umi 目录**

```bash
cd D:/Gas-Development/iam-service && pnpm install
```

期望：pnpm 检测到新工作空间 `@iam/sso`，安装其依赖。出错时检查 `package.json` 包名/版本是否拼错。

- [ ] **Step 8: Commit**

```bash
git add apps/sso/package.json apps/sso/tsconfig.json apps/sso/typings.d.ts apps/sso/.gitignore apps/sso/.eslintrc.js apps/sso/.prettierrc apps/sso/.prettierignore apps/sso/.lintstagedrc apps/sso/.stylelintrc.js apps/sso/.env.example pnpm-lock.yaml
git commit -m "feat(sso): 新建 apps/sso 工程脚手架"
```

---

## Task 2: 路由 / 代理 / antd 配置 (`.umirc.ts`)

**Files:**
- Create: `apps/sso/.umirc.ts`

- [ ] **Step 1: 写 `apps/sso/.umirc.ts`**

```ts
import { defineConfig } from '@umijs/max';

export default defineConfig({
  base: '/iam-sso',
  publicPath: '/iam-sso/',
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: false,
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: './login' },
    { path: '/reset-password', component: './reset-password' },
    { path: '/user-info', component: './user-info' },
    { path: '/system-maintenance', component: './system-maintenance' },
  ],
  npmClient: 'pnpm',
  proxy: {
    '/api': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/sso': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/auth': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/public': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/open': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
    '/internal': {
      target: 'http://176.169.99.191:30010',
      changeOrigin: true,
    },
  },
});
```

- [ ] **Step 2: 让 UMI 生成 `.umi/` 目录**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso setup
```

期望：在 `apps/sso/src/.umi/` 下生成临时文件，无报错。

- [ ] **Step 3: Commit**

```bash
git add apps/sso/.umirc.ts
git commit -m "feat(sso): 配置 UMI 路由与代理"
```

---

## Task 3: 常量与类型 (`constants/`, `types/`)

**Files:**
- Create: `apps/sso/src/constants/config.ts`
- Create: `apps/sso/src/constants/index.ts`
- Create: `apps/sso/src/types/api.d.ts`

- [ ] **Step 1: 写 `apps/sso/src/constants/config.ts`**

```ts
// 生产环境后端 API 默认走 /api/iam，开发走 proxy 同域
export const API_BASE =
  process.env.NODE_ENV === 'production' ? '/api/iam' : '';

// 当前应用注册到 SSO 的 client code
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';

// SSO well-known authentication-configuration 端点
export const WELL_KNOWN_URL =
  process.env.UMI_APP_WELL_KNOWN_URL ||
  '/sso/.well-known/authentication-configuration';
```

- [ ] **Step 2: 写 `apps/sso/src/constants/index.ts`**

```ts
export * from './config';
```

- [ ] **Step 3: 写 `apps/sso/src/types/api.d.ts`**

```ts
export type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export type AuthConfig = {
  authorizationEndpoint: string;
  logoutEndpoint: string;
};

export type Employment = {
  id: string;
  compName: string;
  orgName: string;
  posName: string;
};

export type UserInfo = {
  username: string;
  name: string;
  mobile: string | null;
  isMobileSet: boolean;
  employments: Employment[];
};

export type SmsUsage = 'login' | 'bindPhone';

export type LoginPasswordResult = {
  isMobileSet: boolean;
};

export type ClientStatus = {
  status: number;
  extAttributes?: Record<string, unknown> | null;
};
```

- [ ] **Step 4: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

期望：通过（无报错）。

- [ ] **Step 5: Commit**

```bash
git add apps/sso/src/constants apps/sso/src/types
git commit -m "feat(sso): 新增常量与 API 类型定义"
```

---

## Task 4: 工具函数 (`utils/`)

**Files:**
- Create: `apps/sso/src/utils/url.ts`
- Create: `apps/sso/src/utils/form-check.ts`
- Create: `apps/sso/src/utils/request.ts`

- [ ] **Step 1: 写 `apps/sso/src/utils/url.ts`**

```ts
export function toQueryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.set(k, String(v));
  });
  return usp.toString();
}

export function currentSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function getQuery(name: string): string | null {
  return currentSearchParams().get(name);
}

export function decodeRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
```

- [ ] **Step 2: 写 `apps/sso/src/utils/form-check.ts`**

```ts
import type { Rule } from 'antd/es/form';

export const PHONE_REGEX = /^1\d{10}$/;

// 至少 8 位、含字母与数字、不含空格
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?!.*\s).{8,}$/;

export const phoneRule: Rule = {
  validator: (_rule, value: string) => {
    if (!value) return Promise.reject(new Error('请输入手机号'));
    if (!PHONE_REGEX.test(value))
      return Promise.reject(new Error('请输入正确的手机号'));
    return Promise.resolve();
  },
};

export const passwordRule: Rule = {
  validator: (_rule, value: string) => {
    if (!value) return Promise.reject(new Error('请输入密码'));
    if (value.length < 8)
      return Promise.reject(new Error('密码长度不得小于 8 位'));
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value))
      return Promise.reject(new Error('密码必须同时包含字母和数字'));
    if (/\s/.test(value))
      return Promise.reject(new Error('密码不能包含空格'));
    return Promise.resolve();
  },
};

export function confirmPasswordRule(getOriginal: () => string | undefined): Rule {
  return {
    validator: (_rule, value: string) => {
      if (!value) return Promise.reject(new Error('请再次输入密码'));
      if (value !== getOriginal())
        return Promise.reject(new Error('两次输入的密码不一致'));
      return Promise.resolve();
    },
  };
}
```

- [ ] **Step 3: 写 `apps/sso/src/utils/request.ts`**

```ts
import { API_BASE, SSO_CLIENT_CODE } from '@/constants/config';
import type { ApiEnvelope } from '@/types/api';
import { currentSearchParams } from '@/utils/url';
import { ServiceStatusCode } from '@iam/shared';
import { history } from '@umijs/max';
import { message } from 'antd';

export class ServiceError extends Error {
  public code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.name = 'ServiceError';
    this.code = code;
  }
}

type RequestInitExt = RequestInit & { skipAuthRedirect?: boolean };

function preserveQuery(): string {
  const usp = currentSearchParams();
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function gotoLogin() {
  history.replace(`/login${preserveQuery()}`);
}

function gotoMaintenance() {
  history.replace(`/system-maintenance${preserveQuery()}`);
}

export async function request<T>(
  path: string,
  init: RequestInitExt = {},
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Client: SSO_CLIENT_CODE,
      ...(init.headers ?? {}),
    },
  });

  if (
    res.status === 401 &&
    res.headers.get('forbidden-reason') === 'maintenance'
  ) {
    gotoMaintenance();
    return new Promise<T>(() => {});
  }

  if (res.status === 401 && !init.skipAuthRedirect) {
    gotoLogin();
    return new Promise<T>(() => {});
  }

  if (!res.ok) {
    const msg = `网络错误 (${res.status})`;
    message.error(msg);
    throw new ServiceError(msg, res.status);
  }

  const body = (await res.json()) as ApiEnvelope<T>;

  if (
    body.code === ServiceStatusCode.Unauthorized &&
    !init.skipAuthRedirect
  ) {
    gotoLogin();
    return new Promise<T>(() => {});
  }

  if (body.code !== ServiceStatusCode.Success) {
    const msg = body.message || '请求失败';
    message.error(msg);
    throw new ServiceError(msg, body.code);
  }

  return body.data;
}

export function requestRaw<T = unknown>(
  path: string,
  init: RequestInitExt = {},
): Promise<Response> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      Client: SSO_CLIENT_CODE,
      ...(init.headers ?? {}),
    },
  }) as unknown as Promise<Response>;
}
```

- [ ] **Step 4: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

期望：通过。如果 `ServiceStatusCode.Unauthorized` 报缺失，确认 `packages/shared/src/enums/service.status.ts` 已包含 (本仓库当前已有)。

- [ ] **Step 5: Commit**

```bash
git add apps/sso/src/utils
git commit -m "feat(sso): 新增 fetch 请求封装与表单校验工具"
```

---

## Task 5: SSO endpoint 工具 (`lib/sso.ts`)

**Files:**
- Create: `apps/sso/src/lib/sso.ts`

- [ ] **Step 1: 写 `apps/sso/src/lib/sso.ts`**

```ts
import { WELL_KNOWN_URL } from '@/constants/config';
import type { AuthConfig } from '@/types/api';

export async function fetchAuthenticationConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(WELL_KNOWN_URL, { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    const cfg = body?.data ?? body;
    if (!cfg?.authorizationEndpoint || !cfg?.logoutEndpoint) return null;
    return {
      authorizationEndpoint: cfg.authorizationEndpoint,
      logoutEndpoint: cfg.logoutEndpoint,
    };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(
  cfg: AuthConfig,
  redirectUrl: string,
  client: string,
): string {
  const r = encodeURIComponent(redirectUrl);
  const c = encodeURIComponent(client);
  return `${cfg.authorizationEndpoint}?redirectUrl=${r}&client=${c}`;
}

export function buildLogoutUrl(
  cfg: AuthConfig,
  redirectUrl: string,
  client: string,
): string {
  const r = encodeURIComponent(redirectUrl);
  const c = encodeURIComponent(client);
  return `${cfg.logoutEndpoint}?redirectUrl=${r}&client=${c}`;
}
```

- [ ] **Step 2: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/sso/src/lib
git commit -m "feat(sso): 新增 SSO well-known 与 endpoint 构建工具"
```

---

## Task 6: 服务层 (`services/`)

**Files:**
- Create: `apps/sso/src/services/auth.ts`
- Create: `apps/sso/src/services/public.ts`
- Create: `apps/sso/src/services/open.ts`

- [ ] **Step 1: 写 `apps/sso/src/services/auth.ts`**

```ts
import type { LoginPasswordResult } from '@/types/api';
import { request } from '@/utils/request';

export function login(body: { username: string; password: string }) {
  return request<LoginPasswordResult>('/api/iam/auth/login/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileLogin(body: { phoneNumber: string; code: string }) {
  return request<LoginPasswordResult>('/api/iam/auth/login/mobile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>('/api/iam/auth/logout', { method: 'POST' });
}
```

- [ ] **Step 2: 写 `apps/sso/src/services/public.ts`**

```ts
import type { UserInfo } from '@/types/api';
import { request } from '@/utils/request';

export function getCurrentUserInfo() {
  return request<UserInfo>('/api/iam/public/user-info', {
    skipAuthRedirect: true,
  });
}

export function passwordChange(body: {
  oldPassword: string;
  newPassword: string;
}) {
  return request<void>('/api/iam/public/password/change', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function mobileSet(body: { phoneNumber: string; code: string }) {
  return request<void>('/api/iam/public/mobile/set', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: 写 `apps/sso/src/services/open.ts`**

```ts
import type { ClientStatus, SmsUsage, UserInfo } from '@/types/api';
import { request } from '@/utils/request';
import { toQueryString } from '@/utils/url';

export function sendMessage(body: { phoneNumber: string; usage: SmsUsage }) {
  return request<void>('/api/iam/open/code/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function selfMobileSendMsg(body: {
  phoneNumber: string;
  usage: SmsUsage;
}) {
  return request<void>('/api/iam/open/sendMessage', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function codeVerify(body: {
  phoneNumber: string;
  usage: SmsUsage;
  code: string;
}) {
  return request<void>('/api/iam/open/code/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function passwordReset(body: {
  username: string;
  phoneNumber: string;
  code: string;
  newPassword: string;
}) {
  return request<void>('/api/iam/open/password/reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function clientStatus(params: { clientCode: string }) {
  const qs = toQueryString(params);
  return request<ClientStatus>(`/api/iam/open/client/status?${qs}`, {
    skipAuthRedirect: true,
  });
}

export function usersUserInfo(params: { username: string }) {
  const qs = toQueryString(params);
  return request<Pick<UserInfo, 'username' | 'name' | 'mobile'>>(
    `/api/iam/open/users/userInfo?${qs}`,
    { skipAuthRedirect: true },
  );
}
```

- [ ] **Step 4: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/sso/src/services
git commit -m "feat(sso): 新增 auth/public/open 三层 REST 服务"
```

---

## Task 7: UMI Max model (`models/sso.ts`) 与 access

**Files:**
- Create: `apps/sso/src/models/sso.ts`
- Create: `apps/sso/src/access.ts`

- [ ] **Step 1: 写 `apps/sso/src/models/sso.ts`**

```ts
import { fetchAuthenticationConfig } from '@/lib/sso';
import { getCurrentUserInfo } from '@/services/public';
import type { AuthConfig, UserInfo } from '@/types/api';
import { useCallback, useEffect, useState } from 'react';

export default function useSsoModel() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const loadAuthConfig = useCallback(async () => {
    const cfg = await fetchAuthenticationConfig();
    if (cfg) setAuthConfig(cfg);
  }, []);

  const loadUserInfo = useCallback(async () => {
    try {
      const info = await getCurrentUserInfo();
      setUserInfo(info);
      return info;
    } catch {
      setUserInfo(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void loadAuthConfig();
  }, [loadAuthConfig]);

  return {
    authConfig,
    userInfo,
    setUserInfo,
    loadAuthConfig,
    loadUserInfo,
  };
}
```

- [ ] **Step 2: 写 `apps/sso/src/access.ts`**

```ts
import type { UserInfo } from '@/types/api';

export default function access(initialState: { userInfo?: UserInfo | null }) {
  return {
    isLoggedIn: !!initialState?.userInfo,
  };
}
```

- [ ] **Step 3: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/sso/src/models apps/sso/src/access.ts
git commit -m "feat(sso): 新增 UMI model 缓存 SSO 配置与用户信息"
```

---

## Task 8: 应用入口 (`app.ts`) + 资源拷贝

**Files:**
- Create: `apps/sso/src/app.ts`
- Create: `apps/sso/src/assets/bg.jpg` (从 `example/sso-login/src/assets/bg.jpg` 拷贝)
- Create: `apps/sso/src/assets/logo.png` (从 `example/sso-login/src/assets/logo1.png` 拷贝)
- Create: `apps/sso/src/assets/password1.png` 等 5 个 step 图片 (从原 assets 拷贝)

- [ ] **Step 1: 拷贝 assets**

```bash
cd D:/Gas-Development/iam-service
mkdir -p apps/sso/src/assets
cp example/sso-login/src/assets/bg.jpg apps/sso/src/assets/bg.jpg
cp example/sso-login/src/assets/logo1.png apps/sso/src/assets/logo.png
cp example/sso-login/src/assets/password1.png apps/sso/src/assets/password1.png
cp example/sso-login/src/assets/password2.png apps/sso/src/assets/password2.png
cp example/sso-login/src/assets/password3.png apps/sso/src/assets/password3.png
cp example/sso-login/src/assets/password_no2.png apps/sso/src/assets/password_no2.png
cp example/sso-login/src/assets/password_no3.png apps/sso/src/assets/password_no3.png
ls apps/sso/src/assets
```

期望：列出 7 个文件。

- [ ] **Step 2: 写 `apps/sso/src/app.ts`**

```ts
import { fetchAuthenticationConfig } from '@/lib/sso';
import { getCurrentUserInfo } from '@/services/public';
import type { AuthConfig, UserInfo } from '@/types/api';

type InitialState = {
  authConfig?: AuthConfig | null;
  userInfo?: UserInfo | null;
};

export async function getInitialState(): Promise<InitialState> {
  const [authConfig, userInfo] = await Promise.all([
    fetchAuthenticationConfig(),
    getCurrentUserInfo().catch(() => null),
  ]);
  return { authConfig, userInfo };
}
```

- [ ] **Step 3: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/sso/src/app.ts apps/sso/src/assets
git commit -m "feat(sso): 新增应用入口与静态资源"
```

---

## Task 9: 维护页 (`pages/system-maintenance/`)

**Files:**
- Create: `apps/sso/src/pages/system-maintenance/index.tsx`
- Create: `apps/sso/src/pages/system-maintenance/index.less`

- [ ] **Step 1: 写 `apps/sso/src/pages/system-maintenance/index.tsx`**

```tsx
import { clientStatus } from '@/services/open';
import { decodeRedirect, getQuery } from '@/utils/url';
import { Button, Spin } from 'antd';
import { useState } from 'react';
import './index.less';

export default function SystemMaintenancePage() {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    setLoading(true);
    try {
      const data = await clientStatus({ clientCode: 'tender' });
      if (data.status !== 2) {
        const redirectUrl = decodeRedirect(getQuery('redirectUrl'));
        if (redirectUrl) {
          window.location.href = redirectUrl;
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="maintenance-page">
      <Spin spinning={loading}>
        <div className="maintenance-card">
          <div className="maintenance-title">系统维护中</div>
          <Button type="primary" danger size="large" onClick={handleRetry}>
            刷新重试
          </Button>
        </div>
      </Spin>
    </div>
  );
}
```

- [ ] **Step 2: 写 `apps/sso/src/pages/system-maintenance/index.less`**

```less
.maintenance-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f7ff;

  .maintenance-card {
    background-color: #fff;
    padding: 64px 96px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }

  .maintenance-title {
    font-size: 32px;
    font-weight: 600;
    color: #333;
  }
}
```

- [ ] **Step 3: typecheck + 启动 dev 冒烟**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

期望：typecheck 通过。

- [ ] **Step 4: Commit**

```bash
git add apps/sso/src/pages/system-maintenance
git commit -m "feat(sso): 新增系统维护页"
```

---

## Task 10: 登录页 (`pages/login/`)

**Files:**
- Create: `apps/sso/src/pages/login/index.tsx`
- Create: `apps/sso/src/pages/login/index.less`

- [ ] **Step 1: 写 `apps/sso/src/pages/login/index.less`**

```less
.login-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background-image: url('~@/assets/bg.jpg');
  background-size: cover;
  background-position: center;

  .login-card {
    width: 25vw;
    min-width: 380px;
    max-width: 480px;
    margin-right: 10vw;
    background: #ffffff;
    border-radius: 19px;
    padding: 32px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

    .login-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;

      img {
        width: 200px;
        margin-bottom: 12px;
      }

      .title-zh {
        font-size: 30px;
        font-weight: 600;
        color: #1f2937;
      }

      .title-en {
        font-size: 14px;
        color: #6b7280;
        margin-top: 4px;
      }

      .bmn-tip {
        font-size: 12px;
        color: #ff1313;
        margin-top: 12px;
        text-align: center;
      }
    }

    .login-actions {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;

      .forgot-link {
        color: #2563eb;
        font-weight: 600;
        cursor: pointer;
        font-size: 12px;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .login-submit {
      width: 100%;
      height: 48px;
      border-radius: 12px;
      background: #454ce6;
      font-size: 16px;
      font-weight: 600;
    }

    .skip-btn {
      width: 100%;
      margin-top: 16px;
    }
  }

  .tip-card {
    width: 30vw;
    min-width: 380px;
    background: #fff;
    border-radius: 12px;
    padding: 32px;
    margin-right: 10vw;

    .tip-bar {
      width: 30%;
      height: 4px;
      background: #ff1313;
      margin-bottom: 16px;
    }

    .tip-title {
      color: #ff1313;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .tip-link {
      color: #3b82f6;
      word-break: break-all;
      margin-top: 12px;
    }
  }
}
```

- [ ] **Step 2: 写 `apps/sso/src/pages/login/index.tsx`**

```tsx
import logo from '@/assets/logo.png';
import { buildAuthorizeUrl } from '@/lib/sso';
import { login, mobileLogin } from '@/services/auth';
import { sendMessage } from '@/services/open';
import { mobileSet } from '@/services/public';
import { decodeRedirect, getQuery } from '@/utils/url';
import { useModel } from '@umijs/max';
import { Button, Form, Input, Tabs, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import './index.less';

type LoginMode = 'PWD' | 'SMS' | 'BMN';

export default function LoginPage() {
  const { authConfig } = useModel('sso');
  const [mode, setMode] = useState<LoginMode>('PWD');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pwdForm] = Form.useForm();
  const [smsForm] = Form.useForm();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = getQuery('client');
  const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';

  useEffect(() => {
    const loginType = getQuery('loginType');
    if (loginType === 'SMS' || loginType === 'PWD') setMode(loginType);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const redirectToAuthorize = () => {
    if (!authConfig || !client) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildAuthorizeUrl(authConfig, redirectUrl, client);
  };

  const handlePwdLogin = async () => {
    const values = await pwdForm.validateFields();
    setSubmitting(true);
    try {
      const data = await login({
        username: values.username.trim(),
        password: values.password.trim(),
      });
      if (!data.isMobileSet) {
        setMode('BMN');
        smsForm.resetFields();
        return;
      }
      redirectToAuthorize();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmsLogin = async () => {
    const values = await smsForm.validateFields();
    setSubmitting(true);
    try {
      await mobileLogin({
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      });
      redirectToAuthorize();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBindMobile = async () => {
    const values = await smsForm.validateFields();
    setSubmitting(true);
    try {
      await mobileSet({
        phoneNumber: values.phoneNumber.trim(),
        code: values.code.trim(),
      });
      redirectToAuthorize();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'PWD') return handlePwdLogin();
    if (mode === 'SMS') return handleSmsLogin();
    return handleBindMobile();
  };

  const sendSms = async () => {
    if (countdown > 0) return;
    const phoneNumber = smsForm.getFieldValue('phoneNumber');
    if (!phoneNumber || !/^1\d{10}$/.test(phoneNumber)) {
      message.error('请填写正确的手机号');
      return;
    }
    await sendMessage({
      phoneNumber: phoneNumber.trim(),
      usage: mode === 'BMN' ? 'bindPhone' : 'login',
    });
    startCountdown();
  };

  const tipBlock = useMemo(() => {
    const origin = window.location.origin;
    if (origin === 'http://176.169.99.150') {
      return (
        <>
          <div>上海燃气采招平台：</div>
          <div>http://176.169.99.150/tender/</div>
        </>
      );
    }
    if (origin === 'http://app.shgas.com') {
      return (
        <>
          <div>上海燃气数据服务平台：</div>
          <div>http://app.shgas.com/data-platform</div>
          <div className="tip-link">上海燃气采招平台：</div>
          <div>http://app.shgas.com/tender/</div>
        </>
      );
    }
    if (origin === 'https://tender.shgas.com.cn') {
      return (
        <>
          <div>上海燃气采招平台：</div>
          <div>https://tender.shgas.com.cn/tender/</div>
        </>
      );
    }
    return null;
  }, []);

  if (!client) {
    return (
      <div className="login-page">
        <div className="tip-card">
          <div className="tip-bar" />
          <div className="tip-title">提示：</div>
          <div className="tip-title">
            您使用的登录地址存在安全风险，请在浏览器中重新输入应用系统地址进行登录。
          </div>
          {tipBlock && (
            <>
              <div className="tip-link">例如：</div>
              <div className="tip-link">{tipBlock}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src={logo} alt="logo" />
          <div className="title-zh">上海燃气</div>
          <div className="title-en">SHANGHAI GAS</div>
          {mode === 'BMN' && (
            <div className="bmn-tip">
              您的账号尚未绑定手机号，为保障账户安全并及时接收重要通知，强烈建议您立即绑定手机号。
            </div>
          )}
        </div>

        {mode !== 'BMN' && (
          <Tabs
            activeKey={mode}
            onChange={(k) => setMode(k as LoginMode)}
            centered
            items={[
              { key: 'PWD', label: '密码登录' },
              { key: 'SMS', label: '手机登录' },
            ]}
          />
        )}

        {mode === 'PWD' && (
          <Form
            form={pwdForm}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
          >
            <Form.Item
              label="工号 / 账号"
              name="username"
              rules={[{ required: true, message: '请输入您的工号' }]}
            >
              <Input size="large" placeholder="请输入您的工号" />
            </Form.Item>
            <Form.Item
              label={
                <div className="login-actions" style={{ width: '100%' }}>
                  <span>登录密码</span>
                  <span
                    className="forgot-link"
                    onClick={() => {
                      const params = new URLSearchParams(
                        window.location.search,
                      );
                      params.set(
                        'username',
                        pwdForm.getFieldValue('username') ?? '',
                      );
                      window.location.hash = `#/reset-password?${params.toString()}`;
                    }}
                  >
                    忘记密码？
                  </span>
                </div>
              }
              name="password"
              rules={[{ required: true, message: '请输入登录密码' }]}
            >
              <Input.Password size="large" placeholder="请输入登录密码" />
            </Form.Item>
          </Form>
        )}

        {(mode === 'SMS' || mode === 'BMN') && (
          <Form
            form={smsForm}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
          >
            <Form.Item
              label="手机号"
              name="phoneNumber"
              rules={[
                { required: true, message: '请输入手机号' },
                {
                  pattern: /^1\d{10}$/,
                  message: '请输入正确的手机号',
                },
              ]}
            >
              <Input size="large" placeholder="请输入手机号" />
            </Form.Item>
            <Form.Item
              label="验证码"
              name="code"
              rules={[{ required: true, message: '请输入验证码' }]}
            >
              <Input
                size="large"
                placeholder="验证码"
                addonAfter={
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={sendSms}
                  >
                    {countdown <= 0 ? '获取验证码' : `${countdown} s`}
                  </span>
                }
              />
            </Form.Item>
          </Form>
        )}

        <Button
          className="login-submit"
          type="primary"
          size="large"
          loading={submitting}
          onClick={handleSubmit}
        >
          {mode === 'BMN' ? '绑定手机号' : '安全登录'}
        </Button>

        {mode === 'BMN' && (
          <Button
            className="skip-btn"
            type="link"
            onClick={redirectToAuthorize}
          >
            跳过
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/sso/src/pages/login
git commit -m "feat(sso): 新增登录页（密码/短信/绑定手机三模式）"
```

---

## Task 11: 找回密码页 (`pages/reset-password/`)

**Files:**
- Create: `apps/sso/src/pages/reset-password/index.tsx`
- Create: `apps/sso/src/pages/reset-password/index.less`

- [ ] **Step 1: 写 `apps/sso/src/pages/reset-password/index.less`**

```less
.reset-page {
  width: 100%;
  min-height: 100vh;
  background-image: url('~@/assets/bg.jpg');
  background-size: cover;
  background-position: center;
  padding: 5% 20%;
  display: flex;
  align-items: center;
  justify-content: center;

  .reset-card {
    width: 100%;
    background-color: #fff;
    border-radius: 8px;
    padding: 32px 64px;
    min-height: 60vh;
  }

  .reset-form {
    width: 60%;
    margin: 32px auto;
  }

  .form-actions {
    display: flex;
    gap: 16px;

    button {
      flex: 1;
    }
  }
}
```

- [ ] **Step 2: 写 `apps/sso/src/pages/reset-password/index.tsx`**

```tsx
import { codeVerify, passwordReset, sendMessage, usersUserInfo } from '@/services/open';
import { confirmPasswordRule, passwordRule } from '@/utils/form-check';
import { decodeRedirect, getQuery } from '@/utils/url';
import { history } from '@umijs/max';
import { Button, Form, Input, Modal, Select, Spin, Steps, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import './index.less';

const STEP_ITEMS = [
  { title: '确认账号' },
  { title: '安全验证' },
  { title: '设置密码' },
];

type Step1 = { type: '用户名'; username: string };
type Step2 = { phoneNumber: string; code: string };
type Step3 = { newPassword: string; newPasswordCopy: string };

export default function ResetPasswordPage() {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [mobileOptions, setMobileOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [form1] = Form.useForm<Step1>();
  const [form2] = Form.useForm<Step2>();
  const [form3] = Form.useForm<Step3>();

  useEffect(() => {
    const username = getQuery('username');
    if (username) form1.setFieldValue('username', username);
  }, [form1]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      if (current === 0) {
        const v = await form1.validateFields();
        const data = await usersUserInfo({ username: v.username });
        if (data.mobile) {
          setMobileOptions([
            { label: `手机号：${data.mobile}`, value: data.mobile },
          ]);
          form2.setFieldValue('phoneNumber', data.mobile);
        } else {
          setMobileOptions([
            { label: '手机号：暂未绑定手机号', value: '暂未绑定手机号' },
          ]);
          form2.setFieldValue('phoneNumber', '暂未绑定手机号');
        }
        setCurrent(1);
        return;
      }
      if (current === 1) {
        const v = await form2.validateFields();
        if (v.phoneNumber === '暂未绑定手机号') {
          message.warning('请先绑定手机号！');
          return;
        }
        await codeVerify({
          phoneNumber: v.phoneNumber,
          usage: 'login',
          code: v.code,
        });
        setCurrent(2);
        return;
      }
      if (current === 2) {
        const v = await form3.validateFields();
        await passwordReset({
          username: form1.getFieldValue('username'),
          phoneNumber: form2.getFieldValue('phoneNumber'),
          code: form2.getFieldValue('code'),
          newPassword: v.newPassword,
        });
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrev = () => {
    if (current === 1) setCurrent(0);
    else if (current === 2) {
      setCurrent(1);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdown(0);
    }
  };

  const sendCode = async () => {
    const phoneNumber = form2.getFieldValue('phoneNumber');
    if (phoneNumber === '暂未绑定手机号') {
      message.warning('请先绑定手机号！');
      return;
    }
    if (countdown > 0) return;
    setLoading(true);
    try {
      await sendMessage({ phoneNumber, usage: 'login' });
      startCountdown();
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => {
    const usp = new URLSearchParams(window.location.search);
    usp.delete('username');
    history.push(`/login?${usp.toString()}`);
  };

  return (
    <div className="reset-page">
      <Spin spinning={loading}>
        <div className="reset-card">
          <Steps current={current} items={STEP_ITEMS} />

          <div className="reset-form">
            {current === 0 && (
              <Form
                form={form1}
                layout="vertical"
                initialValues={{ type: '用户名' }}
              >
                <Form.Item
                  label="请选择类型"
                  name="type"
                  rules={[{ required: true, message: '请选择类型' }]}
                >
                  <Select options={[{ label: '用户名', value: '用户名' }]} />
                </Form.Item>
                <Form.Item
                  label="用户名"
                  name="username"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input placeholder="请输入用户名" allowClear />
                </Form.Item>
              </Form>
            )}

            {current === 1 && (
              <Form form={form2} layout="vertical">
                <Form.Item
                  label="验证方式"
                  name="phoneNumber"
                  rules={[{ required: true, message: '请选择验证方式' }]}
                >
                  <Select options={mobileOptions} />
                </Form.Item>
                <Form.Item
                  label="验证码"
                  name="code"
                  rules={[{ required: true, message: '请输入验证码' }]}
                >
                  <Input
                    placeholder="请输入验证码"
                    addonAfter={
                      <Button
                        type="link"
                        disabled={countdown > 0}
                        onClick={sendCode}
                      >
                        {countdown <= 0 ? '获取验证码' : `${countdown} 秒后重新获取`}
                      </Button>
                    }
                  />
                </Form.Item>
              </Form>
            )}

            {current === 2 && (
              <Form form={form3} layout="vertical">
                <Form.Item
                  label="新密码"
                  name="newPassword"
                  rules={[passwordRule]}
                >
                  <Input.Password placeholder="请输入新密码" />
                </Form.Item>
                <Form.Item
                  label="确认新密码"
                  name="newPasswordCopy"
                  dependencies={['newPassword']}
                  rules={[
                    confirmPasswordRule(() =>
                      form3.getFieldValue('newPassword'),
                    ),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" />
                </Form.Item>
              </Form>
            )}
          </div>

          <div className="form-actions">
            {current > 0 && (
              <Button danger onClick={handlePrev}>
                上一步
              </Button>
            )}
            {current < 2 && (
              <Button type="primary" danger onClick={handleNext}>
                下一步
              </Button>
            )}
            {current === 2 && (
              <Button type="primary" danger onClick={handleNext}>
                确定
              </Button>
            )}
          </div>
        </div>
      </Spin>

      <Modal
        open={done}
        title="提示"
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={
          <Button type="primary" danger onClick={goLogin}>
            去登录
          </Button>
        }
      >
        已完成密码重置，请点击下方按钮！
      </Modal>
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/sso/src/pages/reset-password
git commit -m "feat(sso): 新增找回密码三步流程"
```

---

## Task 12: 个人信息页 (`pages/user-info/`)

**Files:**
- Create: `apps/sso/src/pages/user-info/index.tsx`
- Create: `apps/sso/src/pages/user-info/index.less`
- Create: `apps/sso/src/pages/user-info/_components/TopBar.tsx`

- [ ] **Step 1: 写 `apps/sso/src/pages/user-info/_components/TopBar.tsx`**

```tsx
import logo from '@/assets/logo.png';
import { buildLogoutUrl } from '@/lib/sso';
import { decodeRedirect, getQuery } from '@/utils/url';
import { useModel } from '@umijs/max';
import { Avatar, Dropdown, message } from 'antd';

export default function TopBar() {
  const { authConfig, userInfo } = useModel('sso');

  const handleLogout = () => {
    const client = getQuery('client') ?? '';
    const redirectUrl = decodeRedirect(getQuery('redirectUrl')) ?? '';
    if (!authConfig) {
      message.error('SSO 配置未就绪，请刷新重试');
      return;
    }
    window.location.href = buildLogoutUrl(authConfig, redirectUrl, client);
  };

  return (
    <div className="topbar">
      <img className="topbar-logo" src={logo} alt="logo" />
      {userInfo && (
        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                label: <span style={{ color: '#ff1313' }}>退出登录</span>,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'logout') handleLogout();
            },
          }}
          placement="bottomRight"
        >
          <div className="topbar-user">
            <Avatar
              size="small"
              style={{
                backgroundColor: '#1560d1',
                marginRight: 8,
              }}
            >
              {userInfo.name?.[0] ?? ''}
            </Avatar>
            {userInfo.name}
          </div>
        </Dropdown>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 写 `apps/sso/src/pages/user-info/index.less`**

```less
.user-info-page {
  width: 100%;
  min-height: 100vh;
  background-color: #f5f7f9;
  display: flex;
  flex-direction: column;
}

.topbar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .topbar-logo {
    height: 40px;
  }

  .topbar-user {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #4b5563;
  }
}

.user-info-body {
  width: 100%;
  padding: 32px 10vw;

  .back-btn {
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 18px;
    font-weight: 600;
    margin: 16px 0 8px;
  }
}
```

- [ ] **Step 3: 写 `apps/sso/src/pages/user-info/index.tsx`**

```tsx
import { selfMobileSendMsg } from '@/services/open';
import { mobileSet, passwordChange } from '@/services/public';
import {
  confirmPasswordRule,
  passwordRule,
  phoneRule,
} from '@/utils/form-check';
import { decodeRedirect, getQuery } from '@/utils/url';
import { history, useModel } from '@umijs/max';
import {
  Button,
  Card,
  Form,
  Input,
  Spin,
  Table,
  Tabs,
  message,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import TopBar from './_components/TopBar';
import './index.less';

type TabKey = 'password' | 'mobile';

export default function UserInfoPage() {
  const { userInfo, loadUserInfo } = useModel('sso');
  const [activeKey, setActiveKey] = useState<TabKey>('password');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pwdForm] = Form.useForm();
  const [mobileForm] = Form.useForm();

  useEffect(() => {
    if (!userInfo) void loadUserInfo();
  }, [userInfo, loadUserInfo]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    const phoneNumber = mobileForm.getFieldValue('phoneNumber');
    if (!phoneNumber) {
      message.error('请填写手机号');
      return;
    }
    if (countdown > 0) return;
    await selfMobileSendMsg({ phoneNumber, usage: 'bindPhone' });
    startCountdown();
  };

  const submitPassword = async () => {
    const v = await pwdForm.validateFields();
    setSubmitting(true);
    try {
      await passwordChange({
        oldPassword: v.oldPassword,
        newPassword: v.newPassword,
      });
      message.success('更换成功！');
      pwdForm.resetFields();
    } finally {
      setSubmitting(false);
    }
  };

  const submitMobile = async () => {
    const v = await mobileForm.validateFields();
    setSubmitting(true);
    try {
      await mobileSet({ phoneNumber: v.phoneNumber, code: v.code });
      message.success('更换成功！');
      mobileForm.resetFields();
      void loadUserInfo();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (activeKey === 'password') return submitPassword();
    return submitMobile();
  };

  const back = () => {
    const redirectUrl = decodeRedirect(getQuery('redirectUrl'));
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      history.back();
    }
  };

  return (
    <div className="user-info-page">
      <TopBar />
      <div className="user-info-body">
        <Button type="link" className="back-btn" onClick={back}>
          返回
        </Button>
        <Card title="个人信息">
          <Spin spinning={!userInfo}>
            <div className="section-title">岗位信息</div>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={userInfo?.employments ?? []}
              columns={[
                { title: '公司', dataIndex: 'compName' },
                { title: '部门', dataIndex: 'orgName' },
                { title: '岗位', dataIndex: 'posName' },
              ]}
            />

            <Tabs
              style={{ marginTop: 24 }}
              activeKey={activeKey}
              onChange={(k) => setActiveKey(k as TabKey)}
              items={[
                { key: 'password', label: '更改密码' },
                { key: 'mobile', label: '绑定手机号' },
              ]}
            />

            {activeKey === 'password' && (
              <Form form={pwdForm} layout="vertical" requiredMark={false}>
                <Form.Item
                  label="密码"
                  name="oldPassword"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  label="新密码"
                  name="newPassword"
                  rules={[passwordRule]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  label="确认密码"
                  name="newCopyPassword"
                  dependencies={['newPassword']}
                  rules={[
                    confirmPasswordRule(() =>
                      pwdForm.getFieldValue('newPassword'),
                    ),
                  ]}
                >
                  <Input.Password />
                </Form.Item>
              </Form>
            )}

            {activeKey === 'mobile' && (
              <Form form={mobileForm} layout="vertical" requiredMark={false}>
                <Form.Item label="当前手机号">
                  {userInfo?.mobile || '-'}
                </Form.Item>
                <Form.Item
                  label="手机号"
                  name="phoneNumber"
                  rules={[phoneRule]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label="验证码"
                  name="code"
                  rules={[{ required: true, message: '请输入验证码' }]}
                >
                  <Input
                    placeholder="请输入验证码"
                    addonAfter={
                      <Button
                        type="link"
                        disabled={countdown > 0}
                        onClick={sendCode}
                      >
                        {countdown <= 0 ? '获取验证码' : `${countdown} s`}
                      </Button>
                    }
                  />
                </Form.Item>
              </Form>
            )}

            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              提交
            </Button>
          </Spin>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: typecheck**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/sso/src/pages/user-info
git commit -m "feat(sso): 新增个人信息页（改密 / 绑手机）"
```

---

## Task 13: 整体冒烟验证

- [ ] **Step 1: typecheck 全量**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso typecheck
```

期望：通过。

- [ ] **Step 2: lint**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso exec max lint || echo "lint not configured, skip"
```

期望：通过 / 或未配置（admin 也未单独配置 lint 脚本，可忽略）。

- [ ] **Step 3: 启动 dev 冒烟**

```bash
cd D:/Gas-Development/iam-service && pnpm --filter @iam/sso dev
```

人工在浏览器访问：

| URL | 预期 |
| --- | --- |
| `http://localhost:8000/iam-sso/login` | 显示红色提示卡（无 client） |
| `http://localhost:8000/iam-sso/login?client=iam&redirectUrl=http%3A%2F%2Fexample.com` | 显示登录卡片，可切换 PWD/SMS tab |
| `http://localhost:8000/iam-sso/reset-password` | 显示 Steps 三步式 |
| `http://localhost:8000/iam-sso/system-maintenance` | 显示维护卡片，"刷新重试"按钮可点击 |
| `http://localhost:8000/iam-sso/user-info` | 显示顶部 bar + 个人信息卡（无登录态会被 401 → /login 重定向） |

> 由于无法在 plan 中自动验证浏览器渲染，执行者完成 typecheck 后即视为通过；UI 冒烟由用户人工验证。

- [ ] **Step 4: 整体 commit (若前面有遗留改动)**

```bash
git status
```

如果还有未提交的小改动（例如自动格式化），按需 `git add` + `git commit -m "chore(sso): 修正 typecheck/lint 报错"`。如已干净则跳过。

---

## 备注 / 后续

- 二期可考虑：
  - 把维护态拓展为可配置组件（环境变量 + 时间窗）
  - 将 auth/public/open tier 接到 tRPC，类型化 client
  - 增加 Dockerfile（参考 admin 若添加）
- 已知与原项目差异（已与产品对齐，无需修复）：
  - 移除了首页公告条
  - 移除了 `menu.vue` 中转页（登录直接跳 SSO 重定向）
  - 移除了 OA 登录入口
  - 视觉从 Element Plus 切到 Antd 原生
