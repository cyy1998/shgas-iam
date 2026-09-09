# 协议校验、操作快照与版本撤销最终契约

Status: Current

Last verified: 2026-09-09

Next review: 2026-10-31

本页逐项核对 [Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的 56 条故事、18 项实现决定与测试决定。
[#151](https://github.com/cyy1998/shgas-iam/issues/151) 拥有最终组合和维护交付；父规格的最终聚合验收由协调者独立记录。
代码验收不代表合入、部署或环境升级。人工步骤见[保留对象升级手册](../../releases/protocol-validation-preserving-upgrade.md)。

## 候选与证据复用

| 证据来源 | 固定最终候选 | 本次复用的证明范围 |
|---|---|---|
| [#147 验收](https://github.com/cyy1998/shgas-iam/issues/147#issuecomment-5596804865) | `942de42264efeceb6c52dddbf3c738ef238091c4` | 用途必填、同观察对象执行、OIDC 真实误投/精确失败、全部消费者类型适配；不证明操作配置单次获取或 Admin 版本选择。 |
| [#148 验收](https://github.com/cyy1998/shgas-iam/issues/148#issuecomment-5597493248) | `252d71e555ae31538496187d815b41b6ca5580d5` | Custom SSO 完整操作、API HTTP/Cookie、首次结果与较新对象保留；不证明 Admin PG 提交。 |
| [#149 验收](https://github.com/cyy1998/shgas-iam/issues/149#issuecomment-5597937960) | `cde39bbedc23b39059378490382548779feef032` | Provider 全回调与原生三入口、旧配置在途签发与下一调用拒绝、全部 OIDC 对象较新代保护；不证明 Admin 撤销。 |
| [#150 验收](https://github.com/cyy1998/shgas-iam/issues/150#issuecomment-5598261346) | `42b92c29a506529711524599fb9203d5ac5e0016` | Admin PG/Redis 联合提交传播、晚到/乱序/原 input 重试、双协议版本/no-op；Kernel selector/CAS/pending；新代由 Kernel 工厂签发，不是完整协议 HTTP 登录。 |
| #151 | review base 为上述 #150 候选；最终 candidate 和实际命令以本票验收评论为准 | 在前票最终树上升级两个协议旧请求测试、补清理后极迟 Code 写入，重跑受影响真实资源；不把测试存在当执行通过。 |

前票报告中的数量只属于各自候选。#151 没有修改生产代码或 E2E，未变化 owner 的 Unit/Component、API HTTP/Cookie、
全套 Admin PG 事务等结果按上表复用；新增断言与本票重跑结果单独记录。#149 的误连开发库偏差与不确定性仍以该评论为准，
不能用后续独占资源测试消除；本票专用 URL 指向准确容器，常规 `DATABASE_URL` 禁用，不调用 `db:migrate`。

## 证据入口

以下简称用于逐项表，均指生产工厂或公开 Interface 的行为测试，不指源码字符串检查。

- **K**：[Kernel Artifact](../../../packages/session-kernel/test-integration/redis/session-kernel-artifact.integration.test.ts)、
  [Credential](../../../packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)、
  [选择撤销](../../../packages/session-kernel/test-integration/redis/session-kernel-selected-revocation.integration.test.ts)。
  真实 Redis 的用途、消费、同观察对象 CAS、独立代际选择与 pending 状态。
- **O**：[OIDC 正式 HTTP](../../../apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)、
  [操作契约](../oidc/oidc-operation-snapshots.md)。真实 Provider Token/UserInfo 与原生 HTTP、Kernel、协议 store。
- **C**：[Custom SSO 操作矩阵](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts)、
  [完整操作](../../../packages/custom-sso/test-integration/redis/custom-sso.integration.test.ts)、
  [Grant](../../../packages/custom-sso/test-integration/redis/authorization-grant-redemption.integration.test.ts)。
  正式协议工厂、真实 Kernel/Grant/cleanup，Client/Barrier/投影出站 ports 使用窄替代。
- **H**：[API Public/authz HTTP](../../../apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts)、
  [兑换 HTTP](../../../apps/api/test-integration/redis/custom-sso-redemption-operation-http.integration.test.ts)。
  合法反向误投、redirect、非目标对象、Cookie 和无 ORCAS/预占作用。
- **A**：[Admin PG/Redis 联合](../../../apps/admin-api/test-integration/composition/client-protocol-revocation.integration.test.ts)、
  [Client PG mutation](../../../apps/admin-api/test-integration/postgres/client-mutation.integration.test.ts)、
  [Admin 版本撤销契约](../admin/client-protocol-revocation.md)。事务事实与实际撤销 adapter，资源证明范围分开。
- **M**：[人工维护流程](../../releases/protocol-validation-preserving-upgrade.md)。停流、保留与 smoke 尚待目标环境执行。

## 56 条故事核对

每行说明实际保护目标，来源中的相邻绿色测试不扩大该行结论；M 行是人工交付，不能标为环境通过。

| 故事 | 最终要求与直接证据 |
|---|---|
| 1 | O：合法 Custom SSO bearer 进入 `/oidc/me` 拒绝，原 Credential 回读保留。 |
| 2 | O 误投：同 Client 第二用户对象保留；C/H 反向对照相同。 |
| 3 | O/H 误投与 C 精确拒绝：另一 Client 对象保留。 |
| 4 | O 误投：Principal roots 回读存活。 |
| 5 | O 原生 `/oidc/resume`：Custom SSO Code 无对应 Cookie 拒绝，Artifact 未消费。 |
| 6 | H 两个正式 HTTP seam：合法 OIDC Credential/Code 误投 Custom SSO，对象与 roots 保留。 |
| 7 | K Artifact 与 O：同协议错误 type 在消费前拒绝，合法对象仍可使用。 |
| 8 | K/O/H：已知 Client 不匹配拒绝，不改变原对象。 |
| 9 | O Code wrong redirect、C/H stale redirect：保留 Code/Grant，无预占。 |
| 10 | O Return Handle browser binding 不符保留，后继匹配请求可继续。 |
| 11 | O/H 使用真实合法跨协议 token；C invalid credentials 独立覆盖随机输入，不相互替代。 |
| 12 | K 用途拒绝与 O/C/H：用途不符不触发 Subject Access 撤销编排。 |
| 13 | Kernel 公共类型要求 protocol/type；K resolve/consume 分别断言，全部 consumer typecheck。 |
| 14 | K/O/H：Client 与 protocol/type 一起匹配；消费再次携带原用途。 |
| 15 | C Grant/ORCAS 与 O Code/Binding：协议归属、配置、许可早于相应副作用；暂态/错误输入回读状态。 |
| 16 | K 同 identity 替换；O Code Kernel/Provider/两侧替换矩阵，旧观察不能消费替换者。 |
| 17 | Kernel 类型与 O/C 协议 owner：两协议各自校验 metadata；错误协议不会进入错误配置规则。 |
| 18 | #147 Admin Unit/Component/Redis 盘点与公共中性 Principal Interface；用途要求未扩到管理记录读取。 |
| 19 | C 旧 Credential/Code 精确撤销及 Grant cleanup，其他用户/Client/roots 保留。 |
| 20 | O 旧 Credential/Code/Binding/Return Handle 精确处理；Binding 合法从属级联另有直接测试。 |
| 21 | O/C/H configuration unavailable：拒绝但真实对象、Grant 与 Cookie 保留。 |
| 22 | O/C/H Maintenance：无消费、预占、续期或可恢复 Cookie 清除；恢复后原有效对象可用。 |
| 23 | O/C authority/cleanup failure：响应拒绝，未交付访问，不以清理成功为准入前提。 |
| 24 | K/C pending 与 A 未装配 cleanup：权威 revoked 与外围 pending 分开，未实现后台重试。 |
| 25 | O Token/UserInfo/原生、C facade：配置首次结果固定，后续校验及签发复用。 |
| 26 | O/C 独立 Gate 首次结果；中途 Maintenance 不推翻已接受调用。 |
| 27 | O/C 分别改变配置和 Gate；两个获取计数仅证明独立结果复用，不声称原子联合读。 |
| 28 | O/C success/absent/disabled/unavailable/throw 均固定，重复回调不重新裁决。 |
| 29 | O/C pending acquisition latch：并行回调共享正在进行的同一获取。 |
| 30 | O/C 下一操作重新取得；HTTP 请求与关闭后 capability 不复用旧结果。 |
| 31 | O Token 在消费/签发之间切配置仍交付旧代；C accepted redemption 和极迟 Code 在途继续。 |
| 32 | K CAS/消费并发与 C Grant removed before reservation：已接受配置不保证完成，不复活对象。 |
| 33 | A PG 返回的 committedVersion 进入实际 adapter，边界固定。 |
| 34 | O/C 本票：旧对象先读→版本选择清理→正式协议新代签发→旧请求恢复，新代访问成功；高于 Snapshot 对象仅拒绝保留。 |
| 35 | A 两协议真实传播→Kernel 新代签发→晚到撤销；边界及更高代回读保留。 |
| 36 | A 两个原命令逆序与旧 input 重试；只 `< V`，不以 `!= V` 扩大范围。 |
| 37 | A PG configure/enable/disable/remove/Secret 连续版本断言与生产 adapter；no-op 无新增撤销。 |
| 38 | A Client disable/delete 固定不同的 OIDC/Custom SSO 版本；各自边界与非目标 roots 保留。 |
| 39 | K 既有显式全 Client/协议撤销仍有独立公开能力与行为；不新增管理 endpoint。 |
| 40 | O/C 普通拒绝的对照对象保留；A 配置变更只调用 selector，显式终止接口分离。 |
| 41 | C 本票：版本清理完成后已接受操作仍能创建旧 Code，直接展示枚举非排空屏障。 |
| 42 | C 本票下一兑换按新配置拒绝旧 Code、精确删除 Grant，保留新 Code/对照/root；O/C 原晚到 Credential 下一调用亦精确拒绝。 |
| 43 | A/K pending 与工程维护边界；Runtime repair 不撤销对象，协议精确维护不代替 Runtime 传播修复。 |
| 44 | K selector 最小 metadata 副本与协议 selector Unit；Kernel 不解释版本字段。 |
| 45 | K 显式选择 Interface 与 O/C 普通请求；selector 同步只读，不进入 resolve/consume。 |
| 46 | K 三类同 identity 替换、Artifact 重新签发新 lookup owner；O Provider payload/marker/cleanup CAS 保留。 |
| 47 | K 缺坏版本跳过且每命令一次聚合计数诊断，不暴露 metadata/token。 |
| 48 | C unparseable credential/artifact、O 协议 metadata 拒绝；跳过批量不授予访问。 |
| 49 | O authorize→Token→UserInfo，C Independent/Gateway/ORCAS 正式授权兑换访问；H/API 适配保持。 |
| 50 | O 已消费 Code 重放终止与 Subject Access，C 许可一次/禁用范围与并发唯一赢家保留。 |
| 51 | O Binding/Claims Snapshot 与 C Grant/wire、原 Redis 时间 suites；#147–150 未合并协议生命周期。 |
| 52 | K/O/C/H/A 错误后回读目标、对照与 roots；错误码仅是部分断言。 |
| 53 | O HTTP、C 正式协议工厂、A PG/Redis 使用可控 Promise/观察点和独立连接；无固定 sleep 推断交错。 |
| 54 | M：核对当前数据契约、相关协议停流、Client 写冻结、旧进程排空、统一消费者；未执行。 |
| 55 | M：保留有效对象与密钥/namespace/epoch，不执行全清；独立保留基线和合法访问验收待执行。 |
| 56 | M：更早环境沿适用迁移手册；误投与合法双协议 smoke 是独立人工 gate，未执行。 |

## 实现与测试决定核对

| Implementation Decision | 最终归属与证明 |
|---|---|
| 1 | K 中性生命周期；O/C 持有协议判断，#147 删除全局 hooks，类型及误投状态验证。 |
| 2 | 必填用途 + 已知 Client；中性 Principal/管理盘点保持，故事 13–18。 |
| 3 | 用途/归属先于永久清理；许可/配置先于续期、预占、消费、出站，O/C/H。 |
| 4 | K 同观察对象原子消费/撤销；Redis 时间/取得时有效性沿既有时间 suites，O Provider 双 owner 非一般事务。 |
| 5 | O/C/H 失败矩阵；较新版本只拒绝保留，Maintenance/不可用不混同。 |
| 6 | 权威与 pending 各自可见、失败不放行，重放/Subject Access 独立；#121 未实施。 |
| 7 | O/C operation 身份、各自首次 Promise、并行获取、finally 关闭；不跨请求或后台复用。 |
| 8 | 旧 Snapshot 在途可继续，生命周期可阻止；A Snapshot 传播仍为 afterCommit，未加强 fencing。 |
| 9 | A 全 mutation 固定版本，仅 `< V`，双协议分别固定，no-op 保持。 |
| 10 | A 真实 PG 提交结果传递；Redis 在 transaction 外，unknown COMMIT 不伪造版本。 |
| 11 | K 只枚举/比较/撤销；domain OIDC selector 与 Custom SSO maintenance 公开出口拥有版本解释。 |
| 12 | K 选择阶段观察与执行比较；替换/新 lookup owner 直接回读，未新建持久身份格式。 |
| 13 | K unconfirmed 聚合诊断 + O/C 在线拒绝 + M 精确维护边界。 |
| 14 | C 清理后极迟 Code + O/C 晚到 Credential；下一调用精确拒绝，未新增队列或排空屏障。 |
| 15 | 独立显式全范围命令保持；普通请求与 Admin 配置撤销分别使用窄契约。 |
| 16 | 沿用 metadata/wire/Binding/Claims/Grant；无 protocolContext 或存储格式迁移。 |
| 17 | M 现格式停流保留对象升级，更早格式由既有迁移 owner 处理。 |
| 18 | 本页与 ADR/术语/工程验证归属同步；#71 性能和 #121 异步清理不在验收内。 |

Testing Decisions 的三个 seam 分别由 K、O/C/H、A 承担。六组必须直接场景依次对应故事 1–14、34、35–38、46–48、25–32、19–24/49–51。
本票把旧请求测试的单对象清理升级为实际版本 selector + Kernel，Custom SSO 新代从 Kernel seed 升级为正式授权兑换；
新增清理后极迟 Code 测试填补原在途测试未包含已完成枚举的缺口，保留原晚到 Credential 与真实冲突证明。
Admin 联合测试仍明确使用 Kernel 签发，不能与协议 suite 拼称同一个 PG+HTTP 测试。
没有删除仍适用的生命周期/replay/cleanup 保护，没有新建 Redis 模拟器、源码字符串 Guard、系统 E2E 或自动生产切换演练。

## 生产消费者核对与验证界限

Kernel 根 Interface 的用途参数和 `revokeObservedObject` 由 API Core Subject Access、Custom SSO、OIDC 与 Admin 按各自能力消费。
API composition 注入完整 Custom SSO/cleanup；OIDC composition 注入中性 Kernel 与 cleanup、操作 Session/Provider facade；
Admin composition 的配置变更 adapter 使用两个公开版本 selector。Provider callback、原生 interaction/login guard/resume、
API authorize/callback/token/Public/authz 全部沿当前操作入口，不存在缺省用途兼容签名。
Worker 的 Snapshot repair 与显式 epoch 工具继续独立；浏览器只消费 wire/HTTP，不取得 Kernel 权限。

上述接线由消费方全范围 typecheck、原生产 composition 与直接协议状态测试共同支持；既有 Architecture Guard 只验证依赖方向，
Collection Guard 只验证收集，不证明撤销范围。最终父级 `pnpm verify` 和额外 Integration 的实际执行由协调者记录。
