# Complete User Resignation Session Revocation

**Status:** approved

**Created:** 2026-07-16

**Approved:** 2026-07-16

## Problem Statement

管理员执行 User Resignation 时，系统已经在一个事务中结束目标用户的全部有效任职、禁用 IAM 账号、记录离职审计并标记 User Profile 失效，但事务提交后不会撤销该用户已有的活跃访问会话。因此，同一个“账号已失去访问资格”的事实只有经由通用用户状态更新路径时才会触发会话撤销，经由离职路径时却不会，导致已经离职且账号已禁用的用户仍可能凭既有会话继续访问系统。

维护者希望补全现有 User Resignation 模块的职责，而不是改变调用方协议或把离职编排重新散落到 User Service、route 或 Session Kernel。修复必须保留现有事务边界、审计、User Profile 失效与架构守卫，并明确会话撤销失败、重复离职和管理员自助离职时的行为。

## Solution

保持现有 User Resignation 对外接口与事务性状态变更不变，并为该用例注入一个由消费方拥有的最窄会话撤销端口。离职事务成功提交后，用例通过现有 after-commit 机制尽力撤销目标用户的全部活跃访问会话；撤销使用目标用户 ID、`user_disabled` 原因和当前审计上下文，不保留任何会话例外。

会话撤销失败不会回滚或反转已经生效的离职，也不会把成功的离职响应改为失败。本次不增加持久化重试队列；重复执行离职保持幂等成功，并再次尝试会话撤销，从而保留一个显式的人工恢复入口。

## User Stories

1. 作为 IAM 管理员，我希望用户离职后其全部有效任职立即结束，以便组织任职事实准确反映离职状态。
2. 作为 IAM 管理员，我希望用户离职后其 IAM 账号立即禁用，以便该用户不能建立新的访问会话。
3. 作为安全管理员，我希望用户离职事务提交后撤销其全部活跃访问会话，以便既有会话不能绕过已禁用的账号状态继续访问。
4. 作为安全管理员，我希望会话撤销覆盖该用户的所有协议和设备，以便不存在遗留的 Custom SSO、OIDC 或其他 Session Kernel 会话。
5. 作为执行自助离职的管理员，我希望自己的当前管理会话也被撤销，以便离职用户不因操作发起者身份而获得访问例外。
6. 作为 IAM 管理员，我希望离职接口在增加会话撤销后仍保持原有 REST 输入与成功响应，以便现有管理前端和调用方无需修改。
7. 作为 tRPC 调用方，我希望离职 mutation 的名称、输入和返回结果保持不变，以便现有类型化客户端继续兼容。
8. 作为 IAM 管理员，我希望离职事务失败时不触发会话撤销，以便未生效的离职不会意外中断用户访问。
9. 作为 IAM 管理员，我希望目标用户不存在时仍收到现有的用户不存在错误，以便调用方错误处理保持一致。
10. 作为 IAM 管理员，我希望会话基础设施暂时失败时已经提交的离职仍保持成功，以便系统不会把不可回滚的状态变更伪装成失败事务。
11. 作为运维人员，我希望尽力撤销任务的失败进入现有 after-commit 日志与观测链路，以便能够调查未撤销会话。
12. 作为运维人员，我希望本次修复复用现有会话撤销摘要日志，以便不引入第二套会话撤销观测模型。
13. 作为 IAM 管理员，我希望能够安全地重复执行同一用户的离职，以便网络重试或人工重试不会产生冲突。
14. 作为安全管理员，我希望重复离职再次尝试撤销全部会话，以便第一次尽力撤销失败后可以人工恢复。
15. 作为审计人员，我希望每次离职请求继续生成独立的离职审计记录，以便重复管理操作仍然可追溯。
16. 作为审计人员，我希望领域审计继续使用 User Resignation 的专有动作语义，以便离职不与普通账号禁用混淆。
17. 作为 Session Kernel 维护者，我希望收到通用的 `user_disabled` 撤销原因，以便任职领域语言不会泄漏到通用会话模块。
18. 作为 User Profile 消费方，我希望离职继续同时标记任职和用户状态变更，以便读模型在会话撤销补全后仍能正确重建。
19. 作为后端维护者，我希望 User Resignation 继续由独立 Application Use Case 拥有，以便跨任职、用户、审计、档案和会话的工作流保持局部化。
20. 作为后端维护者，我希望会话撤销依赖通过消费方拥有的窄端口表达，以便用例不依赖具体 service、repository、Redis 或 Session Kernel 实现。
21. 作为后端维护者，我希望 production composition 只负责把现有会话撤销能力连接到离职用例，以便 runtime 依赖不会静态绑定进业务模块。
22. 作为测试维护者，我希望通过一个用例级行为接缝验证完整离职协作，以便测试不必跨越 REST、tRPC 和 Session Kernel 的内部实现。
23. 作为测试维护者，我希望架构守卫继续证明离职用例与端口的所有权边界，以便未来重构不会把离职逻辑退回 Employment Service 或 route。
24. 作为维护者，我希望本次变更不修改数据库 schema、队列拓扑或部署配置，以便修复范围限定在现有应用能力内。
25. 作为维护者，我希望本次不承诺持久化自动重试，以便不会在缺少完整队列、幂等作业和运维设计时暗中扩大交付范围。

## Implementation Decisions

- User Resignation 继续作为独立 Application Use Case，拥有结束任职、禁用账号、写入审计、标记 User Profile 失效以及提交后撤销会话的完整编排。
- 结束全部有效任职、禁用账号、记录审计和登记 User Profile 失效继续位于同一个数据库事务中；任何事务内失败都阻止会话撤销任务登记。
- 会话撤销通过 transaction-owned after-commit registration 在事务提交后执行，任务模式为 best effort。
- 用例依赖新增一个由消费方直接声明的最窄会话撤销端口。端口只暴露本用例实际需要的按用户撤销行为，不从 concrete service 或 repository 类型派生。
- Production composition 把现有 admin session revocation 能力注入用例；用例不直接依赖 Session Kernel、Redis、logger 或 app-local service 实现。
- 撤销目标是该用户的全部活跃会话。即使目标用户与操作管理员是同一人，也不传递当前 principal session 例外。
- 撤销原因使用 Session Kernel 已有的 `user_disabled`。User Resignation 的专有含义继续由现有离职审计动作表达，不新增 `user_resigned` 会话原因。
- 审计上下文随撤销请求传递，以复用现有结构化撤销摘要日志和 after-commit observability。
- 会话撤销失败由现有 best-effort after-commit 机制记录并吞并；已经提交的离职结果和现有成功响应不受影响。
- 本次不新增持久化自动重试、outbox、BullMQ job 或 worker。运维可通过重复执行离职显式重试撤销。
- 对任意仍存在的用户，重复离职保持成功：幂等地再次结束有效任职、禁用账号、记录本次请求的审计、标记档案失效，并重新登记会话撤销。
- 目标用户不存在时继续抛出现有用户不存在错误，且不执行事务后副作用。
- 现有 REST route、tRPC mutation、输入、成功返回值和错误映射保持不变。
- 不修改数据库 schema、共享 API contract、Session Kernel 的通用撤销原因 schema或部署拓扑。
- 架构守卫继续要求离职由独立 use-case composition 创建和注入，并把新增撤销方法纳入 consumer-owned port 的必要能力检查。

## Testing Decisions

- 好的测试只观察 `User Resignation` 调用方可见行为与协作者协议，不断言内部函数排列、具体 import 或 Session Kernel 的 Redis 实现。
- 主要行为测试接缝是现有 User Resignation use-case facade 的 `execute` 操作。这是能够同时验证事务结果与提交后副作用的最高稳定接缝。
- 用例测试验证事务成功时仍按既有顺序结束任职、禁用账号、记录审计并标记 User Profile 失效，然后才执行会话撤销。
- 用例测试验证撤销请求包含目标用户 ID、`user_disabled` 原因和审计上下文，且不包含 principal session 例外。
- 用例测试验证用户不存在时不会修改任职或用户、不写审计、不标记档案，也不撤销会话。
- 用例测试验证任一事务阶段失败时错误原样传播，后续事务动作和会话撤销均不执行。
- 用例测试验证会话撤销只在事务成功提交后运行，而不是在事务 callback 内提前执行。
- 用例测试验证 best-effort 撤销抛错时离职仍解析为现有成功结果，并由现有 after-commit fake/runner 体现吞并语义。
- 用例测试验证重复执行会为每次成功调用再次触发撤销。
- 现有架构测试补充新增撤销端口方法与 composition wiring 的边界守卫；它不复制用例业务行为断言。
- 现有 admin session revocation port 和 Session Kernel 测试继续作为底层按用户全量撤销、原因传递、摘要记录和会话例外机制的 prior art；本功能不重复测试这些内部算法。
- 现有 REST 与 tRPC adapter tests 继续证明调用方协议未改变；除非实现意外改变其 contract，否则不增加重复的 route 行为测试。
- 受影响 admin backend 的 lint、typecheck 和聚焦测试作为 ticket 级验证；功能完成后执行仓库规定的全仓验证与 Standards / Spec 双轴评审。

## Out of Scope

- 为会话撤销失败新增持久化重试队列、outbox、定时修复任务、BullMQ job 或 worker module。
- 在离职响应中返回会话撤销摘要或暴露撤销失败。
- 修改现有 REST、tRPC、OpenAPI 或前端调用 contract。
- 新增 `user_resigned` Session Kernel 撤销原因或把 Employment 领域概念引入通用会话模型。
- 修改 Session Kernel 的索引、Redis key、会话生命周期、TTL 或撤销算法。
- 改变 User Resignation 的授权规则，包括禁止或允许管理员对自己执行离职。
- 改变目标用户不存在、事务失败、审计失败或 User Profile 失效登记失败时的现有错误语义。
- 抽取 User Service 与 User Resignation 之间的通用禁用编排，或进行更广泛的 user/employment 模块重构。
- 修改数据库 schema、数据迁移、共享 DTO、部署清单或网关配置。
- 处理架构审查报告中的其他候选模块。

## Further Notes

- 当前 User Service 的账号禁用路径已经通过同一个 admin session revocation capability，在事务提交后以 best-effort 模式撤销用户会话；本功能复用该已验证模式。
- User Resignation 的领域定义已经明确：离职状态原子生效，会话终止失败不反转离职，全部会话均无例外，重复执行仍成功并再次尝试终止会话。
- “不做持久化重试”是本次可逆的范围选择，不是永久禁止未来引入可靠撤销工作流的架构决策。
- 本功能没有形成满足长期 ADR 门槛的新决策；既有领域词汇与本规格足以记录当前共识。
