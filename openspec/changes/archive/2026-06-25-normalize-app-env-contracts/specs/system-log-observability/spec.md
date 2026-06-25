## MODIFIED Requirements

### Requirement: Backend Logger Policy
后端应用 SHALL 通过统一 logger factory 创建运行时 logger，并 SHALL 对 `api`、`admin-api` 和 `oidc-provider` 使用一致的日志级别、格式、脱敏和 `sourceApp` 规则。

#### Scenario: LOG_FORMAT auto resolves by NODE_ENV
- **WHEN** 后端应用未显式配置 app-prefixed log format raw env 或 runtime config value 为 `auto`
- **THEN** `NODE_ENV = "development"` 时 logger SHALL 使用 pretty 输出
- **AND** 其他 `NODE_ENV` 值下 logger SHALL 输出 JSON 行日志

#### Scenario: LOG_FORMAT explicit override is honored
- **WHEN** 后端应用通过 app-prefixed raw env 配置 log format 为 `json` 或 `pretty`
- **THEN** logger SHALL 按显式 log format 输出日志
- **AND** 该显式配置 SHALL 优先于 `NODE_ENV`

#### Scenario: LOG_FORMAT is validated
- **WHEN** `api`、`admin-api` 或 `oidc-provider` 解析环境变量
- **THEN** app-prefixed log format raw env SHALL 只接受 `auto`、`json` 或 `pretty`
- **AND** 缺省值 SHALL 为 `auto`

#### Scenario: JSON mode writes structured stdout
- **WHEN** logger 解析后的格式为 `json`
- **THEN** logger SHALL 输出结构化 JSON 行到 stdout
- **AND** logger MUST NOT 为 JSON 模式依赖 `pino/file` transport

#### Scenario: Pretty mode uses shared implementation detail
- **WHEN** logger 解析后的格式为 `pretty`
- **THEN** logger SHALL 通过共享 logger factory 使用 `pino-pretty`
- **AND** app package MUST NOT 直接拥有 `pino-pretty` 作为应用层依赖

### Requirement: Backend Logger Instances Are Configuration Safe
共享 logger factory SHALL 避免单一全局 singleton 造成不同 app 或测试配置串味。

#### Scenario: Different source apps can create independent loggers
- **WHEN** 同一进程中先后创建 `iam-api`、`iam-admin-api` 或 `iam-oidc-provider` logger
- **THEN** 每个 logger SHALL 保留自身 `sourceApp`、log format、log level 和额外脱敏配置
- **AND** 后创建的 logger MUST NOT 复用第一个 logger 的固定全局实例

#### Scenario: App module still exposes app-local singleton
- **WHEN** 后端 app 需要复用 logger
- **THEN** app-local logger module SHALL continue to expose a singleton through 顶层 `export const logger = createLogger(...)`
- **AND** 共享 logger factory MUST NOT 要求所有 app 共用同一个 global singleton key
