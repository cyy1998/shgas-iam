# SSO Portal 前端 (`apps/sso`) 设计文档

- 日期：2026-04-29
- 类型：新建应用（基于 `example/sso-login` Vue3 项目移植）
- 包名：`@iam/sso`，目录 `apps/sso`

## 1. 背景与目标

`example/sso-login` 是一个用 Vue3 + Element Plus 编写的 SSO 登录门户，为
"上海燃气" 各业务系统提供统一登录、密码找回、手机号绑定、个人信息维护等能力。
该项目长期游离于 monorepo 之外，需要将其纳入到 `iam-service` 的 pnpm + Turborepo
体系中，并将技术栈替换为与 `apps/admin` 一致的 **UMI Max + React + Antd**。

目标：

- 在 `apps/` 下新增 `@iam/sso`，UI/功能与原项目对齐
- 遵守 `apps/admin` 的工程约定（路径别名、SSO 工具函数、tsconfig、`@iam/shared`）
- 不引入 Element Plus 视觉，统一使用 Antd 原生设计语言
- 砍掉原项目中已废弃 / 临时性 / UI 未引用的代码

## 2. 范围

### 包含

- 新建 `apps/sso` 工程脚手架
- 路由：`/login`、`/reset-password`、`/user-info`、`/system-maintenance`
- 全局：动态拉取 `/sso/.well-known/authentication-configuration` 获取 SSO 端点
- REST 请求封装（fetch 版），含 401 自动跳登录、维护态自动跳维护页
- 复刻原 4 个页面的功能（仅以 Antd 重写视觉）

### 不包含

- OA 登录入口（原 UI 未使用 `loginOA`）
- `menu` 中转页（登录后直接 `redirect` 到 SSO 授权 endpoint）
- 顶部维护公告滚动条（硬编码日期已过期）
- `addVersion.js` 版本号写入脚本（UMI 自带 hash）
- 原 `requer.js` 的 axios CancelToken 重复请求取消机制
- 多余 API：`selfOrganizations`、`employmentsByPrivilege`、`getUsersUnderOrg`、
  `selfSearchOrganizations`（UI 未使用）

## 3. 工程结构

```
apps/sso/
├── .env.example            # UMI_APP_SSO_CLIENT_CODE / UMI_APP_WELL_KNOWN_URL 等
├── .eslintrc.js            # 复用 admin 的配置
├── .gitignore
├── .lintstagedrc
├── .prettierignore
├── .prettierrc
├── .stylelintrc.js
├── .umirc.ts               # routes / proxy / antd / initialState / model / request / layout:false
├── package.json            # @iam/sso, deps 与 admin 对齐 + workspace deps
├── tsconfig.json           # 拷贝 admin 配置（含 @db / @lib 等别名以便共享类型）
├── typings.d.ts
├── mock/                   # （可选，留空目录，与 admin 对齐）
└── src/
    ├── access.ts           # 对登录态做最小校验（非必要时可省）
    ├── app.ts              # getInitialState / request 拦截器
    ├── assets/
    │   ├── bg.jpg
    │   ├── logo.png
    │   └── steps/{password1,password2,password3,password_no2,password_no3}.png
    ├── components/
    │   └── PageLoading.tsx
    ├── constants/
    │   ├── config.ts        # API_BASE / SSO_CLIENT_CODE / WELL_KNOWN_URL
    │   └── index.ts
    ├── lib/
    │   └── sso.ts           # fetchAuthenticationConfig / buildAuthorizeUrl / buildLogoutUrl
    ├── models/
    │   └── sso.ts           # UMI Max model: { authConfig, userInfo, refresh* }
    ├── pages/
    │   ├── login/
    │   │   ├── index.tsx    # PWD / SMS / BMN 三种模式 Tabs
    │   │   └── index.less
    │   ├── reset-password/
    │   │   ├── index.tsx    # Steps 三步式
    │   │   └── index.less
    │   ├── user-info/
    │   │   ├── index.tsx
    │   │   ├── _components/TopBar.tsx
    │   │   └── index.less
    │   └── system-maintenance/
    │       ├── index.tsx
    │       └── index.less
    ├── services/
    │   ├── auth.ts          # /api/iam/auth/login/{password,mobile} + logout
    │   ├── public.ts        # /api/iam/public/* (user-info, password change, mobile set)
    │   └── open.ts          # /api/iam/open/* (code send/verify, password reset, client status)
    ├── types/
    │   └── api.d.ts         # ApiEnvelope / 业务返回类型
    └── utils/
        ├── form-check.ts    # 手机号 / 密码强度校验
        ├── request.ts       # fetch 封装 + 401/维护态分支
        └── url.ts           # query 编解码、redirect 解析
```

> `.umi/`、`dist/`、`node_modules/` 同 admin，gitignore 即可。

## 4. 路由与布局

UMI Max 全局 `layout: false`，所有页面自管布局：

| Path | 文件 | 说明 |
| --- | --- | --- |
| `/` | redirect → `/login` |
| `/login` | `pages/login/index.tsx` | 全屏背景 + 右侧卡片 |
| `/reset-password` | `pages/reset-password/index.tsx` | 卡片 + Steps |
| `/user-info` | `pages/user-info/index.tsx` | 顶部 bar + 中央卡片 |
| `/system-maintenance` | `pages/system-maintenance/index.tsx` | 居中提示 + 重试按钮 |

不再保留原项目 `home/`、`top.vue`、`menu.vue` 三个文件对应的页面。
`user-info` 自带顶部 bar（拆为 `_components/TopBar.tsx` 局部组件）。

`access.ts`：仅当 `user-info` 需要登录态时使用；登录页/重置页/维护页都允许匿名。

## 5. SSO 配置：动态 well-known

```ts
// src/models/sso.ts (UMI Max dva-style model，由 model 插件注入)
export default function useSsoModel() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const loadAuthConfig = useCallback(async () => {
    const res = await fetch('/sso/.well-known/authentication-configuration');
    const body = await res.json();
    if (body?.code === 200 || body?.data) setAuthConfig(body.data);
  }, []);

  const loadUserInfo = useCallback(async () => { /* GET /api/iam/public/user-info */ }, []);

  useEffect(() => { void loadAuthConfig(); }, [loadAuthConfig]);

  return { authConfig, userInfo, loadAuthConfig, loadUserInfo };
}
```

`app.ts -> getInitialState` 也会预加载一次 `authConfig`，减少登录页首次点击的延迟。

`lib/sso.ts` 暴露纯函数：

```ts
buildAuthorizeUrl(authConfig, redirectUrl, client): string
buildLogoutUrl(authConfig, redirectUrl, client): string
```

不再像 admin 那样依赖 `UMI_APP_SSO_AUTHORIZE_URL` 环境变量。

## 6. 请求封装

`utils/request.ts`（fetch + 信封解包）：

```ts
type ApiEnvelope<T> = { code: number; message: string; data: T };

export async function request<T>(
  input: string,
  init?: RequestInit & { skipAuthRedirect?: boolean },
): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      Client: SSO_CLIENT_CODE,
      ...(init?.headers ?? {}),
    },
  });

  // 维护态：HTTP 401 + forbidden-reason: maintenance
  if (res.status === 401 && res.headers.get('forbidden-reason') === 'maintenance') {
    history.replace(`/system-maintenance?${currentQuery()}`);
    return new Promise(() => {});
  }

  // 普通 401：跳登录
  if (res.status === 401 && !init?.skipAuthRedirect) {
    history.replace(`/login?${currentQuery()}`);
    return new Promise(() => {});
  }

  if (!res.ok) {
    const msg = `HTTP ${res.status}`;
    message.error(msg);
    throw new Error(msg);
  }

  const body = (await res.json()) as ApiEnvelope<T>;

  if (body.code === ServiceStatusCode.Unauthorized /* 401 */ && !init?.skipAuthRedirect) {
    history.replace(`/login?${currentQuery()}`);
    return new Promise(() => {});
  }

  if (body.code !== ServiceStatusCode.Success) {
    message.error(body.message ?? '请求失败');
    throw new ServiceError(body.message ?? '请求失败', body.code);
  }

  return body.data;
}
```

要点：

- 不复刻 axios `CancelToken` 取消重复请求（YAGNI）
- 不在拦截器里 `ElLoading.service`，loading 由各页面用 Antd `Spin`/Form 自管
- 错误统一 `message.error`，调用方 `try/catch` 决定是否要追加自定义提示

## 7. 三个核心页面

### 7.1 `pages/login/index.tsx`

UI：

- 全屏 `bg.jpg` 背景，右侧 ~25vw 卡片
- 卡片头：logo + "上海燃气 / SHANGHAI GAS"
- `Tabs`：`PWD`（密码）/ `SMS`（手机）；`BMN`（绑定手机）模式时不展示 Tabs，展示红色提示语
- `PWD`：用户名 + 密码 + 「忘记密码」链接
- `SMS` / `BMN`：手机号 + 验证码（"获取验证码"按钮，60s 倒计时）
- 底部 `Button`：标题随 mode 变 "安全登录" / "绑定手机号"；BMN 模式下方多一个 "跳过" 链接

逻辑：

- 仅当 `query.client` 存在才渲染表单；否则显示 "请使用应用入口跳转" 红色提示卡片（按原项目逻辑）
- `PWD` 登录返回 `isMobileSet === false` 时切到 `BMN` 模式
- 登录成功 / BMN 完成 / 跳过 → `window.location.href = buildAuthorizeUrl(authConfig, query.redirectUrl, query.client)`
- 进入页面时，若 query 有 `loginType` 则切到对应 tab；若 `query.redirectUrl` 存在则解 `decodeURIComponent` 备用

### 7.2 `pages/reset-password/index.tsx`

`Steps` (3 步)：

1. **确认账号**：`Select` 类型（仅"用户名"）+ `Input` 用户名 → 调 `GET /api/iam/open/users/userInfo`，
   把 mobile 写入下一步
2. **安全验证**：`Select` 显示 mobile（或"暂未绑定手机号"）+ `Input` 验证码 + "获取验证码"按钮（60s 倒计时）→
   调 `POST /api/iam/open/code/verify`
3. **设置密码**：新密码 + 确认密码 → 调 `POST /api/iam/open/password/reset` → 弹 `Modal` "去登录"

校验：

- 密码 ≥ 8 位
- 必须含字母 + 数字
- 不能含空格
- 两次密码一致

底部按钮：上一步 / 下一步 / 确定，状态机由 `activeIndex` 控制。

### 7.3 `pages/user-info/index.tsx`

布局：

- `_components/TopBar.tsx`：顶部 bar，左 logo，右用户头像（首字 + name）+ Popover：
  「个人信息」（当前页隐藏）/「退出登录」（调 `buildLogoutUrl`）
- 主体：`Card` 内放：
  - 「岗位信息」`Table`（`employments`：公司/部门/岗位）
  - `Tabs`：「更改密码」/「绑定手机号」
  - 改密：旧密码、新密码、确认密码
  - 改手机：当前手机号显示、新手机号、验证码（60s 倒计时）
- 顶部「返回」按钮：若 `query.redirectUrl` 存在则跳回，否则 `history.back()`

校验：同 7.2 的密码规则；手机号 `^1\d{10}$`。

### 7.4 `pages/system-maintenance/index.tsx`

居中卡片显示 "系统维护中"，下方 `Button` "刷新重试"：
点击调用 `GET /api/iam/open/client/status?clientCode=tender`，
若 `data.status !== 2` 则 `window.location.href = decodeURIComponent(query.redirectUrl)`。

## 8. API 服务层

按 tier 分文件，每个函数返回 `Promise<T>`，由 `request<T>` 解包：

```ts
// services/auth.ts
export const login = (body: { username: string; password: string }) =>
  request<{ isMobileSet: boolean }>('/api/iam/auth/login/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const mobileLogin = (body: { phoneNumber: string; code: string }) => ...
export const logout = () => request<void>('/api/iam/auth/logout', { method: 'POST' });

// services/public.ts
export const userInfo = () => request<UserInfo>('/api/iam/public/user-info');
export const passwordChange = (body) => request('/api/iam/public/password/change', { method: 'POST', body });
export const mobileSet = (body) => request('/api/iam/public/mobile/set', { method: 'POST', body });

// services/open.ts
export const sendMessage = (body: { phoneNumber: string; usage: 'login'|'bindPhone' }) => ...
export const codeVerify = (body) => ...
export const passwordReset = (body) => ...
export const clientStatus = (params: { clientCode: string }) =>
  request<{ status: number; extAttributes?: any }>(
    `/api/iam/open/client/status?${qs.stringify(params)}`,
    { skipAuthRedirect: true },
  );
export const usersUserInfo = (params: { username: string }) => ...
```

类型定义集中在 `types/api.d.ts`：

```ts
export type UserInfo = {
  username: string;
  name: string;
  mobile: string | null;
  isMobileSet: boolean;
  employments: Array<{ id: string; compName: string; orgName: string; posName: string }>;
};
export type AuthConfig = { authorizationEndpoint: string; logoutEndpoint: string };
```

未来若 `apps/api` 暴露这些 tier 的 tRPC，可以二期切换；当前仅 REST + 手写类型。

## 9. 配置 / 环境变量

`.env.example`：

```dotenv
UMI_APP_SSO_CLIENT_CODE=iam
UMI_APP_WELL_KNOWN_URL=/sso/.well-known/authentication-configuration
```

`constants/config.ts`：

```ts
export const API_BASE = ''; // 走 proxy 或同域，不加前缀
export const SSO_CLIENT_CODE = process.env.UMI_APP_SSO_CLIENT_CODE || 'iam';
export const WELL_KNOWN_URL =
  process.env.UMI_APP_WELL_KNOWN_URL || '/sso/.well-known/authentication-configuration';
```

`.umirc.ts` proxy 与 admin 完全一致（`/api`、`/sso`、`/auth`、`/public`、`/open`、`/internal`、`/admin` → `http://176.169.99.191:30010`）。

`.umirc.ts.base/publicPath`：建议 `/iam-sso/`（与 admin `/iam-admin/` 同构）。

## 10. 与 monorepo 集成

- `pnpm-workspace.yaml`：已包含 `apps/*`，无需修改
- 根 `package.json`/`turbo.json`：无需修改（`turbo dev/build/lint/typecheck` 自动覆盖）
- `apps/sso/package.json` 依赖：
  - `dependencies`：`@umijs/max`、`antd`、`@ant-design/pro-components`、`@ant-design/icons`、
    `react`、`react-dom`、`@iam/shared@workspace:*`
  - `devDependencies`：`typescript`、`prettier`、`prettier-plugin-organize-imports`、
    `prettier-plugin-packagejson`、`lint-staged`、`@types/react`、`@types/react-dom`

## 11. 验证 / 验收

- `pnpm install` 后 `pnpm --filter @iam/sso dev` 能启动（默认 8000 / UMI 端口）
- 开发模式下：
  - `/login?client=iam&redirectUrl=...` 显示登录卡片
  - `/login`（无 client）显示红色提示卡片
  - 三步式 `/reset-password` 能跳转、能拉验证码倒计时
  - `/user-info` 在登录后能展示岗位 + 改密/绑手机
  - `/system-maintenance` 重试逻辑能跳回 `redirectUrl`
- `pnpm typecheck` 通过
- `pnpm lint` 通过

## 12. 后续 / Out of scope

- 二期：若 `apps/api` 把 `auth/public/open` tier 也接到 tRPC，可把 `services/*` 切到 `hc<AppType>` 或 tRPC client
- 二期：把维护公告条做成可配置组件（环境变量 + 时间窗）
- 二期：补 `apps/sso/Dockerfile` 多阶段构建（参考 `apps/admin` 若有）
