## Context

当前 IAM 仓库已经拆分为公共 API `apps/api` 和管理 API `apps/admin-api`，并通过 `docker/` 提供开发和生产 compose 模板。项目实际使用 APISIX 作为第三方业务应用网关，但仓库内尚未保存 APISIX 运行时配置、路由配置和同步流程。

APISIX 既可以通过 Admin API + etcd 动态管理，也可以通过 standalone/file-driven 方式读取本地配置。由于本项目既需要把 IAM 基础网关能力纳入 Git review，也需要支持第三方业务应用动态注册与热更新，本设计采用分层管理：Git 负责 IAM 基础路由、默认策略、策略模板和环境约束；第三方系统实例由 IAM 运行时管理，并通过 APISIX Admin API 热更新到网关。

目标使用者包括后端开发、运维、第三方业务应用接入负责人和代码评审者。配置变更需要能在开发环境复现，在生产环境可审计、可 diff、可回滚。

## Goals / Non-Goals

**Goals:**

- 在仓库中新增 `gateway/apisix/`，作为 APISIX 配置、同步脚本和说明文档的归属目录。
- 定义环境分层的 manifest，覆盖 routes、upstreams、services、plugin-configs、consumers、ssl 等 APISIX 对象。
- 提供同步工具，通过 APISIX Admin API 执行 `validate`、`diff`、`apply`，并支持 dry-run。
- 在开发 compose 中加入 APISIX 和 etcd，使本地可通过网关访问 `apps/api`、`apps/admin-api`、`apps/sso` 与 `apps/admin`。
- 将 `apps/sso` 与 `apps/admin` 打包为 nginx 静态容器，由 APISIX 根据前端根路径进行代理。
- 在生产 compose 模板中提供 APISIX 和 etcd 的可选部署入口，并明确密钥、TLS、Admin API 访问控制的外部化方式。
- 明确仓库 manifest 是 IAM 网关基线的长期可信来源，第三方业务应用实例不通过 Git manifest 逐个管理。
- 为 IAM 动态注册对象与仓库基线对象定义来源标签、管理边界和同步避让规则。

**Non-Goals:**

- 不在本变更中重构 IAM 认证、授权、SSO 或客户端注册模型。
- 不在本变更中实现可视化网关管理后台。
- 不在仓库 manifest 中登记每一个第三方业务应用实例、实时 upstream 或运行时路由申请。
- 不在本变更中完整实现第三方业务应用动态注册后台，但需要为其与 APISIX Admin API 的协作边界留出明确设计。
- 不在仓库中保存生产 Admin API key、JWT secret、TLS 私钥或第三方系统密钥。
- 不要求一次性迁移所有线上 APISIX 配置；允许先纳管 IAM 基础路由、默认策略和模板。
- 不将 APISIX standalone/file-driven 模式作为主运行方式。

## Decisions

### Decision 1: Git 管基线，IAM 管动态业务实例，Admin API 管热更新落地

网关配置拆成两个 source of truth：

- `repo-manifest`: Git 中的 `gateway/apisix/manifests/<env>/`，只管理 IAM 基础路由、默认插件策略、策略模板、环境约束和 APISIX 运行时样板。
- `dynamic-registry`: IAM 数据库中的第三方业务应用注册状态，管理业务应用路由、upstream、启停、审批、版本、审计和回滚。

两类对象最终都通过 APISIX Admin API 写入 APISIX，但写入入口不同。仓库同步脚本只负责 `repo-manifest` 对象；IAM 后续的动态注册 worker 或服务负责 `dynamic-registry` 对象。

仓库同步脚本至少支持：

- `validate`: 校验 YAML/JSON 结构、必填字段、引用关系和敏感字段。
- `diff`: 读取目标 APISIX 当前配置，展示声明配置与远端配置差异。
- `apply`: 将声明配置写入 APISIX，默认要求先通过校验，可支持 `--dry-run`。

备选方案是让所有第三方业务应用也走 Git manifest + PR 发布。该方案审计性强，但无法满足动态注册和热更新。另一个备选方案是直接使用 APISIX standalone/file-driven 配置，该方案 GitOps 属性更强，但会弱化 Admin API 动态配置能力，也不适合当前目标。

### Decision 2: manifest 以 APISIX 原生对象为主，承载基线与模板

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

原生对象格式更容易和 APISIX Admin API 对齐，也便于从现有 APISIX 导出配置后逐步整理。manifest 可以包含策略模板和样例，但不承载每一个第三方业务应用实例。

如果第三方业务应用接入变多，应在 IAM 侧建立动态注册模型，例如 `gateway_app`、`gateway_route`、`gateway_upstream`、`gateway_policy` 和 `gateway_publish_log`。IAM 根据这些运行时数据生成 APISIX route、upstream、plugin_config 等对象，并通过 Admin API 热更新。

### Decision 3: 环境分层显式化，生产敏感值外部化

开发环境 manifest 可以引用 compose service 名称，例如 `api:30000`、`admin-api:30001`。生产环境 manifest 不直接写生产密钥和私钥，只允许引用环境变量、外部 secret 名称或占位符。

同步工具必须拒绝明显敏感字段落入 manifest，例如 Admin API key、TLS private key、数据库密码、JWT secret、短信签名密钥等。证书公钥或非敏感示例可以保存在 example 文件中。

### Decision 4: 本地 compose 增加 APISIX/etcd，生产 compose 提供模板

开发 compose 中加入：

- `apisix-etcd`: APISIX 配置中心。
- `apisix`: 网关入口，暴露 HTTP 管理端口和代理端口。

本地网关初始路由应覆盖：

- `/api/iam/public/*`、`/api/iam/open/*`、`/api/iam/internal/*`、`/sso/*`、`/api/iam/auth/*` -> `api:30000`
- `/api/iam/admin/*`、`/api/iam/rpc/*` -> `admin-api:30001`
- `/portal`、`/portal/*` -> `sso:80`
- `/iam-admin`、`/iam-admin/*` -> `admin:80`

生产 compose 中提供 APISIX 和 etcd 的模板，但是否单机、主从或独立控制面/数据面部署由部署环境决定。生产 Admin API 必须限制监听地址、访问来源和密钥来源。

### Decision 4a: 前端容器只负责静态资源和 SPA fallback

`apps/sso` 使用现有 Umi 根路径 `/portal`，`apps/admin` 使用现有 Umi 根路径 `/iam-admin`。两个前端分别构建为 nginx 容器：

- `sso` 容器将构建产物放在 `/usr/share/nginx/html/portal/`，服务 `/portal` 和 `/portal/*`。
- `admin` 容器将构建产物放在 `/usr/share/nginx/html/iam-admin/`，服务 `/iam-admin` 和 `/iam-admin/*`。

nginx 容器只做静态文件服务、健康检查和 SPA fallback，不代理后端 API。前后端统一入口由 APISIX 负责，避免 nginx 容器里重复维护 API 路由。

### Decision 5: 同步策略采用受控覆盖，不默认删除未知远端对象

`apply` 只管理带有仓库归属标记的对象，例如：

```yaml
labels:
  managed_by: shgas-iam
  source: repo-manifest
```

IAM 动态注册对象使用独立来源标记，例如：

```yaml
labels:
  managed_by: shgas-iam
  source: dynamic-registry
  app_code: example-crm
  config_version: "17"
```

仓库同步脚本必须识别 `source=dynamic-registry` 并默认避让，不能把 IAM 动态注册对象当成 manifest 漂移或删除候选。默认不删除未归属对象，避免误删历史线上配置。

需要清理仓库已删除对象时，使用显式参数，例如 `--prune`，并在 diff 中展示将被删除的对象列表。

### Decision 6: 第三方应用通过 IAM 运行时状态驱动 APISIX 热更新

第三方业务应用注册、路由申请、upstream 变更、启停和回滚由 IAM 管理。推荐状态流：

```text
第三方应用申请
  -> IAM 校验 appCode、domain/path、upstream、策略模板和审批规则
  -> 写入 IAM DB desired state
  -> IAM gateway publisher 调用 APISIX Admin API
  -> APISIX 热更新 route/upstream/plugin_config
  -> IAM 记录发布版本、结果和审计日志
```

第三方应用不能直接提交任意 APISIX plugin 配置。IAM 应提供受控策略模板，例如 `auth=sso|api-key|none`、`rateLimit=standard|strict|bulk`、`cors=internal|trusted-domains`，再由 IAM 展开为 APISIX 对象。

## Risks / Trade-offs

- [Risk] 线上 APISIX 存在手工配置，首次同步可能覆盖或冲突。→ Mitigation: 先实现 `export`/`diff` 或手工整理基线；默认只管理带归属标记的对象；删除操作必须显式开启。
- [Risk] manifest 表达能力与 APISIX 版本字段不一致。→ Mitigation: 在配置中固定目标 APISIX 版本范围；同步脚本保留原生对象透传能力；校验只约束仓库需要保障的字段。
- [Risk] Admin API key 泄露会带来网关控制面风险。→ Mitigation: key 仅来自环境变量或 secret；生产限制 Admin API 监听地址和来源；文档明确禁止入库。
- [Risk] 开发环境通过 APISIX 暴露后，直接访问后端端口和网关访问可能出现行为差异。→ Mitigation: 保留后端直连端口用于调试，同时将网关入口作为 smoke-test 目标。
- [Risk] 仓库同步脚本误删 IAM 动态注册对象。→ Mitigation: 使用 `source=repo-manifest` 与 `source=dynamic-registry` 明确区分，仓库 apply/prune 只作用于 `repo-manifest`。
- [Risk] 第三方业务应用直接暴露 APISIX 原生配置导致策略失控。→ Mitigation: 第三方应用只选择 IAM 定义的策略模板，由 IAM 展开为 APISIX 对象。

## Migration Plan

1. 新增 `gateway/apisix/` 目录结构、配置示例和同步脚本文档。
2. 在开发 compose 中加入 APISIX 和 etcd，验证 APISIX 可启动并访问 Admin API。
3. 创建开发环境基础 manifest，将 IAM 公共 API、管理 API、SSO 前端和 Admin 前端路由纳入网关。
4. 实现同步工具的 `validate`、`diff`、`apply --dry-run` 和 `apply`，并确保只管理 `source=repo-manifest`。
5. 将生产 compose 模板和 README 补齐，说明密钥、TLS、Admin API 访问控制、动态注册边界和回滚方式。
6. 在文档中描述 IAM 动态注册对象如何使用 `source=dynamic-registry`、`app_code` 和 `config_version` 与仓库基线共存。

回滚策略：保留 APISIX 现有配置导出；同步工具每次 apply 前输出 diff；生产 apply 优先使用 dry-run；如新路由异常，可通过回滚 Git 版本后重新 apply，或临时使用 APISIX Admin API 恢复导出配置。

## Open Questions

- 生产 APISIX 当前版本、部署模式和是否已有 etcd 集群需要确认。
- 是否需要同时纳管 APISIX Dashboard，还是只保留 Dashboard 只读/排障用途。
- 第三方业务应用动态注册是否直接复用 `client-registry`，还是新增专门的 gateway registry 数据模型并与 client 关联。
- IAM 动态注册的第一阶段是否只做反向代理、启停和限流，还是同步纳入 SSO/API Key 等认证模板。
