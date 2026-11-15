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
