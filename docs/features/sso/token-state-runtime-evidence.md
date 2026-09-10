# 无 lookup 密钥的认证 runtime 验证

本页记录 Spec #170 的 #174 配置退役与生产消费者组合，固定 review base 为
`abd18346a3c7ed77c626635e29dd5fcc7c8e746f`。三类状态的基础生命周期分别由
[Principal](principal-direct-state-evidence.md)、[Credential](credential-direct-state-evidence.md)和
[Artifact](artifact-direct-state-evidence.md)证据拥有。维护已由 #175 交付，最终逐项验收和原始基线成本见[最终账本](token-state-contract.md)；目标环境未切换。

## 配置与在线路径

API、Admin API 与 OIDC Provider 不再解析、校验或装配 Kernel lookup HMAC current/previous ID、secret；
Kernel 配置、候选派生和解析结果中的 key ID 同步退役。完整 token 经 SHA-256 在各自状态分区定位，
按内部 ID 管理仍通过反向定位访问同一权威状态。无 token Binding 继续按 ID 维护自身生命周期。
源布局描述与 fixture 只服务停止 writer 后的维护，不构成在线 fallback。

Worker 没有 Kernel lookup 配置消费者。OIDC Cookie 签名、JWT/JWK、Client Secret 校验、随机 token 生成继续由原 owner 拥有。
Provider 自有 UID/user-code 与 Binding mapping lookup 不属于本次退役的 Kernel lookup。

## 验收入口与证明范围

| 入口 | 本票核对行为 | 资源及替代边界 |
|---|---|---|
| API production composition | 根认证/续接、Independent 授权兑换与 Secret 轮换/重放、Gateway callback/UserInfo/authz、Subject Access 与协议 wire | 真实子进程、PG/Redis；测试 owner 建立业务与登录状态，外部通知/ORCAS 受控 |
| OIDC production composition | 正式 Provider、Code/AccessToken、Cookie/JWK、Claims Snapshot 与 Binding 关联 | 真实 Node HTTP/PG/Redis；合成业务数据，不代表浏览器或生产发布 |
| Admin production runtime 与 PG/Redis composition | 真实 runtime cache wiring；正式 ClientService/UoW 提交版本边界、乱序及双协议撤销 | runtime 子进程与 Redis；Client composition 使用真实 PG/Redis，部分出站依赖受控，不声称完整 Admin HTTP+PG 场景 |
| Admin SessionManagementService/RevocationPort 与 Redis | 混合根、OIDC Binding/凭据/Artifact、两模式 Custom SSO 凭据、实际数量/重复、当前根及非目标保留、部分 cleanup pending | 正式管理服务和 adapter；用户摘要、审计与外围 cleanup 为可控替身 |
| Kernel/API Core/Custom SSO/API/OIDC 完整受影响行为 | prepared/observed/账号代际、同对象撤销、迟到更新/cleanup、不查父与兑换查父、用途/摘要/ID拒绝、一次许可及协议失败 | 复用现有 Component 与真实 Redis/正式 HTTP 入口，不用类型或源码形状代替行为 |

## 实际验证记录

2026-09-10，Windows / PowerShell 7，Bun 1.3.14、Node 24.18.0、pnpm 11.14.0。
固定候选 SHA 与双轴评审结果记录于 [#174](https://github.com/cyy1998/shgas-iam/issues/174)，避免将尚未发生的评审写成通过。

本票下列最终验证均通过；所有受影响 workspace 的 Unit、Component、Redis 为 22 个任务、1922 项测试，
typecheck 为 17 个依赖及消费方任务。Process 为 4 个任务、18 项测试；三 app composition 为 9 项测试。
根工具 Unit 为 109 项。静态检查包含 lint、101 篇文档、环境命名、Architecture Guard 和 Collection Guard。

```text
pnpm verify:static
pnpm exec turbo typecheck --filter=@iam/session-kernel --filter=@iam/api-core --filter=@iam/custom-sso --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --filter=@iam/e2e-system --force --concurrency=3
pnpm exec turbo test:unit test:integration:component test:integration:redis --filter=@iam/session-kernel --filter=@iam/api-core --filter=@iam/custom-sso --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --filter=@iam/e2e-system --force --concurrency=1
pnpm exec turbo test:integration:process --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --filter=@iam/worker --force --concurrency=1
pnpm --filter @iam/db db:migrate
pnpm exec turbo test:integration:composition --filter=@iam/api --filter=@iam/admin-api --filter=@iam/oidc-provider --force --concurrency=1
pnpm test:unit:root
docker compose --env-file docker/.env.dev.example -f docker/docker-compose-dev.yml config --quiet
docker compose --env-file docker/.env.prod.example -f docker/docker-compose-prod.yml config --quiet
docker compose -f e2e/system/compose.yaml config --quiet
pnpm check:docs
git diff --check
git diff --cached --check
```

Redis 命令显式注入七个 owner-specific test URL；composition 使用 API、Admin、OIDC 的专用数据库 URL，
Admin 组合还使用 `IAM_API_CORE_TEST_REDIS_URL`。Migrate 只使用调用方独占测试库的 `DATABASE_URL`。
日志位于 `test-results/ticket-174-{static,typecheck,behavior,composition}-final.log`，以及
`ticket-174-process.log`、`ticket-174-root-unit.log`、`ticket-174-migrate.log`；初次失败日志保留，不作为通过证据。

两个早期验证问题均修复后重跑：新增混合测试的 ESLint 自动修复把预期数组推断成 `unknown[]`，改为显式结果数组；
临时空库首次 composition 因缺表失败，随后通过正式 migrations 准备 schema。
API composition 的旧断言还把 Dirty `processing` 当成 Projection Not Ready，与 ADR-0032 冲突；
现经真实 PG/Redis 验证重建期间 Gateway/Independent 仍交付已发布主体和 Client 裁剪权限，Gateway 同凭据继续成功，
Independent 同 Code 重放为 `401 / InvalidAuthCode`。没有改变生产投影或消费规则。
真正投影不可用、失败烧码及重新授权继续由
[正式 API HTTP/Redis 测试](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts)验证。
失效 HMAC 参数校验测试随配置退役，替代为无 lookup 配置的生产 env 和真实 production process/composition；
跨实例解析、期限、摘要/ID bearer 拒绝与独立 Cookie/JWK/Secret 保护仍有行为回归。

调用方临时资源使用仓库声明镜像 `docker.xuanyuan.run/library/redis:8.8.0` 与
`docker.xuanyuan.run/postgres:18.4`，动态 loopback 端口分别为 38944、38446；服务已分别通过 PONG 与 pg_isready。
Redis container ID 为 `f434013a16694ffbcaba7d6702ccb42846ec721c894b59f05a12fefdb8927bcb`，
PostgreSQL container ID 为 `5e491c6c9ef5458b2270f57a2ba6ca131386a29549471131eeca7232f3cfbede`。
资源仅供本票测试，均已按上述准确 ID 清理；没有开发资源、prefix/glob 删除或 prune。

本票不重新建立性能原始基线。#171–#173 的局部实际观测继续按各自固定基线解释；
原目标 `33305c0463747e535ccb8e1fc98b42efb598b954` 与最终候选的完整成本对照见[成本证据](token-state-cost-evidence.md)。
完整 HTTP 请求包含协议、账号、配置与投影访问，不能把 Kernel 单次解析的一次 EVAL 当作整个端点只有一次 Redis 往返。

## 未执行的环境动作

未部署、push、合入 main、清理目标环境在线状态、下线用户或关闭父 Spec。
未新增完整系统 E2E 或自动部署演练。停流、排空、独立维护 verify、统一版本、新登录、双协议/Admin smoke 与放流
仍由发布 owner 按[全体在线状态手册](../../releases/online-auth-redis-time-cutover.md)验收。
全仓 `pnpm verify` 留给 #176；本票没有 schema 改动，PG 通过正式迁移及现有 composition 验证。
E2E Compose 通过配置解析及现有 Unit 验证，本票没有启动完整系统或真实 ORCAS；合成外部依赖不证明第三方幂等、退出或回收能力。
