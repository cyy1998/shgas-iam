# APISIX 网关配置管理

本目录管理 IAM 的 APISIX 网关基线配置。

核心边界：

- Git 负责 IAM 基础路由、默认策略、策略模板、环境约束和 APISIX 运行时样板。
- IAM 负责第三方业务应用实例、路由申请、upstream、启停、审批、审计、版本和回滚。
- APISIX Admin API 负责把 Git 基线或 IAM 动态注册状态热更新到 APISIX。

## 目录结构

```text
gateway/apisix/
  config/
    config.dev.yaml
    config.prod.example.yaml
  manifests/
    dev/
      iam/
        routes.yaml
        upstreams.yaml
        services.yaml
        plugin-configs.yaml
        consumers.yaml
        ssl.yaml
      tender/
        routes.yaml
        upstreams.yaml
        services.yaml
        plugin-configs.yaml
        consumers.yaml
        ssl.yaml
      gds/
        routes.yaml
        upstreams.yaml
        services.yaml
        plugin-configs.yaml
        consumers.yaml
        ssl.yaml
    prod/
      iam/
      tender/
      gds/
  src/
    cli.ts
    commands.ts
    resources.ts
    manifest.ts
    validators/
```

manifest 采用 `<env>/<app>/` 两级目录。`dev:iam` manifest 用于本地 IAM 基线；`prod:iam` 是生产 IAM 基线示例，生产地址、证书和密钥引用必须在部署环境中替换或注入。`prod:tender`、`prod:gds`、`dev:tender`、`dev:gds` 存放对应业务系统的 APISIX 配置。

## 来源标签

仓库基线对象必须包含：

```yaml
labels:
  managed_by: shgas-iam
  source: repo-manifest
  env: prod
  app: iam
```

IAM 动态注册对象必须使用独立来源：

```yaml
labels:
  managed_by: shgas-iam
  source: dynamic-registry
  app_code: example-crm
  config_version: "17"
```

`apisix-sync` 只管理 `source=repo-manifest`。它会避让 `source=dynamic-registry`，避免 Git 基线发布误删第三方业务应用的热更新配置。

## 常用命令

`gateway/apisix` 是 workspace package `@iam/gateway-apisix`。仓库根目录保留 `gateway:apisix:*` 兼容命令；需要直接操作该 package 时，也可以使用 `pnpm --filter @iam/gateway-apisix <script>`。

同步命令必须显式指定 app scope。优先使用 `--env <env:app>`；也可以通过 `APISIX_MANIFEST_ENV=<env:app>` 注入。`--env dev` 这类 env-only scope 不再支持，旧的 `scripts/apisix-sync.ts` 直接执行路径也已移除。

校验 manifest：

```bash
pnpm gateway:apisix:validate -- --env dev:iam
pnpm gateway:apisix:validate -- --env dev:tender
pnpm gateway:apisix:validate -- --env dev:gds
pnpm gateway:apisix:validate -- --env prod:iam
pnpm gateway:apisix:validate -- --env prod:tender
pnpm gateway:apisix:validate -- --env prod:gds
pnpm --filter @iam/gateway-apisix validate -- --env dev:iam
APISIX_MANIFEST_ENV=dev:iam pnpm gateway:apisix:validate
```

查看与远端 APISIX 的差异：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:diff -- --env dev:iam --admin-url http://127.0.0.1:9180/apisix/admin
```

dry-run 发布：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev:iam --dry-run
```

发布基线配置：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev:iam
```

删除已经从 Git manifest 移除的 `repo-manifest` 远端对象：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev:iam --prune
```

`--prune` 不会删除 `source=dynamic-registry` 对象；使用 `--env prod:tender` 这类 app 作用域时，也不会删除其他 `labels.app` 的 `repo-manifest` 对象。

## 环境变量配置

同步脚本当前直接识别以下环境变量：

| 变量 | 适用命令 | 说明 |
| --- | --- | --- |
| `APISIX_MANIFEST_ENV` | `validate`、`diff`、`apply` | manifest scope，格式必须是 `<env>:<app>`，例如 `dev:iam`。当未传 `--env` 时使用。 |
| `APISIX_ADMIN_URL` | `diff`、`apply` | APISIX Admin API 地址。当未传 `--admin-url` 时使用；再未配置则默认 `http://127.0.0.1:9180/apisix/admin`。 |
| `APISIX_ADMIN_KEY` | `diff`、`apply` | APISIX Admin API key。当未传 `--admin-key` 时使用；`diff` 和 `apply` 缺少 key 会失败。 |

参数优先级：

- scope：`--env <env:app>` > `APISIX_MANIFEST_ENV`。
- Admin API 地址：`--admin-url` > `APISIX_ADMIN_URL` > 默认本地地址。
- Admin API key：`--admin-key` > `APISIX_ADMIN_KEY`。

manifest 中的 `${VAR}` 占位符不会默认渲染；只有传入 `--render-env` 或 `--env-file <path>` 时才会递归渲染字符串值和对象 key。`--env-file` 支持最小 env assignment 语法，例如：

```bash
TENCENT_NGINX_TRUSTED_CIDR=10.0.0.0/24
IAM_API_UPSTREAM_HOST=api.internal
IAM_API_UPSTREAM_PORT="30000"
IAM_SSO_EXTERNAL_HOST=iam.example.com
IAM_SSO_INTERNAL_HOST=iam.internal.example.com
IAM_SSO_CORS_ALLOW_ORIGINS=https://iam.example.com
```

使用示例：

```bash
APISIX_MANIFEST_ENV=dev:iam \
APISIX_ADMIN_URL=http://127.0.0.1:9180/apisix/admin \
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply

pnpm gateway:apisix:validate -- --env prod:iam --env-file .env.prod
pnpm gateway:apisix:validate -- --env prod:iam --render-env
```

JSON 输出的变更：

- `diff --json` 和 `apply --json` 输出 `ignored: []`，每项包含 `kind`、`id`、`reason`；`reason` 为 `dynamic`、`out_of_scope` 或 `unmanaged`。
- 旧字段 `ignoredDynamic`、`ignoredOutOfScope`、`ignoredUnmanaged` 已移除。
- `apply --json` 输出 `applied: []`，每项包含 `kind`、`id`、`action`；`action` 为 `create`、`update` 或 `delete`。
- `apply --json --dry-run` 永远输出 `applied: []`。

## 本地开发

启动依赖、后端、前端和 APISIX：

```bash
docker compose -f docker/docker-compose-dev.yml up -d db redis api admin-api sso admin apisix-etcd apisix
```

初始化或更新本地网关基线：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev:iam
```

本地入口：

- APISIX HTTP: `http://localhost:9080`
- APISIX HTTPS: `https://localhost:9443`
- APISIX Admin API: `http://127.0.0.1:9180/apisix/admin`
- API 直连调试端口仍保留：`api` 映射到 `30011`，`admin-api` 映射到 `30012`
- 前端直连调试端口仍保留：`sso` 映射到 `30013`，`admin` 映射到 `30014`
- SSO API host routes: 外网 `iam-sso.localhost`、内网 `iam-sso.internal.localhost` 均转发到 `api:30000`，
  并分别覆盖注入 `X-IAM-Entry-Network: external` / `internal`

本地基线路由统一使用 `/api/iam` 外部前缀，并在 APISIX 中通过 `proxy-rewrite` 去掉该前缀后转发给后端：

- `/api/iam/public/*`、`/api/iam/open/*`、`/api/iam/internal/*`、`/api/iam/auth/*` -> `api:30000`
- `Host: iam-sso.localhost` + `/sso/*`、`Host: iam-sso.internal.localhost` + `/sso/*` -> `api:30000`
- `/api/iam/admin/*`、`/api/iam/rpc/*` -> `admin-api:30001`
- `/portal`、`/portal/*` -> `sso:80`
- `/iam-admin`、`/iam-admin/*` -> `admin:80`

这些路由参考了仓库根目录的 `apisix-dump.yaml`，其中 `iam-prod`、`iam-test`、`iam-admin-prod`、`iam-admin-test` 属于 IAM 基础入口；`tender-*`、`gds-*` 属于业务系统入口，分别放在对应 app manifest 中。旧的通用 `/api/iam/*` 泛路由不再纳入 Git manifest，避免它吞掉更明确的 admin、rpc 或分层 API 路由。

## API IP 限流

仓库基线对 `dev` 和 `prod` 的 IAM、Tender、GDS API routes 通过 route 级 `plugin_config_id` 绑定 APISIX `limit-req` 平滑限流。普通 API 使用 `rate: 10`、`burst: 20`、`key_type: var`、`key: remote_addr`、`policy: local`，超过平滑限流阈值时返回 `429`。IAM internal route 使用独立策略，`rate: 50`、`burst: 100`，用于内部系统互调的短峰值缓冲。

限流策略只覆盖 API routes，不绑定前端、静态资源或文件入口。`/portal`、`/portal/*`、`/iam-admin`、`/iam-admin/*`、`/tender`、`/tender/*`、`/tender-portal`、`/tender-portal/*`、`/data-platform`、`/data-platform/*`、Tender `/minio/*` 和 GDS `/webroot/*` 不使用本 API IP 限流策略。

API 限流 `plugin_config` 同时启用 `real-ip`，从可信腾讯云 Nginx 的 `X-Forwarded-For` 解析真实客户端 IP。生产 manifest 使用 `${TENCENT_NGINX_TRUSTED_CIDR}` 注入可信腾讯云 Nginx 出口 CIDR；该网段必须固定、最小化，禁止配置为 `0.0.0.0/0`。请求不来自可信出口 CIDR 时，APISIX 不信任请求自带的 `X-Forwarded-For`，继续按直接来源 IP 限流。

当前生产 APISIX 按单节点部署，限流策略使用 `policy: local` 本地计数。APISIX 横向扩容前必须重新评估并切换到 Redis 或 redis-cluster 策略，否则多节点下每 IP 实际额度会按节点数放大。

修改 API IP 限流相关 manifest 后，至少分别校验六个环境作用域：

```bash
pnpm gateway:apisix:validate -- --env dev:iam
pnpm gateway:apisix:validate -- --env dev:tender
pnpm gateway:apisix:validate -- --env dev:gds
pnpm gateway:apisix:validate -- --env prod:iam --env-file .env.prod
pnpm gateway:apisix:validate -- --env prod:tender --env-file .env.prod
pnpm gateway:apisix:validate -- --env prod:gds --env-file .env.prod
```

生产发布前还必须执行 `diff` 和 `apply --dry-run`，确认渲染后的 `${TENCENT_NGINX_TRUSTED_CIDR}` 不是全网段，并复核 SSO CORS、`forward-auth`、`proxy-rewrite` 等既有 route 插件没有被改写。

## 生产发布

生产配置要求：

- `APISIX_ADMIN_KEY`、TLS 私钥、JWT secret、第三方系统密钥不得写入 manifest。
- Admin API 必须限制监听地址或来源网段，默认建议只暴露在内网运维网络或本机。
- `gateway/apisix/manifests/prod/*.yaml` 支持 `${VAR}` 占位符；发布时使用 `--env-file` 或 `--render-env` 渲染。
- API IP 限流必须配置 `TENCENT_NGINX_TRUSTED_CIDR`，且不得使用 `0.0.0.0/0`。
- IAM SSO API routes 必须配置 `IAM_SSO_EXTERNAL_HOST` 和 `IAM_SSO_INTERNAL_HOST`；这两个 host
  分别注入 `X-IAM-Entry-Network: external` 与 `internal`，不保留无 host 限制的 `/sso/*` 兜底 route。
- 生产发布前必须先执行 `validate` 和 `apply --dry-run`。
- 生产删除必须显式使用 `--prune`，并确认待删除对象均为 `source=repo-manifest`。

发布流程：

1. 修改 `gateway/apisix/manifests/<env>/<app>/` 中的对象。
2. 准备生产环境变量文件，例如 `.env.prod`。
3. 运行 `pnpm gateway:apisix:validate -- --env <env>:<app> --env-file .env.prod`。
4. 运行 `pnpm gateway:apisix:diff -- --env <env>:<app> --env-file .env.prod` 检查远端差异。
5. 运行 `pnpm gateway:apisix:apply -- --env <env>:<app> --env-file .env.prod --dry-run`。
6. 运行 `pnpm gateway:apisix:apply -- --env <env>:<app> --env-file .env.prod`。
7. 提交 Git review。
8. 合并后由部署流程执行 `apply`。

如果环境变量已经由 CI/CD 或 shell 注入，也可以用 `--render-env` 代替 `--env-file .env.prod`：

```bash
APISIX_ADMIN_KEY=prod-admin-key \
pnpm gateway:apisix:apply -- --env prod:iam --render-env --admin-url http://127.0.0.1:9180/apisix/admin
```

如果运维终端配置了代理，访问内网 Admin API 时建议显式设置 `NO_PROXY`：

```bash
NO_PROXY=176.169.89.64,localhost,127.0.0.1 \
no_proxy=176.169.89.64,localhost,127.0.0.1 \
pnpm gateway:apisix:apply -- --env prod:iam --env-file .env.prod --admin-url http://176.169.89.64:9180/apisix/admin
```

回滚流程：

1. 回滚 Git 中的 manifest 版本。
2. 重新执行 `validate`、`diff` 和 `apply --dry-run`。
3. 执行 `apply` 恢复基线对象。
4. 如需应急恢复，可先从 APISIX Admin API 导出现网配置，再整理为 manifest 或手工恢复。

## 第三方业务应用动态注册

业务应用实例可以按 app 目录纳入 Git manifest，也可以由 IAM 运行时管理：

```text
第三方应用申请
  -> IAM 校验 appCode、domain/path、upstream、策略模板和审批规则
  -> 写入 IAM DB desired state
  -> IAM gateway publisher 调用 APISIX Admin API
  -> APISIX 热更新 route/upstream/plugin_config
  -> IAM 记录发布版本、结果和审计日志
```

第三方应用只能选择平台定义的策略模板，例如 `auth=sso`、`rateLimit=standard`、`cors=trusted-domains`。IAM 将模板展开为 APISIX 对象，业务方不能直接提交任意 APISIX plugin 配置。
