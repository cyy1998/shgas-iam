## 1. 网关目录与工具基础

- [x] 1.1 新增 `gateway/apisix/` 目录结构，包含 `config/`、`manifests/`、`scripts/` 和 `README.md`
- [x] 1.2 为 APISIX 同步脚本选择并接入仓库现有 TypeScript/Bun 执行方式
- [x] 1.3 在合适的 package script 或 README 命令中声明 `validate`、`diff`、`apply`、`apply --dry-run` 的调用方式

## 2. APISIX Manifest

- [x] 2.1 创建 `dev` 环境 manifest，声明 IAM 基础 routes、upstreams、services、plugin-configs、consumers、ssl 和策略模板文件
- [x] 2.2 创建 `prod` 环境 manifest 示例，使用占位符或环境变量表达生产域名、upstream、证书引用和环境约束
- [x] 2.3 为所有受仓库管理的 APISIX 对象定义统一 ID、命名规则和 `managed_by=shgas-iam`、`source=repo-manifest` 归属标记
- [x] 2.4 增加敏感字段约束，确保 manifest 不包含 Admin API key、JWT secret、TLS private key、数据库密码或第三方系统密钥
- [x] 2.5 确保 manifest 不把第三方业务应用实例作为实时注册事实来源，只保留基础能力、模板、环境约束或非敏感样例

## 3. Admin API 同步工具

- [x] 3.1 实现 manifest 加载与解析，支持按环境读取 APISIX 原生对象文件
- [x] 3.2 实现 `validate`，校验文件格式、必填字段、对象 ID、引用关系、环境约束和敏感字段
- [x] 3.3 实现 APISIX Admin API client，读取和写入 routes、upstreams、services、plugin-configs、consumers 和 ssl
- [x] 3.4 实现 `diff`，展示仓库声明与远端 `source=repo-manifest` 对象之间的新增、修改和删除候选
- [x] 3.5 实现 `apply --dry-run`，只输出计划变更且不发送写入或删除请求
- [x] 3.6 实现 `apply`，通过 Admin API 创建或更新 `source=repo-manifest` 对象，并默认不删除远端对象
- [x] 3.7 实现显式 `--prune` 删除逻辑，仅删除 `source=repo-manifest` 且已从 manifest 移除的对象
- [x] 3.8 确保 `diff`、`apply` 和 `--prune` 默认避让 `source=dynamic-registry` 对象，并提示其由 IAM 动态注册流程管理

## 4. Docker 编排

- [x] 4.1 在开发 compose 中新增 APISIX 和 etcd 服务，并暴露本地代理端口和受限 Admin API 端口
- [x] 4.2 配置开发 APISIX，使 `/api/iam/public/*`、`/api/iam/open/*`、`/api/iam/internal/*`、`/api/iam/sso/*`、`/api/iam/auth/*` 转发到 `api`
- [x] 4.3 配置开发 APISIX，使 `/api/iam/admin/*` 和 `/api/iam/rpc/*` 转发到 `admin-api`
- [x] 4.4 在生产 compose 模板中新增 APISIX/etcd 可选服务配置，所有密钥和生产差异通过环境变量或 secret 注入
- [x] 4.5 确认后端直连端口仍可用于调试，网关入口作为 smoke-test 入口

## 5. 文档与运维流程

- [x] 5.1 编写 `gateway/apisix/README.md`，说明 manifest 结构、对象命名、环境分层、来源标签和密钥边界
- [x] 5.2 记录新增/修改 IAM 基础路由、默认策略、策略模板和环境约束的 Git review 流程
- [x] 5.3 记录 `validate`、`diff`、`apply --dry-run`、`apply` 和 `--prune` 的使用方式
- [x] 5.4 记录生产发布、回滚、APISIX 远端配置导出和应急恢复流程
- [x] 5.5 记录第三方业务应用实例由 IAM 动态注册管理，APISIX 对象使用 `source=dynamic-registry`、`app_code` 和 `config_version` 与仓库基线共存

## 6. 验证

- [x] 6.1 为 manifest 校验逻辑添加单元测试，覆盖合法配置、缺失引用、重复 ID 和敏感字段
- [x] 6.2 为 diff/apply 计划生成逻辑添加单元测试，覆盖新增、修改、默认不删除、显式 prune 和避让 `source=dynamic-registry`
- [x] 6.3 运行 compose 配置检查，验证开发和生产 compose YAML 可解析
- [x] 6.4 本地启动 APISIX 开发编排并通过网关 smoke-test IAM 公共 API 和管理 API 路由
- [x] 6.5 运行受影响 workspace 的 lint、typecheck 和测试命令
