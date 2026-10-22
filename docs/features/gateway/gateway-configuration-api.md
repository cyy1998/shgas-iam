# Gateway 配置 API 契约

Type: feature
Status: Current
Last verified: 2026-10-19
Next review: 2026-10-31

本文定义调用方提交网关配置时的身份校验、输入、发布结果及失败边界。启动、首次直连配置和恢复操作见
[Gateway 发布手册](../../releases/apisix-gateway-release.md)。

## 能力与责任

- 配置以 IAM Client 为归属单位，一份配置可包含多条路由和多个上游；需要独立维护的子应用分别使用 Client。
- 第三方应用与 IAM 自身均通过 `validate`、`diff`、`apply` 提交完整 YAML。调用方保管源配置，APISIX 保存实际配置；
  服务没有期望配置库、版本历史、后台发布任务或持久恢复记录。
- 调用方可直连独立服务，首次发布不依赖尚未建立的 IAM 网关路由。APISIX 地址与 Admin Key 由部署配置固定。
- 身份校验只验证 Internal API Client Secret 与 scope 中的 Client 匹配，不提供域名或路径配额、配置审批、
  插件权限或完整多租户资源隔离。

领域定义见 [Gateway Application Configuration](../../../CONTEXT.md#language)，取舍见
[ADR-0044](../../adr/0044-publish-gateway-configurations-through-a-stateless-api.md)。

## 调用方身份与 scope 匹配

三种操作均通过 `apikey` 请求头提交 Internal API `clientSecret`，与 APISIX Admin Key、SSO Secret 相互独立。
解析 `scope` 后，按其中的 `app` 精确读取当前 Client，
只在 Client 存在、未删除、状态为 Enable 且请求 Secret 匹配时放行；例如 `prod:tender` 必须匹配 Client code 为
`tender` 的 Internal Secret。`scope.env` 沿用现有环境命名与部署目标规则，不从 Secret 推导额外的环境权限。

认证直接只读查询数据库，不依赖 IAM HTTP 路由或 SSO Snapshot，也不缓存认证结果。
按唯一 Client code 查询并比较 Secret，不假定 Secret 全表唯一。每次请求重新观察当前记录，
已通过认证的在途操作继续按原契约完成，后续请求重新检查轮换、状态和删除变化。

`validate`、`diff`、`apply`（包括 dry-run）使用同一认证规则；认证通过前不读取或修改 APISIX。
缺失、无效、状态不允许或与 scope 不匹配的凭据统一返回认证失败，不暴露其他 Client 的详情；
认证数据源不可用时返回暂态失败并停止操作，不能当作认证成功。Secret 只通过请求头提交，
不放在 URL、日志或响应中；调用方指定的其他身份 header 不能替代 scope 与权威记录的匹配。

IAM 自身的 `prod:iam` 同样要求已启用的 `iam` Client，`iam-admin` 不能替代，也没有免认证入口。
公开 Client 状态的安全字段见[Client 配置契约](../admin/client-sso-configuration.md#公开-client-状态)。
首次准备凭据及旧版本凭据暴露的核对步骤见[发布前置条件](../../releases/apisix-gateway-release.md#发布前置条件)。

## 接口契约

三种操作均接收 JSON 请求体，使用相同的身份校验。

| 请求             | 输入                                         | 作用与结果                                                                             |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /validate` | `scope`、`yaml`、可选 `variables`            | 解析和校验本次配置，返回资源数量及校验问题，不访问 APISIX。                            |
| `POST /diff`     | 同上                                         | 比较 APISIX 当前配置，返回创建、更新、删除候选和忽略项，不写入。                       |
| `POST /apply`    | 同上，可选 `dryRun`、`prune`，均默认 `false` | 获取本实例执行权后重新读取远端并规划；dry-run 只返回计划，正式发布执行计划和必要回滚。 |

请求体为 JSON，`yaml` 是原始 YAML 字符串，`variables` 是本次变量名到字符串值的映射，省略时为空。
占位符只从本次映射解析，缺失时报输入错误，不回退到服务进程环境；调用方不能指定服务器文件路径、
APISIX 地址或 Admin Key。`scope` 使用 `<env>:<app>`；`app` 必须与本次 Internal Secret 验证通过的 Client code 一致。

`diff` 是观察时的预览，不能作为后续发布的冻结计划。正式 `apply` 总是重新比较，
`prune:false` 时删除候选仍可供查看，但不执行删除。秘密值不进入日志或未经裁剪的差异、错误响应。

响应采用 `{ code, data, message }` envelope。写前校验或读取失败时尚未开始写入，不需要回滚，也不进入阻断；
认证拒绝或认证数据源不可用时不访问 APISIX。进入发布流程后的结果如下表。

配置校验失败的 `data.issues` 包含稳定的 `code`、安全资源位置 `path` 和固定说明 `message`。
说明保留规则及修正方式，位置只返回已知资源路径与数组下标，不回显调用方自定义字段名或字段值。
普通元数据中的 `key` 不视为秘密；凭据位置的 `key`、明确敏感字段和私钥材料仍须使用请求变量或外部秘密引用。

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

## YAML 配置与资源归属

`scope` 使用 `<env>:<app>`，两段均以小写字母或数字开头，后续只允许小写字母、数字和连字符。
YAML 使用以下七类资源；集合元素以 `key` 表达本地名称，生成规则如下：

| YAML 位置                  | APISIX 标识                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `service`                  | Service ID 为 `<app>.<env>`。                                                        |
| `service.plugin_configs[]` | Plugin Config ID 为 `<app>.<key>.<env>`。                                            |
| `upstreams[]`、`routes[]`  | 各自 ID 为 `<app>.<key>.<env>`。                                                     |
| `consumers[]`              | username 为 `<app>_<key>_<env>`，例如 `tender_reader_test`。                         |
| `ssls[]`                   | SSL ID 为 `<app>.<key>.<env>`；`private_key` 映射为 APISIX 的 `key`，不生成 `name`。 |
| `plugin_metadata[]`        | 使用插件 `key` 作为标识，不按 scope 生成独立 ID。                                    |

普通 Route 自动引用本 scope 的 Service，`upstream` 和 `plugin_config` 按本地 key 解析；
`terminal:true` 不自动添加 Service/Upstream 引用。资源带 `managed_by=shgas-iam`、`source=repo-manifest`
及当前 app/env 标签。源字段校验见[配置校验器](../../../apps/gateway/src/validators/index.ts)，
可参考 [IAM YAML](../../../tmp/gateway-config/apisix/manifests/dev/iam.yaml)。

`prune:true` 只删除源配置已移除、属于当前 app/env 且由 `repo-manifest` 管理的远端对象；
`dynamic-registry`、其他 scope 和未管理对象列为忽略项。该删除筛选不构成创建或更新的细粒度授权。

SSL 必须提供证书和私钥，例如 `private_key: ${TLS_PRIVATE_KEY}`；占位符只从本次请求解析。
Consumer 的独立 credential 子资源不进入 YAML 或本服务的七类恢复集合。
APISIX 删除 Consumer 会同时删除其 credential 子树；因此写前必须确认每个待删除 Consumer 的 credential 列表为空。
存在子凭据、读取失败或响应无法可靠识别时，整次 apply 在任何写入前拒绝且不进入阻断；普通 Consumer PUT 保留子凭据。
操作者需要先按这些子凭据的实际 owner 处理它们，再重新提交删除，不能绕过此检查。

## 回滚与并发边界

发布前在内存中暂存本次将触及的配置前态。首个发布失败后停止后续正向写入，执行一次补偿，不自动重试。
补偿通过反向写入恢复这次发布尝试修改的资源：
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
不能将这种不确定状态报告为“已回滚”。补偿失败、未知结果及进程崩溃需要人工恢复。

服务在本实例内，从读取发布前态到发布或恢复结束保持串行；期间新的 `apply` 返回忙，不排队或自动重试。
恢复失败或结果未知后，本实例在内存中保留发布阻断状态。操作者先核对并修复 APISIX 配置，
再重启 Gateway API 重新开放发布；没有解锁接口。重启只清除进程内阻断，不执行恢复核验，
也不重建上次发布的前态或结果，人工核验不能用重启成功替代。

执行总预算覆盖取得执行权后的远端读取、正向写入和必要补偿；APISIX 单次请求同时受单次上限与剩余总预算限制。
恢复不另行延长总期限，也不自动重试；总期限耗尽后无法确认的作用返回未知并阻断。
写前读取耗尽预算且尚无任何写入尝试时，仅返回写前失败，不进入阻断。预算不保证任意大小的写集都能完成补偿。
默认值与配置范围见[服务配置](../../releases/apisix-gateway-release.md#服务配置与部署)。

同一 APISIX 集群的统一写入口保留为部署约定，代码不检测或禁止多个 Gateway API 实例，
也不加入分布式锁或集群唯一实例注册。本实例的串行控制不约束其他实例或直接调用 APISIX 的外部写者；
回滚保证以发布期间没有这些并发写入为前提，不能宣称已有跨实例隔离。

## 请求生命周期

调用方超时或断连后，服务继续执行原来已经开始的操作：发布正常完成则结束，发布失败则执行原定回滚流程。
不会因为断连重发请求、另起发布或取消当前写入；执行仍受服务自身的超时预算约束。
正常关闭时停止接受新发布并等待在途操作结束；强制退出或自身期限耗尽后无法确认的远端作用，按未知结果处理。

调用方没有收到结果时，应视为结果未知，不自动重发。服务不提供持久任务或历史结果查询；
操作者需在确认没有在途发布后核对 APISIX 实际配置。进程仍存活时，即使响应已经无法交付，
发布、回滚及失败阻断状态也继续按原操作的最终结果更新。

关闭预算独立于发布预算，必须大于执行总预算，不重置或延长原发布期限；耗尽时服务失败退出。
信号、配置值及关闭余量见[服务配置](../../releases/apisix-gateway-release.md#服务配置与部署)，
未知结果或阻断后的操作顺序见[人工恢复](../../releases/apisix-gateway-release.md#失败补偿与人工恢复)。

## 维护与来源

`GET /health` 的 200 只证明 HTTP 就绪，不证明数据库或 APISIX 可用；关闭期间返回 503。
监听端口、请求大小和执行期限由部署配置提供，调用方不能通过请求修改。

维护与恢复见[发布手册](../../releases/apisix-gateway-release.md)，验证入口及证明范围见
[架构验证归属](../../architecture/architecture-verification.md#行为资源与系统验证)。
实施及验收记录见 [Spec #253](https://github.com/cyy1998/shgas-iam/issues/253)；
旧 CLI 迁移范围保留在[固定历史版本](https://github.com/cyy1998/shgas-iam/blob/48c2d6cc20e8a3675cbd1269eed2d5612141791d/docs/features/gateway/gateway-configuration-api.md#迁移与验收范围)。
