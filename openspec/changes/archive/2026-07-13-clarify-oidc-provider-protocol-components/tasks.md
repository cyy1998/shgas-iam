## 1. Characterization Tests 与 Red Signal

- [x] 1.1 运行并记录现有 `claims`、`provider-wiring`、`session-security`、`configuration`、`token-flow` 与 OIDC architecture focused baseline
- [x] 1.2 扩展 Claims Adapter tests，锁定 scope-filtered snapshot、ID Token authorization filtering、`auth_time` 与 access-token extra 完整字段
- [x] 1.3 扩展 invalid-path tests，锁定 provider/global session binding、client config/credential metadata validation，以及 resolved invalid credential revoke 与 unresolved credential no-revoke 行为
- [x] 1.4 扩展 provider wiring/composition characterization，锁定 protocol payload、client authentication 与 provider/security/session dependency wiring
- [x] 1.5 先把测试和 architecture guard 切换到目标 Adapter 命名/ownership，运行并记录旧 production 结构的预期 red signal

## 2. Claims Adapter 命名

- [x] 2.1 将 `CreateOidcClaimsServiceDeps`、`createOidcClaimsService`、`OidcClaimsService` 重命名为对应 `*Adapter*` symbols，且不保留 production alias
- [x] 2.2 更新 provider configuration、provider factory、composition 与 tests 的 Claims Adapter type/import/call sites，不改变 hook 输入输出

## 3. Composition Ownership

- [x] 3.1 新建 `composition/security`，在其中物化 client auth rate limiter 与 client secret verifier，并暴露显式 security aggregate
- [x] 3.2 让 `composition/provider` 物化 Claims Adapter 与 interaction policy，并通过显式 deps 接收 security、session、repository 与 store facades
- [x] 3.3 让 interaction/provider wiring 直接使用 `session.oidcSession`，删除 `services.globalSessionResolver` 二次分类
- [x] 3.4 从 composition root 移除 `createOidcProviderServices`/`services`，接入 `security` 并删除 `composition/services`

## 4. Architecture 与文档

- [x] 4.1 增强 OIDC architecture tests，禁止 Claims Service symbols、`composition/services`、混合 component factory 与 session resolver services alias 回退
- [x] 4.2 更新后端架构/实现文档中的 OIDC protocol adapter 与 provider/security/session composition 约定，并确认无需新增 docs index entry

## 5. 验证与交付检查

- [x] 5.1 运行 Claims、provider wiring、session security、configuration、token flow focused tests 与 OIDC architecture test，确认全部通过
- [x] 5.2 运行 OIDC Provider full test、typecheck 与 lint；若 `http-server-logging` timing flake 出现，隔离复跑只用于诊断且 full test 必须最终通过
- [x] 5.3 运行 OpenSpec strict validation、仓库 OpenSpec check 与 `git diff --check`，并把命令/结果记录到 child verification evidence
- [x] 5.4 人工复核 discovery/flow/claims/token/session/Redis/issuer 兼容矩阵，确认无 schema、dependency、deployment 或下一 child port-shape 范围漂移
