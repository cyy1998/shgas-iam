# oidc-client-registry Specification

## Purpose
TBD - created by archiving change add-oidc-provider. Update Purpose after archive.
## Requirements
### Requirement: OIDC 复用现有 client 主体
系统 SHALL 将现有 `client` 作为 OIDC relying party 的应用主实体，并 SHALL NOT 创建独立 OIDC client 主表。

#### Scenario: 现有 client 配置 OIDC
- **WHEN** 管理员为现有 client 配置 OIDC
- **THEN** 系统 SHALL 使用该 client 的 `clientCode` 作为 OIDC `client_id`
- **AND** SHALL 复用其名称、描述、全局状态、软删除状态和角色归属
- **AND** SHALL 将 OIDC 协议配置与 custom SSO `extAttributes`、`clientSecret` 分开存储

#### Scenario: 修改 clientCode
- **WHEN** 管理员或旧管理接口尝试修改已创建 client 的 `clientCode`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** SHALL 保持所有 client 的 `clientCode` 创建后不可变

#### Scenario: 创建 OIDC-only client
- **WHEN** 管理员希望配置 OIDC client
- **THEN** 第一版 SHALL 要求先按现有流程创建 client 主体
- **AND** SHALL NOT 提供绕过现有 client 创建流程的 OIDC-only client 创建接口

### Requirement: Client 包含独立 OIDC 状态和 JSONB 配置
系统 SHALL 在现有 client 上维护 `oidcEnabled`、`oidcConfig`、`oidcSecretHash` 和 `oidcConfigVersion`，并保证 OIDC 与 custom SSO 能够独立启停。

#### Scenario: 未配置状态
- **WHEN** client 的 `oidcConfig` 为空
- **THEN** `oidcEnabled` SHALL 为 false
- **AND** 管理端 SHALL 将其显示为 `unconfigured`

#### Scenario: 已配置但禁用
- **WHEN** client 的 `oidcConfig` 存在且 `oidcEnabled=false`
- **THEN** 管理端 SHALL 将其显示为 `disabled`
- **AND** provider SHALL 拒绝该 client 的 OIDC 请求

#### Scenario: 已配置并启用
- **WHEN** client 的 `oidcConfig` 存在、`oidcEnabled=true`、全局状态为 Enable 且未删除
- **THEN** 管理端 SHALL 将其显示为 `enabled`
- **AND** provider MAY 在其他协议校验通过后接受该 client

#### Scenario: 启用缺少配置的 client
- **WHEN** 管理员尝试在 `oidcConfig` 为空时启用 OIDC
- **THEN** 系统 SHALL 拒绝该操作
- **AND** 数据库 SHALL 通过约束阻止 `oidcEnabled=true` 且 `oidcConfig` 为空的状态

### Requirement: OIDC 配置使用受约束判别联合
`oidcConfig` SHALL 显式包含 `clientType`、`redirectUris`、`postLogoutRedirectUris`、`allowedScopes` 和 `tokenEndpointAuthMethod`，并 SHALL 由 Zod 与 service 校验跨字段规则。

#### Scenario: Public client 配置
- **WHEN** 管理员配置 public client
- **THEN** `clientType` SHALL 为 `public`
- **AND** `tokenEndpointAuthMethod` SHALL 为 `none`
- **AND** `oidcSecretHash` SHALL 为空

#### Scenario: Confidential client 配置
- **WHEN** 管理员配置 confidential client
- **THEN** `clientType` SHALL 为 `confidential`
- **AND** `tokenEndpointAuthMethod` SHALL 为 `client_secret_basic`
- **AND** `oidcSecretHash` SHALL 非空

#### Scenario: 固定协议能力
- **WHEN** provider 将 OIDC 配置转换为 runtime metadata
- **THEN** grant types SHALL 固定为 `authorization_code`
- **AND** response types SHALL 固定为 `code`
- **AND** PKCE method SHALL 固定为 `S256`
- **AND** subject type SHALL 固定为 `public`
- **AND** ID Token signing algorithm SHALL 固定为 `RS256`

#### Scenario: Allowed scopes 配置
- **WHEN** 管理员保存 OIDC 配置
- **THEN** `allowedScopes` SHALL 只能包含 `openid`、`profile`、`phone` 和 `iam:authorization`
- **AND** SHALL 必须包含 `openid`

### Requirement: Redirect URI 使用精确字符串匹配
系统 SHALL 独立维护 OIDC redirect URI，不得复用 custom SSO 的 redirect pattern、前缀匹配或通配规则。

#### Scenario: 注册合法 redirect URI
- **WHEN** 管理员提交绝对 HTTP 或 HTTPS redirect URI
- **AND** URI 不包含 fragment、通配符或模板变量
- **THEN** 系统 SHALL 允许保存
- **AND** SHALL 允许 URI 包含 query 参数
- **AND** SHALL 允许生产环境使用 HTTP URI

#### Scenario: 注册非法 redirect URI
- **WHEN** redirect URI 不是绝对 HTTP/HTTPS URI，或包含 fragment、通配符或模板变量
- **THEN** 系统 SHALL 拒绝保存

#### Scenario: Authorize redirect URI 完全相同
- **WHEN** authorize 请求的 `redirect_uri` 与某个注册字符串完全相同
- **THEN** provider SHALL 允许后续校验

#### Scenario: Redirect URI 仅语义等价
- **WHEN** 请求 URI 仅在 host 大小写、默认端口、尾斜杠、query 顺序、编码形式或路径规范化后与注册值等价
- **BUT** 原始完整字符串不同
- **THEN** provider SHALL 拒绝请求

#### Scenario: Post logout URI 为空
- **WHEN** `postLogoutRedirectUris` 为空
- **THEN** client SHALL NOT 使用 `post_logout_redirect_uri`
- **AND** end session SHALL 返回 provider 默认安全页面

### Requirement: OIDC client secret 由系统生成并只显示一次
系统 SHALL 对 confidential client secret 执行高熵生成、bcrypt 摘要存储、一次性显示和可审计轮换。

#### Scenario: 首次配置 confidential client
- **WHEN** 管理员首次配置 confidential client
- **THEN** 系统 SHALL 使用加密安全随机源生成 32 bytes 随机值
- **AND** SHALL 使用 `iam_oidc_` 加 base64url 的格式返回明文 secret
- **AND** SHALL 仅保存完整 secret 的 bcrypt 摘要
- **AND** SHALL 仅在本次响应中显示明文

#### Scenario: 管理员提交自定义 secret
- **WHEN** 管理员尝试自行指定 OIDC client secret
- **THEN** 系统 SHALL 拒绝或忽略该输入
- **AND** SHALL 只接受系统生成的 secret

#### Scenario: 校验 confidential client
- **WHEN** provider 校验 `client_secret_basic`
- **THEN** SHALL 从专用 repository 读取摘要并使用共享 bcrypt helper 校验
- **AND** SHALL NOT 通过明文 secret 查询 PostgreSQL 或 Redis
- **AND** SHALL NOT 将摘要写入共享 Redis client cache

#### Scenario: 轮换 secret
- **WHEN** 管理员执行 rotate-secret
- **THEN** 系统 SHALL 原子替换摘要并递增 `oidcConfigVersion`
- **AND** 旧 secret SHALL 立即失效
- **AND** 新明文 secret SHALL 仅在本次响应显示

#### Scenario: Confidential 切换为 public
- **WHEN** 管理员将 confidential client 改为 public
- **THEN** 系统 SHALL 原子清除 `oidcSecretHash`
- **AND** 旧 secret SHALL 立即失效

### Requirement: OIDC 配置版本使旧协议对象失效
系统 SHALL 使用 `oidcConfigVersion` 使配置和状态变化前创建的协议对象立即失效。

#### Scenario: 初始版本
- **WHEN** client 尚未配置 OIDC
- **THEN** `oidcConfigVersion` SHALL 为 0

#### Scenario: OIDC 操作递增版本
- **WHEN** 执行 configure、enable、disable、remove 或 rotate-secret
- **THEN** 系统 SHALL 在同一事务中递增 `oidcConfigVersion`

#### Scenario: Client 全局状态变化
- **WHEN** client 全局状态改变或 client 被软删除
- **THEN** 系统 SHALL 递增 `oidcConfigVersion`
- **AND** provider SHALL 拒绝旧版本的 code、interaction、grant 和 token

#### Scenario: 展示信息变化
- **WHEN** 仅修改 clientName、description 或 url 等非协议字段
- **THEN** 系统 SHALL NOT 递增 `oidcConfigVersion`

### Requirement: 管理端在现有 client 模块维护 OIDC
系统 SHALL 在现有 client 页面与 API 模块中提供专用 OIDC 操作，不得建立第二套 client CRUD。

#### Scenario: 配置并保存为禁用
- **WHEN** 管理员首次执行 `client.oidc.configure`
- **THEN** 系统 SHALL 保存完整合法配置
- **AND** `oidcEnabled` SHALL 默认保持 false
- **AND** confidential client SHALL 返回一次性 secret

#### Scenario: 启用 OIDC
- **WHEN** 管理员执行 `client.oidc.enable`
- **THEN** 系统 SHALL 再次验证配置、secret 状态和 client 全局状态
- **AND** 验证通过后 SHALL 设置 `oidcEnabled=true`

#### Scenario: 禁用 OIDC
- **WHEN** 管理员执行 `client.oidc.disable`
- **THEN** 系统 SHALL 设置 `oidcEnabled=false`
- **AND** SHALL 保留配置和 secret 摘要以便后续重新启用

#### Scenario: 移除 OIDC 配置
- **WHEN** 已禁用 client 执行 `client.oidc.remove`
- **THEN** 系统 SHALL 原子清除 `oidcConfig` 和 `oidcSecretHash`
- **AND** SHALL NOT 删除 client 主体、角色或 custom SSO 配置

#### Scenario: 列表筛选
- **WHEN** 管理员搜索 client
- **THEN** SHALL 支持按 OIDC 三态、clientType 和 allowedScopes 筛选
- **AND** 列表 SHALL NOT 返回 `oidcSecretHash`

#### Scenario: Client 详情
- **WHEN** 管理员查看 client 详情
- **THEN** 响应 SHALL 包含 `oidcEnabled`、`oidcConfig`、`oidcConfigVersion` 和 `hasOidcSecret`
- **AND** SHALL NOT 包含 secret 明文或摘要

### Requirement: OIDC 管理操作记录独立审计
系统 SHALL 对 OIDC 配置操作记录专用 client 审计事件，并 SHALL 使用统一审计动作目录中的规范 action 名称。

#### Scenario: 记录 OIDC 配置事件
- **WHEN** 管理员配置、启用、禁用、移除或轮换 secret
- **THEN** 系统 SHALL 分别记录 `admin.client.oidc.configure`、`admin.client.oidc.enable`、`admin.client.oidc.disable`、`admin.client.oidc.remove` 或 `admin.client.oidc.rotate_secret`
- **AND** 记录 SHALL 使用 `outcome = "success"` 表达操作成功
- **AND** MAY 记录完整 redirect URI、clientType、allowedScopes、配置版本和状态变化
- **AND** SHALL NOT 记录 secret 明文或摘要

### Requirement: Provider 动态解析 OIDC client
系统 SHALL 以 PostgreSQL 为 client 权威数据源，并 MAY 使用不含 secret hash 的 Redis runtime cache。

#### Scenario: 解析可用 client
- **WHEN** provider 按 `client_id` 查找 client
- **AND** client 全局状态为 Enable、未删除、OIDC 已启用且配置完整
- **THEN** SHALL 返回转换后的 provider runtime metadata
- **AND** SHALL 包含当前 `oidcConfigVersion`

#### Scenario: 解析不可用 client
- **WHEN** client 不存在、非 Enable、已删除、OIDC 未启用或配置缺失
- **THEN** provider SHALL 将其视为不可用并拒绝请求

#### Scenario: Runtime cache 内容
- **WHEN** provider 缓存 client runtime 配置
- **THEN** cache MAY 包含状态、OIDC 配置和版本
- **AND** SHALL NOT 包含 custom SSO 明文 secret 或 OIDC secret hash
