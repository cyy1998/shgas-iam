# 02 — 集中 backend 依赖方向规则

**What to build:** 让根 Architecture Guard 统一阻止 route、service 和普通 production module 越过既定依赖方向，同时允许 composition、repository implementation 和 type-only protocol 使用等合法 owner。

**Blocked by:** 01 — 建立根级 Architecture Guard 并守住 consumer-owned port

**Status:** resolved

- [x] API/Admin route 直接依赖 app-local repository 或 UnitOfWork 时产生明确 violation。
- [x] API/Admin service 反向依赖 application use case 时产生明确 violation。
- [x] 普通 production module 越权 value-import DB、Redis、logger 或 concrete provider 时产生明确 violation。
- [x] 合法 composition、repository implementation、app assembly 和 infrastructure owner 不被误报。
- [x] 合法 type-only protocol 与 platform import 不因 value-import 规则失败。
- [x] 通用规则覆盖原有 feature-specific port、route 和 service 依赖要求，无需复制 Account Recovery、Authentication 或 SSO 专用版本。
- [x] 正反 fixtures、当前仓库的 `pnpm check:architecture` 及受影响 backend focused tests/typecheck 通过。
