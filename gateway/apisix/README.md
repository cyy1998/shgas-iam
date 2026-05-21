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
```

`dev` manifest 用于本地 APISIX。`prod` manifest 是生产基线示例，生产地址、证书和密钥引用必须在部署环境中替换或注入。

## 来源标签

仓库基线对象必须包含：

```yaml
labels:
  managed_by: shgas-iam
  source: repo-manifest
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

校验 manifest：

```bash
pnpm gateway:apisix:validate -- --env dev
pnpm gateway:apisix:validate -- --env prod
```

查看与远端 APISIX 的差异：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:diff -- --env dev --admin-url http://127.0.0.1:9180/apisix/admin
```

dry-run 发布：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev --dry-run
```

发布基线配置：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev
```

删除已经从 Git manifest 移除的 `repo-manifest` 远端对象：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev --prune
```

`--prune` 不会删除 `source=dynamic-registry` 对象。

## 本地开发

启动依赖、后端和 APISIX：

```bash
docker compose -f docker/docker-compose-dev.yml up -d db redis api admin-api apisix-etcd apisix
```

初始化或更新本地网关基线：

```bash
APISIX_ADMIN_KEY=dev-local-admin-key-change-me \
pnpm gateway:apisix:apply -- --env dev
```

本地入口：

- APISIX HTTP: `http://localhost:9080`
- APISIX HTTPS: `https://localhost:9443`
- APISIX Admin API: `http://127.0.0.1:9180/apisix/admin`
- API 直连调试端口仍保留：`api` 映射到 `30011`，`admin-api` 映射到 `30012`

本地基线路由：

- `/public/*`、`/open/*`、`/internal/*`、`/sso/*`、`/auth/*` -> `api:30000`
- `/admin/*`、`/rpc/*` -> `admin-api:30001`
- `/api/iam/*` -> `api:30000`，并通过 `proxy-rewrite` 去掉 `/api/iam/` 前缀
- `/api/iam/admin/*`、`/api/iam/rpc/*` -> `admin-api:30001`，并通过 `proxy-rewrite` 去掉 `/api/iam/` 前缀

这些兼容路由参考了仓库根目录的 `apisix-dump.yaml`，其中 `iam-prod`、`iam-test`、`iam-admin-prod`、`iam-admin-test` 属于 IAM 基础入口；`tender-*`、`gds-*` 属于第三方业务应用，应由 IAM 动态注册流程管理。

## 生产发布

生产配置要求：

- `APISIX_ADMIN_KEY`、TLS 私钥、JWT secret、第三方系统密钥不得写入 manifest。
- Admin API 必须限制监听地址或来源网段，默认建议只暴露在内网运维网络或本机。
- 生产发布前必须先执行 `validate` 和 `apply --dry-run`。
- 生产删除必须显式使用 `--prune`，并确认待删除对象均为 `source=repo-manifest`。

发布流程：

1. 修改 `gateway/apisix/manifests/<env>/` 中的 IAM 基线对象。
2. 运行 `pnpm gateway:apisix:validate -- --env <env>`。
3. 运行 `pnpm gateway:apisix:diff -- --env <env>` 检查远端差异。
4. 运行 `pnpm gateway:apisix:apply -- --env <env> --dry-run`。
5. 提交 Git review。
6. 合并后由部署流程执行 `apply`。

回滚流程：

1. 回滚 Git 中的 manifest 版本。
2. 重新执行 `validate`、`diff` 和 `apply --dry-run`。
3. 执行 `apply` 恢复基线对象。
4. 如需应急恢复，可先从 APISIX Admin API 导出现网配置，再整理为 manifest 或手工恢复。

## 第三方业务应用动态注册

第三方业务应用实例不在 Git manifest 中逐个登记。它们应由 IAM 运行时管理：

```text
第三方应用申请
  -> IAM 校验 appCode、domain/path、upstream、策略模板和审批规则
  -> 写入 IAM DB desired state
  -> IAM gateway publisher 调用 APISIX Admin API
  -> APISIX 热更新 route/upstream/plugin_config
  -> IAM 记录发布版本、结果和审计日志
```

第三方应用只能选择平台定义的策略模板，例如 `auth=sso`、`rateLimit=standard`、`cors=trusted-domains`。IAM 将模板展开为 APISIX 对象，业务方不能直接提交任意 APISIX plugin 配置。
