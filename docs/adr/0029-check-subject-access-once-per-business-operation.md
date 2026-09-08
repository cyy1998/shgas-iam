---
status: accepted
---

# 在独立业务操作开始时检查一次 Subject Access

维护者于 2026-09-08 确认将 Subject Access 从 Session Kernel 解耦：同一次接口调用只作一次账号访问判断，并接受已许可的在途操作继续。原 Kernel 在解析、续期和派生时重复检查，可能在同一调用观察不同状态。Spec #128 的 #129–136 已统一正式入口并删除旧保护契约；[最终契约核对](../features/sso/subject-access-operation-contract.md)记录各 owner 的证明范围，[维护手册](../releases/subject-access-operation-cutover.md)保存协调发布步骤。代码验收不代表环境停流、清理或切换已执行。

## 已确认决定

Subject Access 的检查范围是每次接口调用所代表的独立业务操作。该次操作开始受保护的业务处理前检查一次，内部连续调用 Kernel 操作时复用此次访问许可；下一次接口调用重新检查，不将一次登录、浏览器跳转、授权码兑换和后续访问合并为一次许可。

已经通过检查的本次操作允许继续，不因处理期间账号进入 `blocking` 或 `disabled` 而追加 Subject Access 检查并拒绝。该许可不保证操作一定完成：Kernel 原有的对象存在、期限、撤销、消费及并发冲突约束仍然适用。

这一取舍接受账号状态变化后，已获许可的在途操作仍可能完成；后续调用根据重新取得的账号访问状态判断。原 Kernel 逐操作检查可能观察到两次内部调用之间的状态变化，本决定主动缩小重新观察的次数，以统一业务操作的检查范围。

禁用后重新启用不恢复旧代会话与派生产物的有效性。每次接口调用的同一次检查同时判断账号可访问性与既有凭据的代际；已获许可的在途操作沿用原代际，不因处理期间重新启用而取得新代际。

Session Kernel 完全退出账号状态与 Subject Access 代际的判断，不再调用 `principalAccessFence.capture/validate`。Subject Access 拥有账号状态与代际判断；业务操作入口通过共享能力集中取得许可，再调用 Kernel。Kernel 继续拥有会话及派生对象的生命周期。

代际信息作为外部提供的不透明上下文随会话保存，由 Subject Access 封装生成、解析和传递；Kernel 不定义 Subject Access 专用规则，不解释代际。共享编排负责正确传递该上下文，不新增独立的会话与代际关联存储；保存与继承契约见下文接口方案。

检查失败后的既有错误、Cookie 与撤销语义保留，由 Kernel 外的共享编排负责。明确禁用或旧代失效时拒绝访问并调用 Kernel 执行相应撤销；撤销范围沿用既有代际隔离，不影响重新启用后的新代会话。`blocking`、状态缺失、不可解析或 Redis 故障属于暂态不可用，不因此撤销会话或清除 Cookie。各协议边界继续负责自己的错误映射，撤销失败不允许访问。

本次范围仅覆盖因上述解耦受到影响、需要用户访问许可的接口，不扩大为全站接口改造。无用户主体的公共接口不检查；退出与撤销不以目标账号可访问为前提，但仍验证目标凭据或调用方操作权限。管理员操作其他用户时，管理员自身的访问许可与目标用户的业务状态约束分别处理。

受影响流程的账号可访问性统一由操作开始时的 Subject Access 检查裁决。主体投影移除独立的 Barrier 检查；后续资料查询不再通过启用或删除状态过滤推翻已经取得的许可。资料缺失、授权事实未就绪、Client 权限和协议配置等各自的业务约束继续保留，首次许可不替代这些约束。

Admin 会话列表展示 Kernel 中尚未过期、尚未撤销的会话记录，不再逐目标执行 Subject Access 校验或因查询而触发撤销。禁用后尚未清理的旧代记录可以暂时出现在列表中，但实际访问仍受 Subject Access 拒绝；管理员仍可撤销这些记录。页面说明必须明确记录存在不代表当前允许访问。

Subject Access Permission 绑定本次调用的可信 Subject Identifier 与代际，不是可用于任意对象的布尔值。后续对象属于不同主体或代际时直接拒绝，不在当前调用中切换主体重新检查；Session、Binding、Credential 与 Artifact 原有的归属校验继续保留。

每次调用中的成功、拒绝和暂态失败均固定为首次检查结果。并行回调共享同一个进行中的检查，内部重试复用结果；只有新的接口调用才重新读取 Barrier。许可不跨请求、不进入凭据载荷，也不交给脱离本次调用的后台工作复用；持久化的代际上下文不是持续有效的许可。

发布接受维护窗口内一次协调切换，使现存登录失效并要求用户重新登录。清理受影响的在线认证状态，统一切换生产消费者，不保留新旧数据格式的运行时兼容；实际清理键族、保留集、独立验证和回退步骤在实施时由发布手册固定。

## 接口与入口方案

Subject Access 继续由现有 `@iam/api-core/subject-access` 拥有，不因本次解耦新增 workspace package。公开共享能力提供每操作独立的许可容器，以及账号上下文的严格编码、解析和拒绝后的撤销编排；该容器同时服务新建会话的代际取得与既有会话的代际比较。Kernel 不持有该容器，不反向引用 Subject Access。

Kernel 通过中性的、不透明的主体上下文保存槽托管外部数据，根会话创建时由共享编排传入，带主体的派生对象原样继承。续期不改写上下文，派生调用不接受替换父上下文；Subject Access 负责内容版本、主体与代际的解析和比较。上下文缺失或不可解析不能按当前账号代际补齐后放行；无主体的协议产物不要求这份上下文。字段名称和具体 TypeScript 表达由实施确定，不扩展成通用插件注册系统。

请求容器在接口调用开始时创建，在首次取得可信主体后检查；结束时关闭，不允许后续后台工作沿用。无主体或无效凭据可以在取得许可前结束。已有对象允许先作不续期、不消费的解析以取得身份；新建根会话在完成身份认证后、会话创建前检查。检查早于续期、Grant 预占、Code 消费、协议签发或 ORCAS 出站调用。资料读取和协议身份校验不因移动检查而被省略。

| 入口 | 承载位置与检查时点 |
|---|---|
| 密码、手机、OA、微信登录 | 统一 Principal Session adapter；已确认身份后、创建根会话前。 |
| Custom SSO 授权与续接 | 每次应用操作的显式容器；根会话解析后、续期或授权产物创建前。 |
| Custom SSO 兑换与 Gateway callback | 可信 Artifact 解析后、Grant 预占及外部调用前；后续 Kernel 与 Projection 共用许可。 |
| Gateway authz 与 Public UserInfo | Credential 或根会话首次可信解析后取得许可，后续父会话与主体交付共用。 |
| Admin REST 与 tRPC | authentication middleware 的请求范围；解析管理员身份后，进入业务操作前。列表目标不取得访问许可。 |
| OIDC Provider 请求 | 现有 middleware 初始化请求容器；OIDC 专用桥接通过 `Provider.ctx.state` 取得容器。Kernel 不感知该框架。 |
| OIDC 原生 interaction、login guard 与 resume | 原生 HTTP 分发拥有显式容器；这些路径不假设处于 Provider 的 AsyncLocalStorage 中。 |

OIDC `/token` 在 `AuthorizationCode.find` 的可信 Artifact/Principal 解析后、返回 Provider 之前取得许可，不能推迟至 `findAccount`，因为 Provider 先消费 Code 再调用该回调。`/userinfo` 在第一次 AccessToken Credential 解析后检查，早于后续会刷新 mapping 的 Binding 读取。已消费 Code 的重放拒绝与撤销仍可执行，不因没有许可而阻断终止访问的处理。Provider middleware 和 `server_error` 事件继续承接各自错误映射路径。

共享容器通过接口和集成测试保证入口接入；在受保护的外层操作中缺失容器或许可属于失败，不回退为自动放行，也不由 Kernel 偷偷重建检查。独立测试或非 HTTP 调用显式创建操作容器。业务入口之外的资料读取仍按自己的调用契约处理，不借本次重构全局移除数据库状态过滤。

## 验证方案

- 共享许可契约证明每调用一次读取、并行 single-flight、失败结果固定、跨请求隔离、主体/代际不匹配拒绝、已许可在途继续及新调用拒绝。
- API Core 与真实 Redis 联验新旧代隔离、不透明上下文的保存与派生继承、明确拒绝后的撤销及晚到清理保留新代；Kernel 自身测试继续证明生命周期、期限、消费与并发冲突。
- API、Admin、Custom SSO 和 OIDC 通过实际生产入口或协议回调链证明接入。OIDC 至少覆盖实际 Provider 的 `/token`、`/userinfo` 请求以及原生 interaction；检查失败不得消费新 Code，重放撤销仍可执行。Custom SSO 覆盖预占/外部调用前拒绝和 Projection 不复查；Admin 覆盖列表目标不校验、不因查询而撤销。
- 保留错误与 Cookie 适配、资料和授权新鲜度、Client 与协议规则的相关测试；Admin 前端验证会话记录文案和既有撤销交互。
- 按仓库工作流执行受影响 owner 的静态检查、类型检查和行为测试，最终聚合验证与双轴评审先于合入。自动化不新增完整系统 E2E 或维护切换演练；发布停流、状态清理和独立验证由人工手册验收，已有相关测试按新契约维护。

## 实施与文档边界

实施范围、62 条用户故事及测试决定由 [Spec #128](https://github.com/cyy1998/shgas-iam/issues/128) 保存。最终聚合验收沿该议题跟踪，人工环境切换独立记录。

本决定已落实到[后端架构的 Subject Access Barrier 契约](../architecture/backend-architecture.md#subject-access-barrier)和[管理端会话页面契约](../features/admin/session-management.md)。`CONTEXT.md` 已记录已确认的访问许可与会话记录含义，当前实现仍以生效代码为准；正式工程文档在实施时同步，不能把本决定当作已完成迁移的证明。[ADR-0028](0028-extract-session-and-grant-state.md)记录的是提取时保持既有 Kernel facade 语义，本决定是后续职责重设计。
