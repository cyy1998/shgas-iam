ARG BUN_IMAGE=docker.xuanyuan.run/oven/bun:1.4.4-alpine
FROM ${BUN_IMAGE}
WORKDIR /workspace
COPY e2e/system/test-assets/iam.yaml ./e2e/system/test-assets/iam.yaml
COPY e2e/system/test-assets/wecom-mobile-cert.pem e2e/system/test-assets/wecom-mobile-key.pem ./e2e/system/test-assets/
COPY e2e/system/src/gateway-sync.ts e2e/system/src/gateway-credential.ts ./e2e/system/src/
CMD ["bun", "e2e/system/src/gateway-sync.ts"]
