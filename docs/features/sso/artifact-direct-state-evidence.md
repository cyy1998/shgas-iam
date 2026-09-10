# Artifact 直接定位证据

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本页记录 [#173](https://github.com/cyy1998/shgas-iam/issues/173) 对 [Spec #170](https://github.com/cyy1998/shgas-iam/issues/170)
的 Artifact 切片。固定 review base 为 `d505fec69d69ad8c8475e1e633d6303d644c4d61`，功能分支
`codex/token-state-records`，目标 `main`。三类 token 已统一 direct state；Kernel HMAC runtime 配置已退役，见[运行时契约](token-state-runtime-evidence.md)，全体下线维护已由 #175 交付，全部验收见[最终账本](token-state-contract.md)，实际环境切换由发布 owner 执行。
代码候选验证与环境切换分开记录。

## 状态与边界

完整 token 经 SHA-256 定位 `<ns>state:a:<digest>`，一次 Lua 观察该记录与 Redis 时间；
`<ns>id:a:<artifactId>` 只保存摘要，用于独立 ID 管理及 owner 比较。Kernel 生成 Code/Return Handle 和 Provider opaque Code
采用同一规则，Artifact 不保存 HMAC key ID。无 token Binding 仍按 ID；合法无父 Return Handle 保持。

创建原子占用 state、ID 和必要索引，活跃及保留终态均不能覆盖；同 token 不再同时拥有多代 active/tombstone。
消费复用 direct-state revoke，以原观察字节与反向 owner 比较，原子写入同记录 `state=revoked, reason=consumed`，
移除精确索引并同步原终态截止；多个已验证请求只有一个赢家。消费提交不重新用应用时间裁决有效期。
原观察变化返回 fail_closed，损坏返回 schema_invalid，已消费返回 consumed_replay，消失返回 missing_or_expired。
用途、token 与已观察对象约束保持；普通撤销返回 revoked，Redis 操作异常不冒充缺失。

普通撤销保留诊断及 cleanup refs。pending 期间状态与 ID 无 TTL，完成后恢复原截止或删除；迟到 cleanup 比较原 owner，
不能删除新代。Artifact 不随根续期；新 Code 兑换仍查适用父根，已有 Credential 使用不查父。
Custom SSO 两模式继续一次消费后投影/ORCAS/签发，消费未知或后续失败需要重新授权，写前固定新 Credential ID 用于精确补偿。

定向维护同时识别当前 state/ID 与源四键布局，仅离线维护可解码源布局，在线无同类型双读。
当前 state 必须有匹配反向 ID 才可定向删除；孤立/损坏/冲突 inventory 保留报错。全体维护 owner 已加入 state:a:/id:a:，
可清除包括孤立、损坏及无 TTL 在内的全部目标键族；不扩大到其他 owner。

## 验收证据

| 行为 | 已执行证据入口 |
|---|---|
| 单 EVAL、SHA/ID/跨类型/用途、同记录撤销、空串/损坏/故障、占位拒绝 | Kernel `session-kernel-artifact-state.integration.test.ts` |
| 原子唯一消费、原观察归属、重放/消失、索引与终态期限、parentless Handle | Artifact state 与 `session-kernel-artifact.integration.test.ts` |
| pending无TTL、原截止恢复/删除、迟到cleanup与替换保护 | Artifact state、selected-revocation、direct-state-transitions suites |
| Redis观察时间、应用时钟偏差、自然到期、根续期不重建/延长Artifact | Kernel time suite；无父Handle代表采样 |
| 正式Custom SSO授权/兑换/访问、唯一消费、未知及后续失败、按ID补偿、重新授权 | Custom SSO完整Redis suites；API redemption/operation HTTP suites |
| 正式Provider Code→Token、PKCE/Client/redirect、用途误投、重放关联 | OIDC `subject-access-authorization.integration.test.ts` |
| Code空串/JSON 400 invalid_grant、Redis WRONGTYPE 500、摘要/ID误投、peer保留 | 同一Provider HTTP suite新增矩阵 |
| 活跃占位upsert失败、独立Code保留、旧代过期后新owner及迟到操作 | OIDC正式HTTP替换/精确cleanup suites；Kernel selected-revocation |
| 源/目标维护、dry-run、部分失败重跑、独立验证、孤立/损坏/无索引及保留集 | OIDC `custom-sso-grant-maintenance.integration.test.ts` 与 `client-protocol-artifact-cleanup.integration.test.ts` |

原测试允许生产创建覆盖活跃 Artifact，与新约束冲突，已分别改为验证占位拒绝，或显式模拟原代过期后再创建新代。
新代测试继续证明迟到操作保护；不放宽创建规则。维护故障注入已跟随新原子cleanup，原失败恢复断言保持真实生效。

## 实际成本

Windows / PowerShell 7，Bun 1.3.14、Node 24.18.0、pnpm 11.14.0、ioredis 5.11.1、Redis 8.8.0。
调用方独占镜像 `docker.xuanyuan.run/library/redis:8.8.0`、loopback动态端口38994，PONG后执行。
准确 container ID 为 `f50fbfe00c07724ff44cfa39afd160eede855ebb9daae59b3ff3fcfa307b74bc`，测试结束按该ID清理。

Kernel基线在生产修改前保存。OIDC完整请求基线使用固定review base的8个Kernel改动源文件回放，其他运行时代码本票未修改；
先停止全部worker写入及测试，保存逐文件bytes，运行采样后精确恢复并核对全部bytes一致，再执行最终候选验证。
同依赖、同Redis实例，每组五次；Code签发在HTTP测量窗口外，每次兑换fresh Code。
原目标 `33305c0463747e535ccb8e1fc98b42efb598b954` 与设计 `89c04cf9fdfe6dfc7786651a63f983177581d8b0`
无运行时代码差异；本票baseline已含前两票优化，不能把完整HTTP数字当作原目标基线，最终原始对照见[成本证据](token-state-cost-evidence.md)。

```bash
pnpm --filter @iam/session-kernel exec bun test --max-concurrency=1 test-integration/redis/session-kernel-artifact-cost.integration.test.ts
pnpm --filter @iam/oidc-provider test:integration:redis -t 'observes successful Code exchange'
```

分别显式提供专用 `IAM_SESSION_KERNEL_TEST_REDIS_URL`、`IAM_OIDC_PROVIDER_TEST_REDIS_URL`。
Kernel局部Code与Return Handle基线每次GET,GET,GET,EVAL，4往返/4串行波次；候选每次EVAL，1往返/1波次。
OIDC完整Code兑换基线30往返/30波次，候选26往返/26波次。独占窗口的MONITOR client命令计数与客户端观察一致，
Lua内部命令不计为网络RTT。HTTP采样包含协议payload、Binding/Snapshot及签发，不声称整个端点一次Redis访问。

| 版本/入口 | 请求或局部墙钟五次（ms） | 客户端命令RTT之和五次（ms） |
|---|---|---|
| 基线Code局部 | 4.546;2.733;3.048;2.481;2.057 | 2.265;2.546;1.909;2.267;1.811 |
| 候选Code局部 | 2.312;1.380;0.537;0.472;0.468 | 0.432;1.284;0.475;0.416;0.389 |
| 基线Return Handle局部 | 2.117;1.843;1.582;2.666;1.666 | 1.910;1.642;1.431;2.477;1.418 |
| 候选Return Handle局部 | 0.461;0.461;0.510;0.470;0.398 | 0.371;0.401;0.458;0.402;0.329 |
| 基线OIDC Code HTTP | 29.007;29.482;19.671;30.805;31.218 | 12.945;12.369;14.751;12.899;14.439 |
| 候选OIDC Code HTTP | 27.737;25.131;39.209;29.515;27.090 | 11.108;11.388;20.718;11.336;10.716 |

命令RTT包含调度和Redis执行，不是纯网络延迟或SLA；五个样本不用于声称稳定延迟分位数改善。
正式Provider HTTP与真实Redis已覆盖，Client/Gate/账户及Facts仍为可控出站；API使用正式Hono route的app.request。
ORCAS替身只证明顺序和失败边界，不证明外部系统实际幂等/回收。早期并行MONITOR受其他测试干扰的采样未用作本表依据。
安全原始日志为 `test-results/ticket-173-baseline.log`、`ticket-173-candidate.log`、
`ticket-173-baseline-oidc.log`、`ticket-173-candidate-oidc.log`，含逐命令起止与RTT，不提交生成产物。

固定最终candidate SHA、实际静态/typecheck/行为命令结果及双轴评审记录沿#173交接与验收评论读取。
全仓pnpm verify归最终聚合#176；未新增完整系统E2E、PG/schema或浏览器改动，未执行环境下线、停流、部署、真实ORCAS验收。
