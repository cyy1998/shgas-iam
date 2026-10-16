# Gateway 配置 API 设计

Type: feature
Status: Current
Last verified: 2026-10-16
Next review: 2026-10-31

本文维护独立 Gateway HTTP API 的功能契约，实施与验收由 [Spec #253](https://github.com/cyy1998/shgas-iam/issues/253) 跟踪；
代码交付不表示目标环境已经部署。启动、首次直连配置和恢复操作见
[Gateway 发布手册](../../releases/apisix-gateway-release.md)。

## 已确认范围

- 将现有 `gateway` 的 YAML 配置推送能力提供为 API，让应用通过 API 维护配置，首版保持简单。
- 配置以 IAM Client 为归属单位；一份应用配置可以包含多条路由和多个上游。
  需要独立维护的子应用分别使用 Client，统一维护的子应用继续共用所属 Client。
  领域定义见 [Gateway Application Configuration](../../../CONTEXT.md#language)。
- 首版提供简单的调用方身份校验：调用方传入 Internal API Client Secret，服务验证它是否属于 `scope` 指定的 Client。
  不增加域名或路径配额、逐项授权、配置审批或插件权限模型；这项校验不代表已经实现完整的多租户资源隔离。
- IAM 自身的网关配置也通过同一 API 提交，不保留必须由本地 CLI 发布的 IAM 专属配置面。
- API 直接执行调用方提交的完整配置，调用方继续保管 YAML；服务不额外保存期望配置，不引入配置数据库、版本历史或后台发布任务。
  APISIX 保存实际写入的网关配置，服务重启不会从自己的配置库自动恢复或重放发布。
- 现有 `gateway/` 迁入 `apps/gateway/`，作为独立服务监听端口；APISIX 地址和 Admin Key 由服务启动配置提供。
  调用方可以直连服务，首次发布 IAM 配置不依赖尚未建立的 IAM 网关路由。
- 请求提交 `scope`（例如 `prod:iam`）、完整 YAML 文本及本次占位符变量；变量仅用于本次请求，不修改服务进程环境。
  三种操作均通过 `apikey` 请求头提交 Client Secret；该凭据与 APISIX Admin Key、SSO Secret 相互独立。
- 提供 `validate`、`diff`、`apply` 三种 API 操作；`apply` 保留 `dryRun` 和 `prune`，默认不删除已从 YAML 移除的资源，
  只有显式开启 `prune` 才删除符合现有清理范围的资源。
- 移除旧 CLI 和根目录 `gateway:apisix:*` 命令，现有自动化中的旧 CLI 调用改为 HTTP API；本次不新增、扩展或执行完整系统 E2E。
- 发布失败后停止正向写入，执行一次恢复流程，不自动重试发布或回滚操作。
  只有能确认恢复完成才报告“发布失败，已回滚”；回滚失败、结果未知或进程崩溃转人工处理。

独立无状态服务与补偿恢复的取舍见 [ADR-0044](../../adr/0044-publish-gateway-configurations-through-a-stateless-api.md)。

## 调用方身份与 scope 匹配

使用 IAM 现有 Client 的 Internal API `clientSecret`。解析 `scope` 后，按其中的 `app` 精确读取当前 Client，
只在 Client 存在、未删除、状态为 Enable 且请求 Secret 匹配时放行；例如 `prod:tender` 必须匹配 Client code 为
`tender` 的 Internal Secret。`scope.env` 沿用现有环境命名与部署目标规则，不从 Secret 推导额外的环境权限。

Gateway 通过共享数据库公开入口构造自己的窄只读 credential reader，仅取得认证需要的字段；
不导入其他 app 的私有 repository，不增加配置数据库或新凭据表，不缓存认证结果，也不混用 SSO Snapshot 或 SSO Secret。
按唯一 Client code 查询并比较 Secret，不假定 Secret 在整个 Client 表中唯一。每次请求重新观察当前记录，
已通过认证的在途操作继续按原契约完成，后续请求重新检查轮换、状态和删除变化。

`validate`、`diff`、`apply`（包括 dry-run）使用同一认证规则；认证通过前不读取或修改 APISIX。
缺失、无效、状态不允许或与 scope 不匹配的凭据统一返回认证失败，不暴露其他 Client 的详情；
认证数据源不可用时返回暂态失败并停止操作，不能当作认证成功。Secret 只通过请求头提交，
不放在 URL、日志或响应中；调用方指定的其他身份 header 不能替代 scope 与权威记录的匹配。

首次发布 IAM 自身的 `iam` scope 前，需在对应 IAM 数据库准备已启用的 `iam` Client 及 Internal Secret；
`iam-admin` 不自动匹配 `iam`。认证直接连接数据库，不依赖尚未创建的 IAM Gateway 路由。
聚焦发布验证使用与 scope 匹配的 Client，不增加特殊免认证分支；既有 E2E 调用的必要兼容适配遵守同一规则。

公开 `GET /open/client/status?clientCode=...` 匿名返回统一 envelope，`data` 仅含
`clientCode`、`clientName`、`status`、可空的 `url`；不存在的 Client 仍成功返回 `data:null`。
正式 HTTP 输出与 OpenAPI 共同使用显式公开字段 DTO，数据库回源和缓存命中均裁剪到这些字段，
不输出 Internal/SSO 凭据、协议配置或扩展对象中的嵌套秘密。SSO 登录页继续读取名称，维护页继续读取状态。
内部 Secret 查询与公开响应分开；现有 Internal API 认证保留，不能将公开取回 Secret 当作验证能力。

修正前的静态代码与仓库路由链路显示公开响应复用含 Internal `clientSecret` 的 Runtime DTO；
没有验证生产可达性或实际泄露。部署前需核对受影响版本和入口，
对已暴露的 Internal 凭据完成轮换后再开放 Gateway 管理操作。

## YAML 的两个兼容修正

除以下维护者明确批准的最小修正外，沿用原有 YAML 能力、scope、来源筛选及其余资源的 ID 算法：

- `ssls[].key` 仍是本地资源名；新增 `private_key: ${TLS_PRIVATE_KEY}`，仅在物化时映射为 APISIX SSL 的 `key`。
  SSL 必须提供证书和私钥，占位符只从本次请求解析；SSL 保留 `<app>.<key>.<env>` 的 ID，不生成 API 不接受的 `name`。
- Consumer 的 `username` 仅改用 `<app>_<key>_<env>`，例如 `tender_reader_test`，以满足 APISIX 3.16 的字符限制。
  scope 仍是 `<env>:<app>`，源 `key` 仍使用原本的本地命名规则；其余六类资源的标识规则不变，不增加旧名别名或双写。

这两项修正及恢复载荷以 [APISIX 3.16 schema](https://github.com/apache/apisix/blob/3.16.0/apisix/schema_def.lua)
和真实 Admin API 验证为依据。Consumer 的独立 credential 子资源不进入 YAML 或本服务的七类恢复集合。
APISIX 删除 Consumer 会同时删除其 credential 子树；因此写前必须确认每个待删除 Consumer 的 credential 列表为空。
存在子凭据、读取失败或响应无法可靠识别时，整次 apply 在任何写入前拒绝且不进入阻断；普通 Consumer PUT 保留子凭据。
操作者需要先按这些子凭据的实际 owner 处理它们，再重新提交删除，不能绕过此检查。

## 已确认的回滚与并发边界

发布前在内存中暂存本次将触及的配置前态。发布失败后，通过反向写入恢复这次发布尝试修改的资源：
恢复原有对象、重建已删除对象、清理本次新建对象。报错操作也可能已经在远端生效，不能只恢复已收到成功响应的操作。
快照与恢复的范围是本次变更涉及的资源，不是覆盖整个集群的所有配置。

写前对整个实际写集的前态和新载荷检查 APISIX 3.16 的最低必需结构；任一对象残缺时返回
`GATEWAY_SNAPSHOT_INVALID`，零写入且不进入阻断。Upstream 必须有有效的 nodes 或完整的 service_name/discovery_type，
Route 必须有 uri/uris 之一及插件、upstream、service 引用或 script 等处理配置，Plugin Config 必须有 plugins 对象；
Service、Route 和 Consumer 的 plugins（存在时）必须为对象，Service/Route 的内嵌 upstream 同样检查；
SSL 必须保留 cert/key，server 类型还需 sni/snis 之一。
Service 没有额外必填业务字段，Consumer 必须有合法 username；Plugin Metadata 的业务结构由所属插件定义，保持原值。
该检查不复制任意插件的完整 schema，也不解析或改写 SSL 加密私钥；通过后远端仍可能拒绝写入，按正常补偿流程处理。

该流程是补偿式恢复，允许发布和恢复期间短暂出现部分新配置；它不提供跨资源原子事务，
也不撤销中间配置已经处理的业务请求。远端写入超时或断连时，单次回读不一定能排除迟到写入，
不能将这种不确定状态报告为“已回滚”。补偿失败、未知结果及进程崩溃的人工恢复责任是已接受的首版限制。

服务在本实例内，从读取发布前态到发布或恢复结束保持串行；期间新的 `apply` 返回忙，不排队或自动重试。
恢复失败或结果未知后，本实例在内存中保留发布阻断状态。操作者先核对并修复 APISIX 配置，
再重启 Gateway API 重新开放发布；首版不增加解锁接口。重启只清除进程内阻断，不执行恢复核验，
也不重建上次发布的前态或结果，人工核验不能用重启成功替代。

默认执行总预算为 60 秒，覆盖取得执行权后的远端读取、正向写入和必要补偿；APISIX 单次请求默认最多 10 秒，
同时受剩余总预算限制。恢复不另行延长总期限，也不自动重试；总期限耗尽后无法确认的作用返回未知并阻断。
写前读取耗尽预算且尚无任何写入尝试时，仅返回写前失败，不进入阻断。预算不保证任意大小的写集都能完成补偿。

同一 APISIX 集群的统一写入口保留为部署约定，代码不检测或禁止多个 Gateway API 实例，
也不加入分布式锁或集群唯一实例注册。本实例的串行控制不约束其他实例或直接调用 APISIX 的外部写者；
回滚保证以发布期间没有这些并发写入为前提，不能宣称已有跨实例隔离。

## 已确认的请求生命周期

调用方超时或断连后，服务继续执行原来已经开始的操作：发布正常完成则结束，发布失败则执行原定回滚流程。
不会因为断连重发请求、另起发布或取消当前写入；执行仍受服务自身的超时预算约束。
正常关闭时停止接受新发布并等待在途操作结束；强制退出或自身期限耗尽后无法确认的远端作用，按未知结果处理。

调用方没有收到结果时，应视为结果未知，不自动重发。服务不提供持久任务或历史结果查询；
操作者需在确认没有在途发布后核对 APISIX 实际配置。进程仍存活时，即使响应已经无法交付，
发布、回滚及失败阻断状态也继续按原操作的最终结果更新。

正常关闭通过 SIGTERM/SIGINT 进入：先停止接受新工作，再等待已经进入 HTTP handler 的操作以及数据库连接关闭。
关闭预算独立于发布预算，默认 70 秒，必须大于执行总预算；它不会重置或延长原发布的执行期限。
关闭期限耗尽时服务失败退出，无法确认的远端作用仍需人工核对。客户端断连不作为取消发布的信号。

未收到响应或进入阻断后，恢复顺序是：先停止调用方的后续发布，确认原操作及可能迟到的远端调用已经结束；
再通过 APISIX 实际配置核对本次触及的对象，按调用方保管的 YAML 和现场前态修复；最后重启 Gateway API，
重新校验和预览后再由操作者明确提交。重启不会重放旧请求，也不证明修复完成；单次读到原值不能排除迟到写入。

## 接口契约

以下是已确认操作的具体 HTTP 表达，遵循前述发布语义。

| 请求             | 输入                                         | 作用与结果                                                                             |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /validate` | `scope`、`yaml`、可选 `variables`            | 解析和校验本次配置，返回资源数量及校验问题，不访问 APISIX。                            |
| `POST /diff`     | 同上                                         | 比较 APISIX 当前配置，返回创建、更新、删除候选和忽略项，不写入。                       |
| `POST /apply`    | 同上，可选 `dryRun`、`prune`，均默认 `false` | 获取本实例执行权后重新读取远端并规划；dry-run 只返回计划，正式发布执行计划和必要回滚。 |

请求体为 JSON，`yaml` 是原始 YAML 字符串，`variables` 是本次变量名到字符串值的映射，省略时为空。
占位符只从本次映射解析，缺失时报输入错误，不回退到服务进程环境；调用方不能指定服务器文件路径、
APISIX 地址或 Admin Key。`scope` 继续使用 `<env>:<app>`；`app` 必须与本次 Internal Secret 验证通过的 Client code 一致。

`diff` 是观察时的预览，不能作为后续发布的冻结计划。正式 `apply` 总是重新比较，
`prune:false` 时删除候选仍可供查看，但不执行删除。现有资源 ID、scope 与来源筛选语义保持，
以便接管已经发布的配置；秘密值不进入日志或未经裁剪的差异、错误响应。

响应采用仓库统一 envelope，并区分以下可观察结果：

- 校验未通过或写前读取失败：未开始写入，不需要回滚，不使本实例进入恢复阻断。
- 调用方认证失败或认证数据源不可用：明确返回拒绝或暂态失败，不访问 APISIX，不进入恢复阻断。
- 预览成功、无需变化或正式发布成功：明确是否实际执行过写入。
- 发布失败且确认恢复：明确报告原发布失败和已回滚；不返回发布成功。
- 回滚失败或作用未知：明确报告已知操作结果和需要人工恢复，本实例阻断后续发布。
- 实例忙或已阻断：拒绝本次发布，且不修改远端。

成功仅表示本次 Admin API 配置操作已确认完成，不承诺所有 APISIX 数据面节点在同一时刻切换，
也不把业务流量已经使用过的中间配置视为可撤销作用。

| apply 结果       | HTTP / code                                   | data 中的含义                                                                 |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| 预览             | 200                                           | `outcome:preview`、`dryRun:true`，没有写入。                                  |
| 无变化           | 200                                           | `outcome:no_change`、`written:false`；未开启 prune 的删除候选不计入实际写集。 |
| 发布完成         | 200                                           | `outcome:applied`、`written:true`。                                           |
| 发布失败且已恢复 | 502 / `GATEWAY_APPLY_ROLLED_BACK`             | `outcome:rolled_back`；原发布仍失败。                                         |
| 恢复明确失败     | 503 / `GATEWAY_ROLLBACK_FAILED`               | `outcome:rollback_failed`；后续 apply 被阻断。                                |
| 作用未知         | 503 / `GATEWAY_APPLY_UNKNOWN`                 | `outcome:unknown`；后续 apply 被阻断。                                        |
| 实例忙 / 已阻断  | 409 / `GATEWAY_BUSY`；503 / `GATEWAY_BLOCKED` | 不读取或修改 APISIX。                                                         |
| 前态无法可靠恢复 | 502 / `GATEWAY_SNAPSHOT_INVALID`              | 零写入、不进入阻断，包括待删除 Consumer 的子凭据状态不满足前提。              |

发布失败响应的 `writeAttempted:true` 表示已经尝试写入，不证明失败目标是否实际生效。
网络超时、响应丢失、2xx 响应读取或解析失败、服务总期限耗尽都保守视为未知；一次补偿完成或回读暂时匹配不能解除未知。
写入成功还必须有匹配资源目标的 APISIX 完成确认：PUT 接受 200/201 的目标 key 与 value 身份，DELETE 接受 200 的目标 key 与单项删除计数。
空值、不完整或错目标的 2xx 响应、202 等未确认完成的状态均保留未知；服务器额外元数据不影响合法确认。

APISIX SSL list 中的私钥是加密值，Gateway 保留该值用于前态恢复，不自行解密或推导其明文等价性。
因此同一份包含明文私钥变量的源配置再次提交时，仍可能产生 SSL update 并重写。
`no_change` 仅表示本次计划的实际写集为空，不承诺七类资源的所有重复提交都没有写入。

## 迁移与验收范围

迁移涵盖现有 Gateway 源码、manifest、APISIX config、测试及说明；同步调整 workspace、根命令、
Architecture Guard、Docker 挂载与构建路径及测试发现。既有 E2E 中对旧目录或 CLI 的调用只做退出旧入口所需的
路径、启动和凭据适配，避免悬空引用；不新增浏览器旅程，也不运行完整系统 E2E。
发布接线通过聚焦验证完成：独立启动 Gateway API，使用匹配的 Client 凭据提交配置并回读 APISIX，
无需启动全部 IAM runtime 或执行浏览器业务流程。旧 CLI 不保留为第二条发布通道。

验证应直接观察三种操作的 Client Secret 与 scope 匹配、缺失或错误凭据、禁用或删除、认证数据源故障、
凭据轮换及状态变化对后续请求生效，以及拒绝路径零 APISIX 访问；继续验证输入校验与请求级变量隔离、三种 HTTP 操作、默认不删除与显式 prune、
写入失败和报错目标可能已生效时的恢复、回滚失败与未知结果阻断、实例内并发拒绝，以及客户端断连后原操作继续完成。
七类资源的完整读取、可回写前态和依赖恢复顺序需有真实 APISIX 契约证据；无法可靠取得前态或构造可回写载荷时，必须在写前拒绝。
真实 PostgreSQL 证明当前 Client 凭据与状态读取，公开 Client 状态入口分别覆盖缓存命中和回源的实际响应裁剪，
避免只检查类型定义或把 Internal Secret 泄露问题误写成已经发生的生产事件。
本次验收采用相关 Unit / Integration、受影响 workspace 的类型检查、文档检查和最终 `pnpm verify`；
真实 HTTP、PostgreSQL、APISIX 及进程生命周期的聚焦验证保留，完整系统 E2E 不作为本次验收门槛。
需要同时更新当前 runbook，说明首次直连配置、人工核对恢复、重启解除阻断与不自动重试的操作责任。

## 正式入口与部署边界

[正式进程](../../../apps/gateway/src/main.ts) 经 composition 连接薄 HTTP adapter、认证与发布 service、只读 Client reader
和 APISIX adapter；`start` 使用 `bun src/main.ts`，默认监听 `0.0.0.0:30004`。
dev/prod Compose 提供默认绑定宿主 `127.0.0.1:30004` 的直连入口，Gateway 不依赖 Redis。
`GET /health` 的 200 只证明 HTTP 就绪，不证明数据库或 APISIX 可用；关闭期间返回 503。
启动配置使用 `IAM_GATEWAY_*`，数据库、APISIX URL 与 Admin Key 必须显式提供。
数据库 pool 上限为 4，设置默认只读；部署负责人还需授予专用角色 client 认证列的最小读取权限。
完整参数、上限和关闭余量见[服务配置](../../releases/apisix-gateway-release.md#服务配置与部署)。

manifest 的 app/env、资源 ID 与来源标签仍是配置分组及发布约定；调用方身份由当前 Client 记录与 Secret 验证。
旧 CLI、文件 loader、进程环境占位符 fallback 和根 `gateway:apisix:*` 命令退出，自动化也通过 HTTP 发布。

仓库默认 APISIX 镜像为 `3.16.0`，现有 Admin API client 分别对资源执行 PUT / DELETE。
[APISIX 3.16 Admin API](https://apisix.apache.org/docs/apisix/3.16/admin-api/) 描述按资源的写入及引用删除检查，
不能据此假定当前发布链路存在跨资源事务。失败后的反向写入仍是外部网络调用，可能再次失败；
无持久恢复记录的服务进程被强制终止后，也不能依靠内存中的旧配置自动完成恢复。

## 确认与实施状态

业务范围、回滚边界、实例内并发、人工恢复和调用方断连语义均已整体确认；实施与验收状态以 Spec #253 为准。
监听端口、请求大小、执行期限等技术参数由服务启动配置和部署编排提供，
不由请求任意指定，不改变以上契约。身份校验限于 Internal Secret 与 scope 匹配，不扩展为细粒度权限系统。
