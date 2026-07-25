# 03 — 在共同 Grant 上完成 Gateway Local Session

**What to build:** 让 Gateway callback 在入口校验后通过一个 `completeGatewayLogin` 操作完成登录。Custom SSO 模块内部复用共同的 grant resolution，并继续完成可选 ORCAS 登录、Gateway credential、payload、审计与失败补偿；外部 Cookie、token、query 和 redirect 行为不变。

**Blocked by:** [01 — 建立 API production composition smoke](./01-establish-api-composition-smoke.md) and [02 — 打通 Independent Authorization Grant](./02-deliver-independent-authorization-grant.md)

**Status:** resolved

- [x] Gateway use case 在任何 code 消费前完成 client 存在性与 redirect allowlist 校验，随后只调用一次 `completeGatewayLogin` 并映射最终结果。
- [x] Custom SSO 模块私有解析并消费 Authorization Grant，再根据 client 配置完成 ORCAS、Gateway binding、credential、payload、审计和既有失败补偿；中间 grant 不越过模块 interface。
- [x] ORCAS dependency 由 Custom SSO production composition 注入，Gateway use case 不再拥有或编排 ORCAS port。
- [x] 不需要 ORCAS 的 client 不触发 ORCAS 调用；需要 ORCAS 的成功结果可从 Gateway Local Session context 读取正确 identity，且用户 DTO 不混入 ORCAS 属性。
- [x] ORCAS 失败不创建或返回 Gateway token；payload 失败不返回 token并执行既有 binding 撤销补偿；所有下游失败后已消费 code 都不能重放。
- [x] Gateway callback 的 token、Gateway Cookie、ORCAS Cookie、redirect query、302 行为、错误映射与现有外部契约保持不变。
- [x] 模块接口测试覆盖最终 session 和失败结果，use-case 与 handler 测试只覆盖入口职责、单次委托及 HTTP 映射，不锁定模块内部顺序。
- [x] 迁移完成后，没有 production caller 使用旧的 `consumeAuthCode → createLocalSession` 两阶段组合。
- [x] API 真实进程 smoke 在最终 composition 上通过；受影响测试以及 `@iam/api` lint、typecheck、文档检查和 whitespace check 全部通过。
