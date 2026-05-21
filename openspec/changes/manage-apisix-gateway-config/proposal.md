## Why

项目实际使用 APISIX 作为第三方业务应用网关，但当前仓库尚未纳管网关运行时和路由配置，容易出现线上配置漂移、缺少 review 记录、回滚困难以及开发环境无法复现生产入口的问题。

本变更将 APISIX 纳入仓库管理，以“仓库声明 + APISIX Admin API 同步”为主线，让网关配置能够被版本化、校验、审查和自动同步，同时保留 APISIX 动态配置能力。

## What Changes

- 新增仓库内的 APISIX 网关配置管理能力，定义声明式 manifest 目录、环境分层和配置边界。
- 新增 APISIX Admin API 同步工具设计，用于对 manifest 进行校验、diff、apply，并将声明配置同步到目标 APISIX。
- 新增本地开发 APISIX 编排方案，将公共 API、管理 API 和第三方业务应用入口统一到网关层。
- 新增生产部署接入方案，明确 APISIX、etcd、Admin API key、TLS、密钥和环境变量的管理边界。
- 明确 Dashboard/Admin API 手工变更与仓库声明之间的关系，仓库声明作为长期可信来源。
- 不改变现有 IAM 业务接口语义；现阶段不改造第三方业务应用注册流程，只预留与 `client-registry` 对齐的扩展边界。

## Capabilities

### New Capabilities

- `gateway-configuration-management`: 管理 APISIX 网关运行时编排、声明式配置、Admin API 同步、配置校验、环境分层和发布边界。

### Modified Capabilities

- 无。

## Impact

- 影响目录：新增 `gateway/apisix/` 配置与同步脚本；更新 `docker/` 中开发和生产 compose 模板；补充相关 README 或运维说明。
- 影响系统：APISIX、etcd、公共 API `apps/api`、管理 API `apps/admin-api`、第三方业务应用 upstream。
- 影响流程：网关路由、upstream、插件策略和消费者配置需要通过 Git review 后同步；生产密钥继续由环境变量或外部 secret 管理，不写入仓库。
- 影响验证：需要增加 manifest 静态校验、同步脚本 dry-run/diff 验证、compose 配置检查和本地网关冒烟测试。
