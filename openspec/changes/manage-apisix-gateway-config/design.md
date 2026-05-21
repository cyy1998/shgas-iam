## Context

当前 IAM 仓库已经拆分为公共 API `apps/api` 和管理 API `apps/admin-api`，并通过 `docker/` 提供开发和生产 compose 模板。项目实际使用 APISIX 作为第三方业务应用网关，但仓库内尚未保存 APISIX 运行时配置、路由配置和同步流程。

APISIX 既可以通过 Admin API + etcd 动态管理，也可以通过 standalone/file-driven 方式读取本地配置。由于本项目需要将第三方业务应用接入规则纳入 Git review，同时仍保留运行时动态发布能力，本设计选择“仓库声明 + APISIX Admin API 同步”作为主路径。

目标使用者包括后端开发、运维、第三方业务应用接入负责人和代码评审者。配置变更需要能在开发环境复现，在生产环境可审计、可 diff、可回滚。

## Goals / Non-Goals

**Goals:**

- 在仓库中新增 `gateway/apisix/`，作为 APISIX 配置、同步脚本和说明文档的归属目录。
- 定义环境分层的 manifest，覆盖 routes、upstreams、services、plugin-configs、consumers、ssl 等 APISIX 对象。
- 提供同步工具，通过 APISIX Admin API 执行 `validate`、`diff`、`apply`，并支持 dry-run。
- 在开发 compose 中加入 APISIX 和 etcd，使本地可通过网关访问 `apps/api` 与 `apps/admin-api`。
- 在生产 compose 模板中提供 APISIX 和 etcd 的可选部署入口，并明确密钥、TLS、Admin API 访问控制的外部化方式。
- 明确仓库 manifest 是长期可信来源，Dashboard/Admin API 手工变更需要回写或通过同步流程覆盖。

**Non-Goals:**

- 不在本变更中重构 IAM 认证、授权、SSO 或客户端注册模型。
- 不在本变更中实现可视化网关管理后台。
- 不在仓库中保存生产 Admin API key、JWT secret、TLS 私钥或第三方系统密钥。
- 不要求一次性迁移所有线上 APISIX 配置；允许先纳管 IAM 基础路由和少量第三方应用样例。
- 不将 APISIX standalone/file-driven 模式作为主运行方式。

## Decisions

### Decision 1: 使用仓库声明作为配置源，Admin API 作为发布通道

`gateway/apisix/manifests/<env>/` 保存声明式配置，脚本读取 manifest 后通过 APISIX Admin API 写入目标 APISIX。同步脚本至少支持：

- `validate`: 校验 YAML/JSON 结构、必填字段、引用关系和敏感字段。
- `diff`: 读取目标 APISIX 当前配置，展示声明配置与远端配置差异。
- `apply`: 将声明配置写入 APISIX，默认要求先通过校验，可支持 `--dry-run`。

备选方案是直接使用 APISIX standalone/file-driven 配置。该方案 GitOps 属性更强，但会弱化 Admin API 动态配置能力，不适合当前“第三方业务应用需要动态接入并可同步”的目标。

### Decision 2: manifest 以 APISIX 原生对象为主，预留业务应用抽象层

第一阶段目录建议：

```text
gateway/apisix/
  config/
    config.dev.yaml
    config.prod.example.yaml
  manifests/
    dev/
      routes.yaml
      upstreams.yaml
      services.yaml
      plugin-configs.yaml
      consumers.yaml
      ssl.yaml
    prod/
      routes.yaml
      upstreams.yaml
      services.yaml
      plugin-configs.yaml
      consumers.yaml
      ssl.yaml
  scripts/
    apisix-sync.ts
  README.md
```

原生对象格式更容易和 APISIX Admin API 对齐，也便于从现有 APISIX 导出配置后逐步整理。后续如果第三方业务应用接入变多，可以新增 `gateway/apps/*.yaml` 作为业务抽象，再生成 APISIX 原生 manifest。

### Decision 3: 环境分层显式化，生产敏感值外部化

开发环境 manifest 可以引用 compose service 名称，例如 `api:30000`、`admin-api:30001`。生产环境 manifest 不直接写生产密钥和私钥，只允许引用环境变量、外部 secret 名称或占位符。

同步工具必须拒绝明显敏感字段落入 manifest，例如 Admin API key、TLS private key、数据库密码、JWT secret、短信签名密钥等。证书公钥或非敏感示例可以保存在 example 文件中。

### Decision 4: 本地 compose 增加 APISIX/etcd，生产 compose 提供模板

开发 compose 中加入：

- `apisix-etcd`: APISIX 配置中心。
- `apisix`: 网关入口，暴露 HTTP 管理端口和代理端口。

本地网关初始路由应覆盖：

- `/public/*`、`/open/*`、`/internal/*`、`/sso/*`、`/auth/*` -> `api:30000`
- `/admin/*`、`/rpc/*` -> `admin-api:30001`

生产 compose 中提供 APISIX 和 etcd 的模板，但是否单机、主从或独立控制面/数据面部署由部署环境决定。生产 Admin API 必须限制监听地址、访问来源和密钥来源。

### Decision 5: 同步策略采用受控覆盖，不默认删除未知远端对象

`apply` 只管理带有仓库归属标记的对象，例如 `labels.managed_by=shgas-iam-repo` 或约定 ID 前缀。默认不删除未归属对象，避免误删历史线上配置。

需要清理仓库已删除对象时，使用显式参数，例如 `--prune`，并在 diff 中展示将被删除的对象列表。

## Risks / Trade-offs

- [Risk] 线上 APISIX 存在手工配置，首次同步可能覆盖或冲突。→ Mitigation: 先实现 `export`/`diff` 或手工整理基线；默认只管理带归属标记的对象；删除操作必须显式开启。
- [Risk] manifest 表达能力与 APISIX 版本字段不一致。→ Mitigation: 在配置中固定目标 APISIX 版本范围；同步脚本保留原生对象透传能力；校验只约束仓库需要保障的字段。
- [Risk] Admin API key 泄露会带来网关控制面风险。→ Mitigation: key 仅来自环境变量或 secret；生产限制 Admin API 监听地址和来源；文档明确禁止入库。
- [Risk] 开发环境通过 APISIX 暴露后，直接访问后端端口和网关访问可能出现行为差异。→ Mitigation: 保留后端直连端口用于调试，同时将网关入口作为 smoke-test 目标。
- [Risk] 第三方业务应用抽象过早设计会拖慢落地。→ Mitigation: 第一阶段使用 APISIX 原生 manifest，业务抽象仅在目录和任务中预留。

## Migration Plan

1. 新增 `gateway/apisix/` 目录结构、配置示例和同步脚本文档。
2. 在开发 compose 中加入 APISIX 和 etcd，验证 APISIX 可启动并访问 Admin API。
3. 创建开发环境基础 manifest，将 IAM 公共 API 和管理 API 路由纳入网关。
4. 实现同步工具的 `validate`、`diff`、`apply --dry-run` 和 `apply`。
5. 将生产 compose 模板和 README 补齐，说明密钥、TLS、Admin API 访问控制和回滚方式。
6. 选择少量第三方业务应用作为样例纳管，确认 ID、标签和 prune 策略可控。

回滚策略：保留 APISIX 现有配置导出；同步工具每次 apply 前输出 diff；生产 apply 优先使用 dry-run；如新路由异常，可通过回滚 Git 版本后重新 apply，或临时使用 APISIX Admin API 恢复导出配置。

## Open Questions

- 生产 APISIX 当前版本、部署模式和是否已有 etcd 集群需要确认。
- 是否需要同时纳管 APISIX Dashboard，还是只保留 Dashboard 只读/排障用途。
- 第三方业务应用是否需要和 `client-registry` 建立强绑定，例如自动校验 `appCode` 已存在并启用。
- 网关认证策略第一阶段使用 APISIX 插件完成，还是先只做反向代理和基础限流。
