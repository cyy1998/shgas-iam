## Why

项目实际使用 APISIX 作为第三方业务应用网关，但当前仓库尚未纳管网关运行时和路由配置，容易出现线上配置漂移、缺少 review 记录、回滚困难以及开发环境无法复现生产入口的问题。

本变更将 APISIX 纳入仓库管理，以“Git 管基线，IAM 管动态业务实例，APISIX Admin API 管热更新落地”为主线，让 IAM 基础网关配置能够被版本化、校验、审查和自动同步，同时为第三方业务应用动态注册保留运行时控制面。

## What Changes

- 新增仓库内的 APISIX 网关配置管理能力，定义声明式 manifest 目录、环境分层和配置边界。
- 新增 APISIX Admin API 同步工具设计，用于对 manifest 进行校验、diff、apply，并将声明配置同步到目标 APISIX。
- 新增本地开发 APISIX 编排方案，将公共 API、管理 API 和第三方业务应用入口统一到网关层。
- 新增生产部署接入方案，明确 APISIX、etcd、Admin API key、TLS、密钥和环境变量的管理边界。
- 明确 Git manifest 只管理 IAM 基础路由、默认策略、策略模板和环境约束，不作为第三方业务应用实例的实时注册入口。
- 明确第三方业务应用由 IAM 运行时状态管理，并通过 APISIX Admin API 热更新到网关。
- 不改变现有 IAM 业务接口语义；现阶段不完整实现第三方业务应用注册后台，只明确它与 APISIX Admin API 的管理边界。

## Capabilities

### New Capabilities

- `gateway-configuration-management`: 管理 APISIX 网关运行时编排、声明式配置、Admin API 同步、配置校验、环境分层和发布边界。

### Modified Capabilities

- 无。

## Impact

- 影响目录：新增 `gateway/apisix/` 基线配置与同步脚本；更新 `docker/` 中开发和生产 compose 模板；补充相关 README 或运维说明。
- 影响系统：APISIX、etcd、公共 API `apps/api`、管理 API `apps/admin-api`、第三方业务应用 upstream。
- 影响流程：IAM 基础路由、默认策略、策略模板和环境约束需要通过 Git review 后同步；第三方业务应用实例通过 IAM 动态注册流程管理；生产密钥继续由环境变量或外部 secret 管理，不写入仓库。
- 影响验证：需要增加 manifest 静态校验、同步脚本 dry-run/diff 验证、compose 配置检查和本地网关冒烟测试。
