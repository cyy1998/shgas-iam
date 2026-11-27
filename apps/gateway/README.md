# APISIX 网关配置 API

`@iam/gateway-apisix` 是独立的 Bun + Hono 服务。调用方保管 YAML，Gateway 按请求读取 IAM 的 Client 记录、计算配置差异并调用 APISIX Admin API。生效配置在 APISIX，服务只在本次操作期间保留补偿所需的前态。

## 本地启动

按[环境模板](.env.example)在 `apps/gateway/.env` 填写 Gateway 专用的 PostgreSQL 只读连接、APISIX Admin API 地址和 Admin Key。从仓库根目录执行：

```bash
pnpm --filter @iam/gateway-apisix dev
```

`dev` 监听源码变更，`start` 直接启动。默认端口为 `30004`，`GET /health` 可检查 HTTP 进程是否就绪。数据库权限和 APISIX 连通性见[服务与首次配置](../../docs/releases/apisix-gateway-release.md#服务与首次配置)。要验证一次调用，使用[接入指南的最小请求](../../docs/guides/gateway.md#第一次校验)。

## 按改动定位代码

| 要改什么             | 从哪里开始                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 监听、关闭与依赖装配 | [进程入口](src/main.ts)、[运行时](src/runtime.ts)、[生产装配](src/composition/index.ts)。每次配置请求通过专用只读连接查询当前 Client 凭据。                                                                      |
| HTTP 请求与响应      | [HTTP 路由](src/http/app.ts)选择各端点的[请求 schema](src/services/gateway/gateway.schema.ts)，将业务错误映射为 HTTP 状态和响应体。                                                                              |
| YAML 与差异计划      | [manifest](src/manifest.ts) 将本地 key 转成 APISIX 资源标识，[校验器](src/validators/index.ts)检查源配置，[planner](src/planner.ts)对比期望配置和远端状态。                                                      |
| 发布与补偿           | [Gateway 服务](src/services/gateway/gateway.service.ts)编排认证和预览，[发布逻辑](src/services/gateway/gateway-publication.ts)计算实际写集并在失败后补偿，[APISIX adapter](src/apisix-admin-client.ts)读写远端。 |

## 故障与验证

每个实例同时只允许一个 `/apply`（含 dry-run）。写入失败后，服务在原操作预算内尝试恢复已触及的资源。结果未知或补偿失败会阻断该实例后续发布。关闭期间先等待在途请求。设计取舍见 [ADR-0044](../../docs/adr/0044-publish-gateway-configurations-through-a-stateless-api.md)，现场处置见[失败与恢复](../../docs/releases/apisix-gateway-release.md#失败与恢复)。

```bash
pnpm --filter @iam/gateway-apisix test:unit
pnpm --filter @iam/gateway-apisix typecheck
pnpm test:infra:up
pnpm test:integration --workspace apps/gateway
```

[Unit](src/__tests__/) 使用合成 YAML 检查输入、规划和补偿分支。[Integration](test-integration/) 依赖预先启动的本地专用测试服务（`pnpm test:infra:up`，或外部注入 `IAM_TEST_POSTGRES_URL`、`IAM_TEST_APISIX_ADMIN_URL` 与 `IAM_TEST_APISIX_ADMIN_KEY`），根 runner 负责准备 PostgreSQL 模板库并校验 APISIX Admin 空基线，随后在测试中启动 Gateway 发布和回读配置。完整系统旅程通过 [gateway-sync.ts](../../e2e/system/src/runtime/gateway-sync.ts) 将[开发网关示例配置](../../docker/gateway/iam.dev.example.yaml)发布到 [E2E APISIX](../../e2e/system/docker/apisix/apisix.yaml)（TLS 测试证书位于 [test-assets](../../e2e/system/test-assets/)）。
