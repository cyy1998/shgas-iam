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
Hybrid E2E 在 Linux（含 WSL2）运行。APISIX 从[独立镜像上下文](../docker/apisix/)加载配置，
通过 `network_mode: host` 在动态回环端口监听，并经 `127.0.0.1` 访问宿主业务进程和映射后的 etcd 端口。
WSL2 搭配 Docker Desktop 时，须使用 4.34+ 并启用 Host networking。

Hybrid E2E 收尾时在运行产物目录写入 `host-memory.json`，记录各阶段的宿主可用物理内存采样。

常驻中间件按宿主用户复用，跨工作树共享互斥锁。同一套栈在运行结束后保留，可以按记录中的准确 project 运行
`pnpm --filter @iam/e2e-system runtime:cleanup -- --project <project>` 回收。独占模式显式保留环境时会打印其记录对应的清理命令。

若常驻记录来自旧网络模式，先运行 `pnpm test:e2e:down`，按原 Compose 快照回收后再启动。
