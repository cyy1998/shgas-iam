# 全系统 E2E 测试资源

## APISIX 手机端 HTTPS 测试证书

企业微信扫码的手机端使用 `external.iam.localhost` 上的 APISIX HTTPS 测试监听器。Gateway API 发布其 SNI 和合成证书；Playwright 接受该证书的 SPKI，路由探针为该 hostname 校验证书。

在本目录执行以下命令更新手机端测试证书和私钥：

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -noenc -sha256 \
  -subj "/CN=external.iam.localhost/O=IAM Full-system E2E Fixture" \
  -addext "subjectAltName=DNS:external.iam.localhost" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -days 3650 -out wecom-mobile-cert.pem -keyout wecom-mobile-key.pem
```

## `e2e-stubs` 企业微信 HTTPS 测试 CA 与叶子证书

生产容器 E2E 通过轻量测试侧 `e2e-stubs` 容器承接企业微信 HTTPS（Compose 网络 `aliases: ["qyapi.weixin.qq.com"]`）、SMS 内存回读与 RP 回调终端页。`e2e-stubs-cert.pem` / `e2e-stubs-key.pem` 打包进 `e2e-stubs` 镜像；`e2e-stubs-ca.pem` 仅通过 Compose 内联 `configs:` 挂载到 `auth-api` 容器的 `/etc/e2e-ca/ca.pem` 并设置 `NODE_EXTRA_CA_CERTS`，生产镜像与源码零改动。

在本目录执行以下命令重新生成测试 CA 与叶子证书（CA 私钥签发后即销毁，不入仓）：

```bash
TMPCA=$(mktemp -d)
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -noenc -sha256 \
  -subj "/CN=IAM E2E Stubs Test CA/O=IAM Full-system E2E Fixture" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -days 3650 -out e2e-stubs-ca.pem -keyout "$TMPCA/ca.key"
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -noenc \
  -subj "/CN=qyapi.weixin.qq.com/O=IAM Full-system E2E Fixture" \
  -out "$TMPCA/leaf.csr" -keyout e2e-stubs-key.pem
cat > "$TMPCA/ext.cnf" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:qyapi.weixin.qq.com
EOF
openssl x509 -req -in "$TMPCA/leaf.csr" -CA e2e-stubs-ca.pem -CAkey "$TMPCA/ca.key" -CAcreateserial -CAserial "$TMPCA/ca.srl" \
  -out e2e-stubs-cert.pem -days 3650 -sha256 -extfile "$TMPCA/ext.cnf"
rm -rf "$TMPCA"
```

## 运行与清理

生产容器 E2E 通过 Gateway API 发布[开发 manifest](../../../docker/gateway/iam.dev.example.yaml)，并在独占 Compose project 中启动完整生产容器栈。本地排障可使用 `--skip-build` 复用已构建的 `iam-e2e-*:local` 镜像，或使用 `--keep` 保留容器环境；保留后的环境可按记录中的准确 project 运行 `pnpm --filter @iam/e2e-system runtime:cleanup -- --project <project>` 回收。
