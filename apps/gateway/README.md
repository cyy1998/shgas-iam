# APISIX 网关配置管理

`@iam/gateway-apisix` 是独立 Bun + Hono 配置 API，IAM 和第三方应用统一通过 HTTP 发布。
调用方保管 YAML，APISIX 保存实际配置；Gateway 不保存期望配置、版本历史或持久发布任务。
完整输入、结果和恢复边界见[功能契约](../../docs/features/gateway/gateway-configuration-api.md)，
部署、首次发布和人工恢复见[发布手册](../../docs/releases/apisix-gateway-release.md)。

## 启动与调用

按 [.env.example](.env.example) 提供 `IAM_GATEWAY_DATABASE_URL`、`IAM_GATEWAY_APISIX_ADMIN_URL`、
`IAM_GATEWAY_APISIX_ADMIN_KEY`，再运行：

```bash
pnpm --filter @iam/gateway-apisix start
# 开发时监听源码变化
pnpm --filter @iam/gateway-apisix dev
```

正式入口为 `src/main.ts`，start 执行 `bun src/main.ts`，默认监听 `0.0.0.0:30004`。
Compose 的 `gateway-api` 默认只向宿主 `127.0.0.1:30004` 映射，应限制在可信管理网络。
`GET /health` 返回 200 只证明 HTTP 就绪，不检查 PostgreSQL 或 APISIX；关闭期间返回 503。
Gateway 不依赖 Redis。自有 PostgreSQL pool 最多 4 条连接并设置默认只读，部署仍需专用 reader role。
启动参数、权限和执行/关闭预算见[服务配置](../../docs/releases/apisix-gateway-release.md#服务配置与部署)。

三种操作均要求 `Content-Type: application/json`，通过 `apikey` header 提交 scope 对应 Client 的
Internal API Secret。例如 `prod:tender` 要求 code 为 tender、Enable 且未删除的 Client。
每次请求读取当前数据库记录，不缓存、不使用 SSO Secret；已认证的在途操作继续完成。
缺失、错误、跨应用或状态不允许统一返回 401，数据库不可用返回 503，均不访问 APISIX。
首次提交 iam scope 前需准备 `iam` Client，`iam-admin` 不能替代它。

共同请求体：

```json
{
  "scope": "dev:tender",
  "yaml": "service: {}",
  "variables": {}
}
```

| 请求             | 作用                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| `POST /validate` | 校验 YAML，返回资源数量和安全问题，不访问 APISIX。                         |
| `POST /diff`     | 读取远端，返回 `data.outcome: "preview"` 与 `data.plan`，不写入。          |
| `POST /apply`    | 可加 dryRun、prune，均默认 false；重新读取并规划，正式执行写入及必要补偿。 |

响应使用 `{code,data,message}` envelope。正式成功区分 `applied`（written:true）和
`no_change`（written:false）；dry-run 为 preview。计划只含 kind/id 和忽略原因，不返回完整资源或秘密。
APISIX SSL list 的私钥是加密值，同一份含明文私钥变量的源配置再次提交时，仍可能规划 SSL update 并重写。
no_change 仅表示当前计划没有实际写集，不保证七类资源重复提交都不写入；Gateway 不解密私钥作等价比较。
变量只从本次 variables 映射解析，省略为空；不回退进程环境，不接受服务器文件路径或请求指定的远端地址。
Secret 字段必须使用占位符或外部秘密引用。请求示例见[发布流程](../../docs/releases/apisix-gateway-release.md#标准发布流程)。
旧 CLI、根 `gateway:apisix:*` 命令及其 env/file 参数已退役。

## 目录与 YAML

```text
apps/gateway/
  src/
    main.ts               # 正式进程入口
    runtime.ts            # HTTP 监听与关闭
    http/                 # 请求、envelope 与生命周期
    composition/          # 只读数据库与 APISIX adapter 接线
    services/gateway/     # 认证、规划、发布与恢复
    repositories/         # Client 窄读取
    validators/           # YAML 规则
  Dockerfile
  .env.example
```

manifest 是调用方维护的 app-centric 单文件源，仓库示例位于 `tmp/gateway-config/apisix/manifests/<env>/<app>.yaml`。
`dev:iam` 为本地基线，`prod:iam` 为生产示例；生产地址、证书和秘密通过本次请求变量提供。
YAML 支持 service、upstreams、routes、consumers、ssls、service plugin_configs 和 plugin_metadata，
物化为七类 APISIX 资源。例如：

```yaml
service:
  desc: Tender gateway app service
  plugin_configs:
    - key: api-ip-rate-limit
      plugins:
        limit-req:
          rate: 10
          burst: 20
upstreams:
  - key: api
    nodes:
      ${DEV_TENDER_API_UPSTREAM_HOST}:${DEV_TENDER_API_UPSTREAM_PORT}: 1
routes:
  - key: api
    uri: /api/tender/*
    upstream: api
    plugin_config: api-ip-rate-limit
```

- app service 的 id/name 为 `<app>.<env>`；route、upstream、plugin_config 的 id/name 为 `<app>.<key>.<env>`。
- Consumer 的 username 为 `<app>_<key>_<env>`，例如 tender_reader_dev；其余标识保持既有规则，plugin_metadata 仍以插件 key 标识。
- SSL 的 id 沿点号规则，不生成 name；`ssls[].key` 为本地名，`private_key: ${TLS_PRIVATE_KEY}` 映射 APISIX 私钥 key，证书与私钥均必填。
- 非 terminal route 声明 `upstream: <key>`，物化时注入 service/upstream 引用；`plugin_config: <key>` 引用同文件策略。
- `terminal: true` 不注入 service/upstream，适用于 redirect；源文件不手写物化后的 id/name 或资源引用 ID。

物化时注入 managed_by:shgas-iam、source:repo-manifest、env、app 标签，源自定义 labels 不得覆盖它们。
发布只管理当前 scope 的 repo-manifest 对象，避让 dynamic-registry、其他 scope 和未管理对象。
删除候选默认只展示，不执行。存在独立 credential 子资源的 Consumer 不允许 prune；无法确认子列表为空时，
整次 apply 在任何写入前拒绝。子凭据先由实际 owner 处理，不属于七类 YAML 或恢复集合。

## 本地与生产基线

Gateway 配置由调用方在 Git 忽略目录 `tmp/gateway-config/apisix/` 保管，不随 clone 提供。
运行 Compose 或准备发布前，须在该目录准备 `config.dev.yaml`、
`config.prod.example.yaml` 及 `manifests/dev/`、`manifests/prod/` 中的应用配置。
缺失时相关入口会失败；应用源码本身不读取此目录。不要将发布变量、凭据或现场快照加入 Git。
本次迁移未调整测试及测试镜像，现有配置测试和 Full-system E2E 仍引用原 `docker/apisix/` 路径。

开发编排为 `docker/compose.dev.yaml`，模板为 `docker/.env.dev.example`；Gateway 数据库 URL
必须显式提供，不能继承其他 app 的读写连接。生产 `gateway-api` 位于 `docker/compose.prod.apps.yaml`，
镜像由 `apps/gateway/Dockerfile` 构建；APISIX 与 etcd 位于 `docker/compose.prod.gateway.yaml`。
APISIX 启动配置位于 `tmp/gateway-config/apisix/`，发布基线位于 `tmp/gateway-config/apisix/manifests/<env>/<app>.yaml`。
生产 Gateway API 可独立启动，通过 `IAM_GATEWAY_APISIX_ADMIN_URL` 连接 APISIX；发布前须按
[发布手册](../../docs/releases/apisix-gateway-release.md)核验数据库权限与 APISIX 可用性。
首次配置通过直连 API 完成，不依赖尚未创建的 IAM 路由。
APISIX Admin API 固定使用 v3，Admin Key 只留在服务部署配置。

本机 dev 发布变量示例为 [`variables.dev.example.json`](../../tmp/gateway-config/apisix/variables.dev.example.json)，
作为请求的 `variables` 字段提交，不由 Compose 自动加载。示例保留本机 IAM 和 GDS 主应用地址，
GDS 子应用、dashboard、Tender、Contract 与 MinIO 使用远程 dev 上游；发布前按实际运行位置调整。
SSO/OIDC 的两个 Host 必须与 API 的 internal/external origin 一致，示例为 `localhost:30080` 和
`localhost:39999`；变量本身不创建端口映射，外部入口还需相应的监听或代理。

dev manifests 包含 `iam`、`gds`、`tender`、`contract`。Contract API 和 Tender 的 MinIO 路由来自
远程 dev 的未管理配置，纳入 manifest 后使用生成的资源 ID；Contract 的内嵌上游改为独立上游。
MinIO 保留远程的路径重写与无网关鉴权插件配置；Contract/Tender 鉴权仍指向远程 IAM，
GDS 示例鉴权指向本机 IAM。发布各 scope 前均需准备同名、已启用的 Client；不能为同步配置绕过禁用状态。
这两条路由在远程仍是未管理对象，不会被 `prune` 清除，不能直接将新增 manifest 发布到远程造成重叠路由。

本地数据面为 `http://localhost:30080` / `https://localhost:30443`，Admin API 为
`http://127.0.0.1:9180/apisix/admin`。IAM 的 `/api/iam` 前缀经 proxy-rewrite 去除：
public/open/internal/auth 转 API，admin/rpc 转 Admin API；`/portal`、`/iam-admin` 转前端。
SSO/OIDC 使用受控内外网 host，分别覆盖 X-IAM-Entry-Network，无未知 host 的协议兜底。
双入口发布见[OIDC 手册](../../docs/releases/oidc-release-runbook.md)。

API routes 经 route 级 plugin_config 绑定 limit-req，普通 API 为 rate 10 / burst 20，
IAM internal 为 rate 50 / burst 100；前端、静态和文件入口不使用本 API 限流策略。
real-ip 只信任 `${TENCENT_NGINX_TRUSTED_CIDR}` 指定的最小腾讯云 Nginx CIDR，禁止全网段。
当前 APISIX 单节点使用 policy:local，扩容前需评估共享计数。发布前复核 forward-auth、proxy-rewrite、CORS 和 host，
详细步骤由发布手册维护。

## 故障与验证

apply 从 fresh read 到发布或补偿结束持有本实例执行权，重叠请求返回 GATEWAY_BUSY，不排队。
首错停止正向写入并补偿所有已尝试目标；恢复失败或作用未知保留内存阻断，后续 apply 返回 GATEWAY_BLOCKED。
客户端断连后原操作继续，不自动重试；没有收到结果时不能自动重发。
人工先确认在途与迟到写入结束，核对并修复 APISIX，再重启 Gateway 并明确提交新请求。
重启只清除阻断，不证明恢复完成；多实例和外部写者不受本实例串行控制。

```bash
pnpm --filter @iam/gateway-apisix test:unit
pnpm --filter @iam/gateway-apisix typecheck
pnpm test:integration --workspace apps/gateway
```

Integration 由根编排准备 PostgreSQL，Gateway fixture 管理 APISIX/etcd 与正式进程并准确清理。
聚焦验证通过真实 HTTP 发布并回读 APISIX，不连接开发数据库或启动完整 IAM 系统。
完整系统 E2E publisher 也通过 HTTP；既有旅程的存在不表示本次执行了系统或浏览器 E2E。
