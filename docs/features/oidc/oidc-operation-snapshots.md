# OIDC 操作内配置与 Gate 契约

[Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的
[#149](https://github.com/cyy1998/shgas-iam/issues/149) 负责 OIDC 的操作内首次结果复用。
长期决定见 [ADR-0030](../../adr/0030-separate-protocol-validation-from-kernel-lifecycle.md)。
本文描述代码契约；候选验证、评审与环境切换分别由 ticket 和发布负责人记录。

## 操作范围与接线

一次 Provider HTTP 请求，或一次原生 interaction、login guard、resume HTTP 请求，各自拥有一个
Subject Access operation。浏览器跳转、Code 兑换和 UserInfo 是新的调用，各自重新取得事实。

`createOidcSessionOperations` 以 operation 身份保存本次配置与 Gate 的 reader，以及 Session adapter。
同一 Client 的 `findRuntime` 与 `findActiveVersion` 共享一份配置结果，版本从该配置派生；Gate 使用独立的首次
`check` 结果。并行调用共享进行中的 Promise；成功、absent、明确拒绝、unavailable 和抛出的读取错误都固定到操作结束。
两类获取各自独立，不代表来自同一个原子联合 Snapshot，也不修改共享 Snapshot Module 的 control/CAS/retry 规则。

Provider composition 将这些 reader 接入 Client metadata、协议对象 Adapter、Claims、interaction policy 和流量判断。
Session、Interaction、Grant、Code、AccessToken 的 Provider 读写，以及 Kernel Binding、Code、Credential、Return Handle
的协议校验使用同一个 operation。多次取得 facade 不会产生第二份配置或 Gate 判断。退出读取复用该操作的配置，
同时保留不要求目标 Subject Access Permission 的中性终止路径。

Provider middleware 在 `ctx.state` 保存 operation；原生分发显式 `run`，以桥接内部的 AsyncLocalStorage
把同一 operation 传给 `interactionDetails`、`Interaction.find`、`interactionFinished` 间接调用的 Provider storage
callbacks。原生方法本身不会进入 Provider 的请求 ALS。两种入口都在 `finally` 关闭 operation；reader 在获取前和完成后
检查活跃状态，结束后捕获的 reader、facade 或后台 callback 不能沿用结果。缓存不跨请求，不写入凭据或持久化 metadata。

## 在途请求与失败处理

### 已签发 AccessToken 的独立使用

[#167](https://github.com/cyy1998/shgas-iam/issues/167) 按 ADR-0033 将 Binding 读取分为 `readForAccessToken` 与
`readForAuthorization`。前者验证 Binding 自身期限、撤销、用途、配置、lookup owner 与 anchor 归属，从 Binding 的可信
主体取得身份，不解析父 Principal Session，也不经账户 adapter 补齐身份。Claims 不再持有根 resolver。
后者继续验证根及其主体、认证时间，供新签发与 Provider Session 保存使用；根登录、interaction、续接与 Code 兑换仍查根。

AccessToken 的 Provider 模型没有顶层 `authTime`。Token extra 从已验证 Code 继承认证时间，Credential 签发先比较该值与
Binding，再写入自身 metadata；UserInfo 比较 Token extra、Credential metadata 和 Binding 的认证时间，并保留主体、scope、
Client、Principal Session、Provider Session、Binding identity 与配置版本的一致性。缺失字段不回源父或当前账号修补。
这是统一版本后的协议状态，不提供旧 Token 兼容；发布按 Spec #163 复用全体在线状态下线流程。

正式根撤销只尽力处理子对象。漏索引而保留的 Credential、Binding 和协议配套状态可以继续访问；自身撤销、到期或配套无效
仍拒绝。取得时有效的根和 Binding 允许在途签发继续，之后已撤销或删除的对象不会复活；在途响应可交付不表示后继访问成功。
不增加提交时父屏障，签发仍受已观察根当前及绝对期限裁剪，Binding、lookup、anchor 使用原绝对期限；OIDC 根与 Binding
续期保持。真实请求观察及具体证明范围见[独立访问证据](oidc-credential-authority-evidence.md)。

已取得的旧配置和正常 Gate 允许当前调用继续消费 Code、处理 Binding、签发 Token 和交付 Claims；不在提交或响应前
再次取得新配置来推翻本操作判断。当前对象缺失、已撤销、已消费或 CAS 冲突仍可使操作失败，首次结果不是完成保证。
极迟签发的旧代对象在后续请求取得新配置时被拒绝并精确处理。

用途、已知 Client、redirect 和浏览器归属不符只拒绝。确认旧代或其他永久失效时，最多精确撤销已观察对象及其合法从属对象。
若对象版本高于本操作配置，只能确认本次无法接受，不能判定对象已永久过期；Binding、Code、Credential、Return Handle
及 Provider 协议对象保留，后续取得匹配配置的调用仍可使用。缺失配置沿既有协议不可用规则处理，不补建未知版本。

Maintenance、Gate unavailable 和配置/Gate 读取异常不触发永久清理，不消费、续期或清除可恢复 Cookie。
错误仍由原 OIDC 边界映射，不把一般读取失败伪装成明确 Maintenance。清理失败不放行，权威撤销、外围 cleanup pending
及显式恢复继续由原 owner 处理。Subject Access 拒绝和已消费 Code 重放保留其各自终止范围。

Snapshot 的新请求可见性仍受成功 Runtime invalidation 约束；PostgreSQL 提交但传播失败的窗口由
[ADR-0021](../../adr/0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 和
[ADR-0022](../../adr/0022-adopt-snapshot-consistency-for-client-traffic-gate.md) 拥有。本票不增加强 fencing、跨 owner
事务、新队列或持久化身份模型；Admin 的固定版本批量撤销见[当前契约](../admin/client-protocol-revocation.md)，最终组合与发布边界见[56 条故事核对](../sso/protocol-validation-contract.md)。

## 验证归属

- `@iam/oidc-provider` 的 Redis profile 通过正式 Session/Provider/HTTP 工厂和真实 Redis，验证 Token、UserInfo 多回调、
  三个原生入口、并发首次获取、拒绝与暂态失败固定、后继请求重取、操作关闭、新代保留以及真实状态回读。
- 原 #147 依赖第二次版本获取的 Code 清理交错改为在已确认旧代、准备精确撤销时暂停；继续验证观察对象被替换、
  Provider payload/consumed marker 保留以及 production upsert 和 pending cleanup 的 owner 保护。独立 Provider 对象
  版本判断仍由真实 Redis adapter 行为覆盖，不用重复读取制造与新契约相反的结果。
- Component 保留 Session、Binding、Claims 等协作和错误契约；fixture 的完整配置与版本一致，不再用
  `findRuntime = null`、`findActiveVersion = 1` 表达一个合法 Client。Composition 使用真实 PostgreSQL、Redis 和生产进程验证装配。
- 读取次数只证明本操作一致性，不代表 [#71](https://github.com/cyy1998/shgas-iam/issues/71) 的端点 I/O 或性能预算完成。
  Redis 时间、生命周期、CAS 和双 owner 恢复的原有证明范围保持；浏览器 E2E 与实际停流切换不由这些测试替代。
