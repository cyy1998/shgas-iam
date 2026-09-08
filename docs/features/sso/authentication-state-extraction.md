# 认证状态能力提取验收

Status: Current

Last verified: 2026-09-08

Next review: 2026-10-31

[Spec #122](https://github.com/cyy1998/shgas-iam/issues/122) 的五个切片按 #123—#127 顺序实施。
本文核对当前实现与全部 50 条用户故事，不表示已合入、部署或执行环境清理。最终固定候选、命令退出状态和独立双轴评审结果由对应 issue 评论记录，父 Spec 的聚合验收另行完成。

## 当前公开边界

`@iam/session-kernel` 唯一拥有四类生命周期状态，公开 root、maintenance、testing。`@iam/custom-sso` 唯一拥有完整协议流程、Grant 状态与 wire，公开 root、wire、cleanup、maintenance、testing。所有出口均显式声明，无内部目录通配或旧路径兼容转发。

API 提供 Client/Snapshot/Secret、User、ORCAS、审计与日志的具体能力，以及 HTTP/Cookie、门户 decision 和 request capability 桥接。独立 cleanup 只接收 Redis，内部构造 Grant store；先注入 Kernel，再由 API 构造完整 Custom SSO。OIDC 生产只消费 cleanup/maintenance，连接的创建和关闭仍由 runtime 负责。wire 直接消费中性 Projection 根接口，不通过服务端 root 加载流程。

## 证据索引及复用边界

- **K**：[Kernel Component](../../../packages/session-kernel/test-integration/component/session-kernel.integration.test.ts) 与同 owner 的 Redis collection；#125 已执行四类生命周期、时间、索引、tombstone、pending cleanup 及 API/Admin/OIDC 消费验证。
- **A**：[API 混合认证和协议矩阵](../../../apps/api/test-integration/component/custom-sso-session-kernel.adapter.integration.test.ts)；保留四种统一认证 production composition、Kernel/Grant 时序、Snapshot、错误、补偿与审计协作。测试经 testing 入口注入可控故障，生产只消费 root。
- **C**：[Custom SSO Component](../../../packages/custom-sso/test-integration/component/authorize-sso.use-case.integration.test.ts) 及同目录兑换、callback、主体交付、Grant 矩阵；新 owner 收集原纯协议测试。没有删除原状态机断言。
- **R**：[完整 root 与独立 cleanup 真实 Redis](../../../packages/custom-sso/test-integration/redis/custom-sso.integration.test.ts) 和[Grant Redis](../../../packages/custom-sso/test-integration/redis/authorization-grant-redemption.integration.test.ts)；三种模式通过正式 factory 授权/兑换/UserInfo/退出，坏 redirect 后仍可合法兑换，Kernel 撤销同步删除 Grant 并保留非目标状态；Grant 期限、heartbeat、接管、单赢家保持真实 Redis 验证。
- **O**：[OIDC 精确清理与维护](../../../apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts)，以及 API/OIDC Composition/Process collections；OIDC 使用独立 cleanup，真实 Grant seed 改为生产 owner prefix 并按精确 key 登记清理，不用自定义测试 prefix 假装生产装配。
- **W**：[wire contract](../../../packages/custom-sso/src/__tests__/custom-sso-v2.contract.test.ts)、Admin/SSO Unit/Component、production build 及 preview/UserInfo Browser；#126 的已执行证据记录在该票评论。
- **S**：package exports、消费方 typecheck、Architecture Guard、Collection Guard、Docker closure 和文档检查。

#123 的统一身份认证归属与 #125 未修改的 Kernel/Admin 专属行为证据继续有效。#124 的 app 内完整协议归属和旧路径证明失效，改由 C/A/R/S 核对；#125 的 Grant 在 API Core 的装配与测试归属失效，改由 R/O/S 核对。#126 的 wire 算法与前端页面未改，但加入服务端依赖使浏览器加载与 Docker closure 的旧候选证据不足，因此在 #127 重跑两前端构建、消费测试及必要 Browser。所有被迁动或更换入口的测试均重新执行，不把前票通过数字直接记为本票结果。

## 50 条用户故事逐项核对

| 故事 | 当前实现与验收结论 | 直接证据 |
|---|---|---|
| 1 | Session Kernel 独立 owner，旧 API Core Kernel 删除 | K、S；#125 |
| 2 | 完整 Custom SSO 与 Grant 独立 owner | C、R、S |
| 3 | Kernel 不依赖 Custom SSO/API | K、S；#125 |
| 4 | API 只消费完整授权/兑换等操作 | A、C、R |
| 5 | 密码与手机仍创建 Principal Session | A；#123/#125 |
| 6 | OA/微信仍由 API 认证 composition 创建 Principal Session | A；#123/#125 |
| 7 | 统一认证使用独立 Principal Session 窄接口 | A、S；#123 |
| 8 | 授权校验 Client 状态、模式及 allowlist | C、R |
| 9 | 有效 Session 续接，不创建新根会话 | A、R |
| 10 | 协议返回 absent/invalid/valid，门户拥有 decision/Cookie | A、C |
| 11 | Independent 校验 Secret/client/redirect 并返回 Credential/wire | A、C、R |
| 12 | Gateway callback 完整建立 Local Session | A、C、R |
| 13 | ORCAS 时机、交付与失败重试保持 | A、R |
| 14 | 模块拥有外部调用与补偿顺序 | A、R |
| 15 | API 提供具体外部能力，包使用自有窄 ports | A、S |
| 16 | redirect/version 错误在 reservation 前拒绝，不烧码 | A、C、R |
| 17 | Grant 单赢家、renew/release/consume/takeover 保持 | A、C、R |
| 18 | Grant 使用 Kernel Artifact 身份和权威期限 | A、R |
| 19 | Independent 投影先于签发，复核先于消费 | A、R |
| 20 | 每类失败保持 release/精确撤销/等待接管 | A、C、R |
| 21 | 一次请求贯穿入口接受的 Snapshot | A、C |
| 22 | Public UserInfo 交付协议受控投影 | A、C、R |
| 23 | Gateway 仅最小字段且编码一致 | A、C |
| 24 | logout 撤销、同步 cleanup 与 API Cookie 结果保持 | A、R、O |
| 25 | HTTP/错误/Retry-After/日志/审计语义保持 | A、C、API handlers |
| 26 | Principal 创建/解析/续期不变 | K；#125 |
| 27 | OIDC Binding 生命周期与撤销范围不变 | K、O；#125 |
| 28 | Credential identity/lookup/tombstone 与补偿保持 | K、A；#125；当前职责见 [Spec #128 最终契约](subject-access-operation-contract.md) |
| 29 | Artifact 消费、关联撤销与外围清理保持 | K、R、O |
| 30 | Redis 时间与取得时观察保持 | K、A、R；#125 |
| 31 | 提取时保留的 fence 已按 ADR-0029 退役；当前由操作许可失败关闭 | K、A；#125 |
| 32 | Admin 列表、撤销、保护及数量接口保持 | K；#125 Admin 验证 |
| 33 | 同步撤销、pending cleanup 与前向重试不变 | K、R、O；#125 |
| 34 | Bun/Node 消费实际可加载 | API/OIDC Composition/Process；#125 Admin |
| 35 | Kernel 配置和日志 owner 已独立 | K、S；#125 |
| 36 | strict V2 wire 版本/JSON/裁剪不变 | W |
| 37 | 中性 Projection/Catalog 唯一 owner | W、S；#126 |
| 38 | mismatch/invalid wire/暂态未就绪保持区别 | A、C、W |
| 39 | Admin preview 消费新 wire | W |
| 40 | wire 独立浏览器加载，不进入服务端流程 | W、S |
| 41 | OIDC 独立构造 cleanup，无完整业务流程 | O、S |
| 42 | cleanup → Kernel → Custom SSO 无循环回填 | R、O、S |
| 43 | Kernel/Custom SSO 各自公开窄维护清单 | O、S |
| 44 | namespace/key/payload 不变，不执行环境清理 | R、O、原样存储迁移 diff |
| 45 | testing 独立承担种子/构造/检查，不扩大生产出口 | A、C、R、O、S |
| 46 | Kernel/Subject Access 分 owner，混合 API 矩阵保留 | K、A、API Core collection；#125 |
| 47 | 所有仓内消费者一次切换，删除旧 app/Grant 出口 | S、全仓导入核对 |
| 48 | Guard、collections、workspace 与专用资源识别新包 | S、root orchestration tests |
| 49 | Docker closure 同步含新增服务端依赖 | S；不等同实际 image build |
| 50 | ADR/当前架构/本核对分清实现与环境操作 | 文档索引、ADR-0028、issue 记录 |

该清单记录代码与验证 seam 的对应关系；本票最终实际命令、失败修复、未执行项和评审轮次以 #127 评论为准。没有运行生产清理、迁移 Redis 数据或改变异步 cleanup 方案，#121 保持独立范围。
