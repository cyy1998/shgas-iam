# Custom SSO Credential 独立访问证据

Status: Current

Last verified: 2026-09-09

Next review: 2026-10-31

本文保存 [#166](https://github.com/cyy1998/shgas-iam/issues/166) 的访问与性能观察。目标来自 [Spec #163](https://github.com/cyy1998/shgas-iam/issues/163)
及 ADR-0033；当前协议规则见[操作契约](custom-sso-protocol-validation.md)。本地候选不表示已合入、部署或执行全体下线。

## 固定候选与采样条件

- before 生产代码：`f7ef9815e1ac262f21687f154be97802ca95a912`。在删除任何生产父读取之前，先增加未提交的 Kernel 测试命令观测与 API HTTP 采样，再实际执行；不是改完后的静态估算。
- after 生产与测试代码：`59d69df8fc5f67091aa512a6593132cd538c90a5`。本报告后续提交只登记证据，不改变该生产树。
- Windows 本机、Bun 1.3.14、ioredis 5.11.1、Docker Server 27.5.1；Redis 8.8.0，仓库镜像 `docker.xuanyuan.run/library/redis:8.8.0`。
- 同一任务专属容器 `6a1b001650550cdf43cba41adb73ee1440fbef835336c634c10f0de944daaa05`，动态宿主端口 39286；API 独占 DB 1，Kernel namespace 每例独立。其他 owner 串行运行、使用不同 DB，不复用开发或生产资源。
- 全部资源测试完成后已按上述准确 ID 删除容器；各测试 owner 在退出时清理其 namespace 并关闭连接。
- before 命令：`pnpm --filter @iam/api exec bun test test-integration/redis/custom-sso-operation-http.integration.test.ts`；after 命令：`pnpm --filter @iam/api test:integration:redis`。二者执行同一文件内同一采样块；after 整包其余测试在采样区间之外。
- 三个正常成功入口分别先完成一次不计入结果的 warmup，然后串行采样 5 次，全部 HTTP 200。Gateway-ORCAS、IAM 根 token 及失败路径不进入性能表。

使用现有 Hono `app.request`、正式 Public authentication handler、正式 authz route/error middleware、实际 Custom SSO operations、Projection 和 Kernel Redis adapter。
Client 配置、Traffic Gate、Subject Access Barrier、Facts、Secret 和 ORCAS 出站使用本地替身；因此表中的 Redis 流量仅覆盖 Kernel 部分，
不包含 production Snapshot/Barrier/Facts 的 Redis/PG 读取、TCP HTTP 服务器、APISIX 或真实第三方。没有通过父进程 spy 推断子进程流量。

Kernel `/testing` 在其 writer ioredis `sendCommand` 调用前与 Promise 完成时记录单调时间，输出只含命令名与区间。
这里的 RTT 是客户端观测的命令往返耗时，包含本机调度、传输、Redis 执行和客户端处理，**不是纯网络传播时延**。
同一次请求内按开始时间排序，将相交的在途区间合并为一波；下一个区间开始时间不早于当前波结束时，记新波。
本组所有区间均不相交，故 6→4 波来自实际区间，不是从 MONITOR 计数推算。

同一独占 Redis 另用 MONITOR 观察服务端命令，按 `source=lua` 区分 Lua 内部调用与客户端请求。
每次请求完成后发送 ECHO marker，等待监控连接看到它再收束样本；marker 与观测连接初始化不计入样本。
MONITOR 不输出参数、token、Subject、完整 key 或 marker。时间表保存客户端区间；MONITOR 只证明命令类别与数量，不能独立证明 RTT。

## 实测结果

| 正常入口 | 客户端命令 before→after | Lua 内部命令 before→after | 串行波次 before→after | 每请求累计 RTT 中位数 before→after（ms） | 累计 RTT 范围 before→after（ms） |
|---|---|---|---|---|---|
| Gateway authz | 6→4 | 4→2 | 6→4 | 2.7686→1.8385 | 2.4492–3.3345→1.6934–4.1400 |
| Gateway UserInfo | 6→4 | 4→2 | 6→4 | 2.7739→1.9134 | 2.2254–5.1431→1.7736–3.6224 |
| Independent UserInfo | 6→4 | 4→2 | 6→4 | 2.9357→1.5068 | 2.5598–6.6529→1.4602–1.6009 |

每行 5 个样本的命令序列相同：before 客户端为 `GET, GET, GET, EVAL, GET, EVAL`，Lua 内部为 `TIME, GET, TIME, GET`；
after 客户端为 `GET, GET, GET, EVAL`，Lua 内部为 `TIME, GET`。包含 EVAL 本身在内的服务端总命令由 10 减为 6。
源码路径核对与上述真实观察共同证明 `resolveValidatedCustomSsoCredential` 的父读取退役；自身 lookup、tombstone 与生命周期检查仍存在。
样本量小、运行受本机调度影响，不承诺毫秒预算，不把此次局部结果解释为 [#71](https://github.com/cyy1998/shgas-iam/issues/71) 全热路径完成，
也没有实施 [#137](https://github.com/cyy1998/shgas-iam/issues/137) 的 token 定位或存储布局优化。

## 行为与验证归属

| 要求 | 实际证据 |
|---|---|
| 根撤销但 Credential 漏撤可用 | API redemption HTTP/Redis 三模式：正式 `/sso/logout` 配 owner 的一次子枚举失败；独立连接观察根 revoked、Credential resolved；两模式 UserInfo 与 Gateway authz 返回 200，仍每操作一次许可。 |
| 自身撤销、消失或到期拒绝 | 同一 HTTP seam 先精确撤销后访问 401；签发结果返回前用独立连接撤销或删除凭据，原取得的响应可交付，但凭据不复活、后续 HTTP 401。受控晚到凭据一秒固定期限到达后也返回 401，peer 保留。 |
| 已观察根的晚到签发 | 在 Kernel 完成真实根观察、尚未写 Credential 的同步点暂停；正式 logout 完成且根 revoked 后释放。两模式 callback/token 成功，凭据 context 原样继承、fixed_at_issue、期限不越过观察到的根上限，后续 HTTP 可用。没有用固定等待猜测撤销顺序。 |
| 新操作仍查根 | 撤根前保留 Code；撤根后兑换返回 401，独立读取 Code 仍未消费。新授权失败、续接 invalid；IAM 根 token 的 Public HTTP 也在根撤销后拒绝。 |
| 严格身份与代际 | API Public/authz 对缺失、坏 JSON、非法 transition UUID、主体矛盾 context 拒绝，未读取 Barrier/Facts，原根和 peer 保留；不从父或当前代际修补。Custom SSO 完整 Redis 保留旧代、新代、用途、模式、较新配置、暂态、CAS 和非目标测试。 |
| 取得时有效性 | API Component 两模式保留签发观察后到期仍交付原 TTL、下一调用过期拒绝；删除签发后的父读取时没有新增期限复裁。旧“父缺失必然拒绝凭据”改为主体来自 Credential；Gateway after-issue 撤根断言改为在途响应允许完成而实际撤销对象不能访问。 |
| 一次消费与精确失败 | 完整 Custom SSO/API Component 和 Redis 保留唯一赢家、重放、redirect/Client 认证、配置/Gate、消费后失败重新授权和同步精确补偿；本票不改变 logout 的所属根范围。 |

本票已执行 Kernel、Custom SSO、API 的完整 typecheck、Unit、Component、Redis；计数分别为 Unit 5/32/41、Component 30/33/342、Redis 46/107/12。
`pnpm verify:static`、`pnpm check:docs`、`git diff --check` 通过。每轮交接的固定候选、复核命令和双轴评审结果以 #166 评论为准，报告存在不等同于评审通过。
未执行 PostgreSQL、production process/composition、浏览器、全系统 E2E 或全仓 `pnpm verify`：本票采用上述已声明的现有 HTTP/Redis seam，
没有修改数据库、生产装配或浏览器入口；父规格最终聚合验证由协调者执行。真实停流排空、全体下线、统一版本与重新登录仍由发布负责人验收，环境未切换。

## 原始客户端区间

每个区间为该次 HTTP 采样开始后的 `startMs→endMs`，保留四位小数；RTT 是未舍入区间差。顺序与上面的命令序列对应。
下面的累计 RTT 先按原始精度求和再舍入，不能用已舍入区间反算最后一位。

| 阶段 | 入口 | 样本（从 0 起） | 命令在途区间（ms） | 累计 RTT（ms） | 波次 |
|---|---|---|---|---|---|
| before | gateway userinfo | 0 | 0.1743→0.7890, 0.8096→1.1532, 1.1701→1.5622, 1.5801→2.0619, 2.4618→2.8935, 2.9077→5.7869 | 5.1431 | 6 |
| before | gateway userinfo | 1 | 0.2074→0.6244, 0.6313→1.0217, 1.0361→1.3503, 1.3616→1.8157, 2.2003→2.5874, 2.5995→2.9820 | 2.3453 | 6 |
| before | gateway userinfo | 2 | 0.2334→0.6402, 0.6473→1.1190, 1.1285→1.6955, 1.7066→2.1711, 2.4718→2.8684, 2.8794→3.3467 | 2.7739 | 6 |
| before | gateway userinfo | 3 | 0.1655→0.6580, 0.6672→1.1673, 1.1766→1.7055, 1.7319→2.4146, 2.7368→3.2355, 3.2496→5.0218 | 4.4751 | 6 |
| before | gateway userinfo | 4 | 0.1647→0.6581, 0.6651→1.0119, 1.0204→1.3077, 1.3165→1.6962, 2.0501→2.4309, 2.4450→2.7824 | 2.2254 | 6 |
| before | gateway authz | 0 | 0.1594→0.5680, 0.5740→1.0034, 1.0122→1.4173, 1.4269→1.8685, 2.1656→2.6161, 2.6261→3.1147 | 2.6238 | 6 |
| before | gateway authz | 1 | 0.3479→0.8320, 0.8409→1.2474, 1.2544→1.6045, 1.6164→2.0476, 2.3048→2.6647, 2.6831→3.1005 | 2.4492 | 6 |
| before | gateway authz | 2 | 0.3048→0.9271, 0.9340→1.7415, 1.7535→2.2128, 2.2266→2.7663, 3.2115→3.7085, 3.7273→4.1360 | 3.3345 | 6 |
| before | gateway authz | 3 | 0.1998→0.6266, 0.6412→1.0401, 1.0483→1.5529, 1.5644→2.0007, 2.2938→2.8787, 2.8980→3.3151 | 2.7686 | 6 |
| before | gateway authz | 4 | 0.2097→0.6646, 0.6711→1.1242, 1.1613→1.6929, 1.7089→2.2659, 2.5953→3.0993, 3.1111→3.5954 | 2.9849 | 6 |
| before | independent userinfo | 0 | 0.1819→0.6815, 0.6902→1.1176, 1.1268→1.5366, 1.5501→5.2582, 6.1086→7.0451, 7.0673→7.7388 | 6.6529 | 6 |
| before | independent userinfo | 1 | 0.4331→1.1877, 1.1937→1.5741, 1.5788→1.9321, 1.9400→2.2999, 2.6328→3.0324, 3.0403→3.3523 | 2.5598 | 6 |
| before | independent userinfo | 2 | 0.1350→0.5969, 0.6025→1.0250, 1.0345→1.5680, 1.5778→2.0663, 2.5723→3.1279, 3.1370→3.6107 | 2.9357 | 6 |
| before | independent userinfo | 3 | 0.1551→0.6191, 0.6248→2.1097, 2.1233→2.6325, 2.6403→3.2261, 3.6450→4.1599, 4.1690→4.6157 | 4.0055 | 6 |
| before | independent userinfo | 4 | 0.2014→0.7866, 0.8120→1.1776, 1.1954→1.5368, 1.5559→2.0525, 2.4644→3.0184, 3.0266→3.4427 | 2.7589 | 6 |
| after | gateway userinfo | 0 | 0.1440→0.5667, 0.5742→1.0504, 1.0647→1.5756, 1.5901→2.0180 | 1.8377 | 4 |
| after | gateway userinfo | 1 | 0.2102→0.6218, 0.6285→1.0085, 1.0158→1.3589, 1.3699→3.8576 | 3.6224 | 4 |
| after | gateway userinfo | 2 | 0.2376→0.8228, 0.8325→1.3456, 1.3731→1.8112, 1.8235→2.3384 | 2.0513 | 4 |
| after | gateway userinfo | 3 | 0.1346→0.5970, 0.6053→1.0307, 1.0402→1.4354, 1.4454→1.9360 | 1.7736 | 4 |
| after | gateway userinfo | 4 | 0.1031→0.5726, 0.5782→1.0789, 1.0937→1.5320, 1.5455→2.0504 | 1.9134 | 4 |
| after | gateway authz | 0 | 0.1427→0.5412, 0.5464→0.9835, 0.9920→1.2976, 1.3919→4.3907 | 4.1400 | 4 |
| after | gateway authz | 1 | 0.1934→0.7349, 0.7402→1.1284, 1.1359→1.5029, 1.5119→1.9086 | 1.6934 | 4 |
| after | gateway authz | 2 | 0.1389→0.5762, 0.5819→1.2158, 1.2275→1.6421, 1.6578→2.3459 | 2.1739 | 4 |
| after | gateway authz | 3 | 0.2652→0.7981, 0.8043→1.2187, 1.2254→1.5914, 1.6028→2.0851 | 1.7956 | 4 |
| after | gateway authz | 4 | 0.1569→0.6140, 0.6218→1.0810, 1.0882→1.5153, 1.5265→2.0216 | 1.8385 | 4 |
| after | independent userinfo | 0 | 0.0751→0.5058, 0.5093→0.8254, 0.8290→1.2426, 1.2479→1.6884 | 1.6009 | 4 |
| after | independent userinfo | 1 | 0.1271→0.4637, 0.4698→0.8275, 0.8338→1.1442, 1.1506→1.6527 | 1.5068 | 4 |
| after | independent userinfo | 2 | 0.0937→0.5001, 0.5033→0.8501, 0.8535→1.1610, 1.1663→1.6176 | 1.5120 | 4 |
| after | independent userinfo | 3 | 0.0944→0.4705, 0.4738→0.8100, 0.8129→1.1516, 1.1565→1.5657 | 1.4602 | 4 |
| after | independent userinfo | 4 | 0.1257→0.5312, 0.5344→0.8500, 0.8535→1.2077, 1.2137→1.6078 | 1.4694 | 4 |
