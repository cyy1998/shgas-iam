# 全系统 E2E 测试资源

企业微信扫码的手机端使用 `external.iam.localhost` 上的 APISIX HTTPS 测试监听器。Gateway API 仅在双入口测试中发布其 SNI 和合成证书。Playwright 接受该证书的 SPKI，路由探针为该 hostname 校验证书。

在本目录执行以下命令更新测试证书和私钥。

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -noenc -sha256 \
  -subj "/CN=external.iam.localhost/O=IAM Full-system E2E Fixture" \
  -addext "subjectAltName=DNS:external.iam.localhost" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -days 3650 -out wecom-mobile-cert.pem -keyout wecom-mobile-key.pem
```

Hybrid 和 Container Smoke 均通过 Gateway API 发布[开发 manifest](../../../docker/gateway/iam.dev.example.yaml)。
Hybrid 中间件的 APISIX 配置由[独立镜像上下文](../docker/apisix/)携带。Windows 和 macOS 本机直跑使用 Bridge，
可用 `IAM_E2E_UPSTREAM_HOST` 覆写宿主上游地址。Linux 与 AFK 使用 Host 网络和动态回环端口。

常驻中间件按宿主用户复用，跨工作树共享互斥锁。同一套栈在运行结束后保留，可以按记录中的准确 project 运行
`pnpm --filter @iam/e2e-system runtime:cleanup -- --project <project>` 回收。独占模式显式保留环境时会打印其记录对应的清理命令。
