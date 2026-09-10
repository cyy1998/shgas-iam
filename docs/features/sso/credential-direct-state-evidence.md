# Credential 直接定位证据

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本页记录 [#172](https://github.com/cyy1998/shgas-iam/issues/172) 对 [Spec #170](https://github.com/cyy1998/shgas-iam/issues/170)
的 Credential 切片。固定 review base 为 `8e0e25322e3a3924410d1f813014a7f2a3e1327a`；功能分支为
`codex/token-state-records`，目标为 `main`。三类 token 当前均为新布局，Binding仍按ID；切片采样保留其原基线语境。
全部验收见[最终账本](token-state-contract.md)，代码交付不表示环境切换。

## 模型与证据范围

完整 Credential token 经 SHA-256 定位 `<ns>state:c:<digest>`，一次 Lua 取得该记录与 Redis 时间。
`<ns>id:c:<credentialId>` 只保存摘要，供按 ID 管理、协议关联和不确定签发补偿；摘要和 ID 都不是 bearer。
Credential 不保存 lookup HMAC key ID；后续 #173 已迁 Artifact，Kernel HMAC 配置退役见[运行时契约](token-state-runtime-evidence.md)。
Kernel 复用 Principal 的 direct-state 原子能力，不再保留独立 Credential 四键创建器。

创建同时占用 state、ID 和索引，任一已占用即失败；索引类型异常在写入前拒绝。撤销在同一状态形成 revoked，
保留 ID、摘要、协议、Client、父/Binding、类型 metadata 与 cleanup refs，精确移除索引并保持实际计数。
正常读取不查询 ID 反向键。管理、旧观察、可续对象更新与外围 cleanup 比较原状态字节及 ID owner；不复活终态。

pending 时 state 和 ID 都无 TTL。Credential 的现有 Client/protocol pending 管理路径重试清理，成功后恢复原保留截止，
截止已过则删除；重复直接 ID 撤销保持 alreadyRevoked 计数，不承诺可靠后台清理。迟到 payload cleanup 不删除新 owner。
两种 Custom SSO 签发消费直接状态 Artifact 后使用预定新 UUID，未知提交按同一 ID 补偿；没有盲目换 ID 重签。

| 验收行为 | 直接证据 |
|---|---|
| 单 EVAL、SHA/ID/跨类型及用途拒绝、同记录撤销、空串/JSON/错误摘要、Redis WRONGTYPE | Kernel `session-kernel-credential-state.integration.test.ts` |
| 并发身份/token 占用、保留终态防覆盖、新 UUID、提交后响应失败按 ID 补偿 | Kernel `session-kernel-credential.integration.test.ts` |
| 延迟 Credential 更新与撤销竞争、旧观察保留替换对象、pending 无 TTL/原截止、迟到 cleanup 保护 | Credential state suite；共享 `direct-state-transitions.integration.test.ts` |
| Redis 时间/正负应用偏差、固定期限、父期限裁剪、根漏撤子与晚到签发、版本/代际选择和实际计数 | Kernel time/root/prepared/selected revocation 与 Custom SSO/API Core/Admin 既有完整 suites |
| Independent/Gateway 真实授权兑换到 UserInfo/authz、直接状态 Artifact 协作、签发未知补偿、固定期限及父独立 | Custom SSO Redis suites；API `custom-sso-operation-http.integration.test.ts` 及 Independent/Gateway HTTP suites |
| API 摘要/ID/根 token 误投、空串/JSON 损坏 401，Redis 观察故障 500，恢复后 200 | API operation HTTP 的两模式及 ORCAS 模式；ORCAS 使用可控出站，不证明外部服务实际幂等/撤销 |
| 正式 Provider 签发 opaque AccessToken、UserInfo、ID/摘要误投、损坏 401、Redis 类型故障 500、peer 保留 | OIDC `subject-access-authorization.integration.test.ts` |
| Provider payload 的 Credential ID/主体、认证时间、Binding/Snapshot 关联、精确销毁与 cleanup、父独立 | OIDC 既有正式 HTTP/Redis 与 adapter suites；Provider 原始 token 引用存储保持 |
| 源/目标孤立损坏无 TTL 库存、dry-run、部分失败重跑、独立扫描和非目标保留 | OIDC `client-protocol-artifact-cleanup.integration.test.ts`，Kernel owner 已增加 `state:c:`/`id:c:` |

该票原 Credential previous-key Component 测试曾以更换 HMAC 配置后仍可读取且不存 bearer 证明确定性摘要；配置退役后的替代验证与实际运行结果见[运行时契约](token-state-runtime-evidence.md)。
OIDC Component 的删除故障夹具现让 transaction DEL 经过同一故障开关，继续实际验证 cleanup 失败日志。
维护和 fault fixture 随各自 owner 适配，不在消费者复制 Redis 布局。

## 实际成本观测

2026-09-10，Windows / PowerShell 7，Bun 1.3.14、Node 24.18.0、pnpm 11.14.0、ioredis 5.11.1、Redis 8.8.0。
基线为上述 review base，在任何 Credential 生产修改前采样；候选复用同一独占 Redis、依赖和请求。
原目标 `33305c0463747e535ccb8e1fc98b42efb598b954` 与设计 `89c04cf9fdfe6dfc7786651a63f983177581d8b0`
无运行时代码差异；本票基线已包含 #171 的 Principal 优化，不能把 OIDC 全端点数字直接当作原目标的成本。

配置专用 `IAM_API_TEST_REDIS_URL` 或 `IAM_OIDC_PROVIDER_TEST_REDIS_URL` 后分别运行：

```bash
pnpm --filter @iam/api exec bun test --max-concurrency=1 test-integration/redis/custom-sso-operation-http.integration.test.ts --test-name-pattern 'Public UserInfo'
pnpm --filter @iam/oidc-provider exec vitest run --config vitest.integration.redis.config.ts test-integration/redis/subject-access-authorization.integration.test.ts -t 'observes successful UserInfo' --disableConsoleIntercept
```

API 通过正式 Kernel 高熵根创建、Custom SSO authorize 与兑换得到 token，再请求实际 Hono middleware/主体交付。
Barrier、Client/Gate、Facts 是可控出站，采样的 Redis 只覆盖 Kernel；各入口先 warmup 并 ECHO 排空 MONITOR 后采样五次。
Independent UserInfo、Gateway UserInfo/authz 基线每次客户端命令均 `GET,GET,GET,EVAL`，4 往返/4 串行波次；
候选均 `EVAL`，1 往返/1 波次，Lua 内部 `TIME,GET` 不额外算网络往返。Kernel 局部一次读取另有直接行为断言。

下表按样本 0–4 排列，单位 ms。命令耗时是客户端发出到完成的观察值，包含 Redis 执行与调度，并非纯网络延迟或 SLA。

| 版本 / 入口 | 请求墙钟五次 | 命令往返耗时五组 |
|---|---|---|
| 基线 Gateway UserInfo | 2.266;2.567;2.184;2.186;2.799 | 0.415,0.358,0.360,0.487;0.606,0.377,0.355,0.429;0.485,0.351,0.368,0.421;0.491,0.355,0.353,0.441;0.620,0.407,0.407,0.598 |
| 候选 Gateway UserInfo | 1.264;1.104;1.431;1.155;1.170 | 0.658;0.510;0.811;0.560;0.580 |
| 基线 Gateway authz | 2.578;2.168;2.385;2.958;3.330 | 0.426,0.435,0.406,0.557;0.420,0.341,0.398,0.432;0.450,0.476,0.393,0.535;0.494,0.535,0.533,0.785;0.902,0.456,0.443,0.619 |
| 候选 Gateway authz | 0.917;0.873;1.009;0.965;0.860 | 0.494;0.475;0.558;0.492;0.465 |
| 基线 Independent UserInfo | 3.423;2.470;2.135;3.997;1.968 | 0.842,0.823,0.646,0.510;0.508,0.409,0.457,0.468;0.418,0.357,0.331,0.394;2.120,0.387,0.365,0.504;0.443,0.339,0.296,0.375 |
| 候选 Independent UserInfo | 0.704;0.750;0.820;0.789;1.168 | 0.422;0.389;0.421;0.370;0.527 |

OIDC 使用正式 Provider Code→Token→UserInfo HTTP 工厂，真实 Kernel、Binding、协议 Redis 与主体缓存；Client/Gate、
账户和事实来源仍是 fixture 出站。它观察 writer 的全部命令，包括 Kernel 两次 Credential 解析和其他协议/授权检查，
不能把结果称为整个生产基础设施成本或一次往返端点。该既有窗口记录逐命令 RTT，没有独立保存请求总墙钟。
每组实际命令与串行波次均相同：

- 基线 18 次：`GET,GET,GET,EVAL,GET,MGET,GET,MGET,GET,GET,GET,EVAL,GET,GET,EVAL,GET,EVAL,MGET`。
- 候选 12 次：`EVAL,GET,MGET,GET,MGET,EVAL,GET,GET,EVAL,GET,EVAL,MGET`。

| 样本 | 基线逐命令 RTT（ms） | 候选逐命令 RTT（ms） |
|---|---|---|
| 0 | 0.497,0.400,0.585,0.480,0.423,0.464,0.360,0.381,0.400,0.405,0.453,0.436,0.333,0.338,0.408,0.326,0.618,0.349 | 0.639,0.528,0.446,0.465,0.440,0.608,0.480,0.456,0.511,0.461,0.643,0.505 |
| 1 | 0.690,0.452,0.411,0.682,0.540,0.408,0.502,0.435,0.454,0.413,0.505,0.527,0.423,0.397,0.464,0.449,0.483,0.814 | 0.677,0.627,0.566,0.704,0.422,0.547,0.476,0.531,0.595,0.490,0.601,0.707 |
| 2 | 0.768,0.467,0.422,0.545,0.708,0.609,0.447,0.502,0.483,0.488,0.412,0.492,0.491,0.467,0.499,0.531,0.528,0.393 | 0.521,0.628,0.472,0.439,0.418,0.539,0.504,0.433,0.490,0.421,0.577,0.397 |
| 3 | 0.669,0.441,0.450,0.419,0.415,0.384,0.453,0.489,0.416,0.429,0.377,0.410,0.430,0.456,0.389,0.436,0.518,0.382 | 0.624,0.452,0.495,0.401,0.402,0.486,0.463,0.390,0.427,0.432,0.683,0.354 |
| 4 | 1.275,0.891,0.772,0.818,1.211,0.770,0.507,2.636,0.713,0.428,0.393,0.456,0.563,0.591,0.592,0.486,0.683,0.556 | 0.570,0.576,0.402,0.398,0.477,0.441,0.409,0.457,0.407,0.376,0.573,0.443 |

本地有界原始日志为 `test-results/ticket-172-baseline-api.log`、`ticket-172-baseline-oidc.log`、
`ticket-172-candidate-api.log`、`ticket-172-candidate-oidc.log`，不提交生成产物。
固定最终候选、完整验证命令/结果与双轴评审沿 #172 验收评论读取；原目标完整对照见[成本证据](token-state-cost-evidence.md)，全链聚合见[最终账本](token-state-contract.md)。
全仓 `pnpm verify` 留给最终聚合；本票没有数据库 schema、浏览器或 Gateway 配置变更，不新增完整系统 E2E 或自动部署演练。
实际停流、清理、统一版本和重新登录 smoke 按[全体下线手册](../../releases/online-auth-redis-time-cutover.md)由环境 owner 验收，尚未执行。
