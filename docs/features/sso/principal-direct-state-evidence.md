# Principal Session 直接定位证据

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本页记录 [#171](https://github.com/cyy1998/shgas-iam/issues/171) 的根会话切片。修改目标来自
[Spec #170](https://github.com/cyy1998/shgas-iam/issues/170) 和 [ADR-0034](../../adr/0034-locate-token-state-records-directly.md)。
Principal 的本票切片之后，Credential 已由 #172 接入同一能力，见[凭据证据](credential-direct-state-evidence.md)，Artifact 已由 #173 迁移；无 token Binding 仍按内部 ID。当前配置退役边界见[运行时契约](token-state-runtime-evidence.md)。
本页的历史切片成本不替代[最终账本](token-state-contract.md)与[原始基线对照](token-state-cost-evidence.md)；目标环境未切换。

## 当前模型与验收入口

Principal 完整 token 经 SHA-256 定位 `<ns>state:p:<digest>`。有效记录保存 Principal，撤销时在同位置转换为
`state=revoked` 的终态，包含原 ID、摘要、原因、撤销时间、保留截止和 cleanup 信息。
`<ns>id:p:<id>` 只保存摘要；认证不读取该反向定位，也不接受 ID 或摘要作为 bearer。
Principal 不保存 HMAC key ID；后续三类 token 已统一 SHA-256，Kernel HMAC 配置已退役，不存在同类型双读。

创建原子拒绝任一状态位置或 ID 占用，建立状态、反向定位和索引。续期、撤销、外围删除和 pending 完成都比较
同一状态字节及反向 owner；Lua 在写入前检查索引类型，避免 WRONGTYPE 导致部分写入。
续期只更新 Redis 观察时点计算的滑动期限及相同索引 score，保留 token、ID、authTime 和绝对期限。
共享索引没有按单对象设置 TTL，避免短命对象使整个索引早消失。

根正常创建没有 cleanup refs；若 owner 持有根级 cleanup，失败时终态和反向定位均无 TTL，
`idx:principal_cleanup` 保留管理记录。按 ID 再次撤销重试该 cleanup，成功后恢复原保留截止，已过则删除。
子对象仍使用自己的 pending owner。根级联继续尽力处理，不新增父撤销提交屏障或可靠后台执行器。

| 行为 | 可执行证据 |
|---|---|
| 单 EVAL 解析、摘要/ID/跨类型拒绝、身份防覆盖、同状态 ID 查询 | Kernel `session-kernel-principal-state.integration.test.ts` |
| 续期双 key 期限与索引、在途读取后撤销、新读取拒绝、续期竞争、观察对象替换保护 | 同文件及既有 `session-kernel-time.integration.test.ts`、`session-kernel-root-revocation.integration.test.ts` |
| pending 无 TTL、原截止恢复/删除、旧 cleanup 保留新 owner | Principal state 测试；`direct-state-transitions.integration.test.ts` 的 owner/WRONGTYPE 原子行为 |
| 子级联、保留当前根、账号代际、协议范围 | 既有 Kernel root/prepared/selected revocation，以及 API Core、Admin、Custom SSO、OIDC 对应真实 Redis profiles |
| 真实根消费方异常映射 | API `custom-sso-operation-http.integration.test.ts` 的 iam 模式：有效 200，未知/摘要/ID/撤销/损坏 401，Redis 操作异常保持原 500；故障后重试 200 |
| 无索引、无 TTL 和损坏状态清理 | 现有 `online-auth:state` owner 流程包含新 Principal 的 `state:p:` / `id:p:`；三类型完整维护与独立CLI核验已由 #175 交付 |

具体通过命令、固定候选与双轴评审在 #171 验收评论记录。真实 I/O 先完成 await 再同步断言。

## 根入口前后实测

2026-09-10，Windows / PowerShell 7，Bun 1.3.14、Node 24.18.0、pnpm 11.14.0、ioredis 5.11.1，
任务独占 Docker Redis `docker.xuanyuan.run/library/redis:8.8.0`，动态 loopback 端口。
基线 `89c04cf9fdfe6dfc7786651a63f983177581d8b0` 与 `main` 的
`33305c0463747e535ccb8e1fc98b42efb598b954` 没有运行时代码差异。先在未改生产代码时扩展原采样窗口，
保存基线，再修改实现；候选使用相同请求、依赖、Redis 实例和采样入口。

可复现入口为 API 的 `test-integration/redis/custom-sso-operation-http.integration.test.ts`，
以 Kernel 正式工厂创建高熵根 token。设置专用 `IAM_API_TEST_REDIS_URL` 后运行：

```bash
pnpm --filter @iam/api exec bun test --max-concurrency=1 test-integration/redis/custom-sso-operation-http.integration.test.ts --test-name-pattern 'Public UserInfo iam'
```

该文件也由 `pnpm --filter @iam/api test:integration:redis` 收集。`userinfo` 经 Hono 请求、正式认证 middleware、
Custom SSO root consumer 和主体交付；HTTP handler 本地构造，Barrier、Client/Gate、Subject Facts 使用既有可控出站。
因此这里的完整请求墙钟覆盖本 fixture，Redis 数量只覆盖 Kernel 真 Redis，不能称为整个生产 HTTP 请求的总基础设施成本。
`kernel-root` 则只调用公开 `resolvePrincipalSession`，加本地 Response 构造以复用观测器。

每个入口先 warmup，再通过 ECHO 排空 MONITOR 后串行采样五次。ioredis `sendCommand` 记录开始/完成时点；
MONITOR 区分客户端命令与 Lua 内部命令。排除连接、seed、warmup、ECHO 和清理。
基线每次客户端顺序为 `GET, GET, GET, EVAL`，四次往返、四个串行波次；候选每次为 `EVAL`，一次往返、一个波次。
EVAL 内部 `TIME, GET` 不是额外网络往返。

下表每组按样本 0–4 顺序，单位 ms。命令耗时是客户端观察的往返完成时长，包含调度与 Redis 执行，不能视为纯网络延迟或 SLA。

| 版本 / 入口 | 五次请求墙钟 | 每次命令往返时长（依次对应上述命令） |
|---|---|---|
| 基线 / userinfo | 3.033; 3.275; 2.573; 3.207; 2.599 | 0.423,0.543,0.650,0.664; 0.667,0.568,0.456,0.723; 0.474,0.474,0.571,0.484; 0.714,0.600,0.531,0.720; 0.614,0.437,0.378,0.523 |
| 候选 / userinfo | 0.901; 0.812; 0.837; 0.894; 0.861 | 0.516; 0.432; 0.446; 0.456; 0.457 |
| 基线 / kernel-root | 4.152; 3.060; 2.092; 2.584; 2.358 | 0.508,0.480,0.516,2.400; 0.745,0.622,0.718,0.725; 0.493,0.480,0.463,0.474; 0.652,0.538,0.623,0.589; 0.547,0.532,0.590,0.485 |
| 候选 / kernel-root | 0.479; 0.547; 0.473; 0.476; 0.479 | 0.389; 0.467; 0.402; 0.406; 0.408 |

本地有界原始输出保留在根目录 `test-results/ticket-171-baseline.log` 和 `test-results/ticket-171-candidate.log`，
属于可再生成产物，不提交；本页保存可长期读取的逐次结果与复现入口。实测支持局部往返减少，不证明生产延迟提升比例。
