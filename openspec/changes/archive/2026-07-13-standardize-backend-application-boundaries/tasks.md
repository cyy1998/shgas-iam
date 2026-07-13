## 1. Umbrella 基线与 Child 生命周期准备

- [x] 1.1 在 `feature/standardize-backend-application-boundaries` 记录 API、Admin API、OIDC Provider 当前 focused/full test、typecheck、lint 与 architecture guard 基线
- [x] 1.2 为六个 child changes 固定目标分支、依赖顺序、外部契约保持矩阵和 archive 回 feature 分支的验收规则

## 2. Account Recovery Child Change

- [x] 2.1 创建 `migrate-api-account-recovery-workflows` child change，完成 proposal/design/spec/tasks 并确认 apply-ready
- [x] 2.2 使用 characterization tests 锁定三种 `VerificationCodeUsage`、手机号解析、短信、audit、masking 与 reset 行为
- [x] 2.3 实施并验证 Account Recovery use-cases、最小 shared facade、route/composition wiring 和对应 architecture guard
- [x] 2.4 归档 child change 到 umbrella feature 分支，并确认 API 完整验证通过

## 3. Authentication Child Change

- [x] 3.1 创建 `migrate-api-authentication-workflows` child change，完成 proposal/design/spec/tasks 并确认 apply-ready
- [x] 3.2 使用 characterization tests 锁定 password/mobile login、human verification、failure/blacklist、session、audit、magic code、Redis key/TTL 与错误传播
- [x] 3.3 实施并验证登录 use-cases、authentication support modules、route/composition wiring 和对应 architecture guard
- [x] 3.4 归档 child change 到 umbrella feature 分支，并确认 API 完整验证通过

## 4. SSO Child Change

- [x] 4.1 创建 `migrate-api-sso-workflows` child change，完成 proposal/design/spec/tasks 并确认 apply-ready
- [x] 4.2 使用 characterization tests 锁定 authorize/callback/code exchange/OA/WeChat/logout、cookie、redirect、ORCAS、Redis、audit 和失败传播
- [x] 4.3 实施并验证 operation-specific SSO use-cases、shared collaborators、route/composition wiring 和对应 architecture guard
- [x] 4.4 归档 child change 到 umbrella feature 分支，并确认 API 完整验证通过

## 5. Admin User Resignation Child Change

- [x] 5.1 创建 `extract-admin-user-resignation-use-case` child change，完成 proposal/design/spec/tasks 并确认 apply-ready
- [x] 5.2 使用 characterization tests 锁定 REST/tRPC operation、transaction、employment end、user disable、audit 与两类 profile dirty reason
- [x] 5.3 实施并验证 `resign-user` use-case、Admin composition/useCases wiring、EmploymentService 收口和对应 architecture guard
- [x] 5.4 归档 child change 到 umbrella feature 分支，并确认 Admin API 完整验证通过

## 6. OIDC Provider Protocol Components Child Change

- [x] 6.1 创建 `clarify-oidc-provider-protocol-components` child change，完成 proposal/design/spec/tasks 并确认 apply-ready
- [x] 6.2 使用 characterization tests 锁定 claims snapshot、token extra、binding/config validation、invalid credential revocation 和 provider wiring
- [x] 6.3 实施并验证 Claims Adapter 命名、provider/security/session composition 分类和对应 architecture guard
- [x] 6.4 归档 child change 到 umbrella feature 分支，并确认 OIDC Provider 完整验证通过

## 7. Consumer-Owned Ports Child Change

- [x] 7.1 在前五个 child 全部归档后创建 `strengthen-backend-consumer-owned-ports` child change，并盘点 production `*.port.ts` 的 repository/service shape ownership
- [x] 7.2 为 Admin API 和 OIDC Provider 的目标 ports 建立 compile-time/architecture red tests，覆盖 repository import 与 `Pick<...Repository>`/`Pick<...Service>`
- [x] 7.3 将 port 方法与数据 shape 改为 consumer-owned contract，由 composition/repository adapter 结构化适配且不改变 persistence 行为
- [x] 7.4 归档 child change 到 umbrella feature 分支，并确认三个 backend 的完整验证通过

## 8. Umbrella 集成验证与交付

- [x] 8.1 确认六个 child changes 均已归档、主 specs 已同步，且 feature 分支只包含计划内提交
- [x] 8.2 运行 API、Admin API、OIDC Provider 的全量 tests、typecheck、lint、architecture tests 和文档链接/索引 guard
- [x] 8.3 人工复核 REST/OpenAPI/tRPC/OIDC/SSO/session/Redis/audit/profile dirty/notification compatibility matrix 与 rollback 证据
- [x] 8.4 使用 OpenSpec verify 检查 umbrella requirements、scenarios、design decisions 与 child evidence 的完整映射
- [x] 8.5 用户确认进入 Archive 后，同步 umbrella delta specs、归档 change、squash merge 到 `main` 并清理本地 feature 分支
