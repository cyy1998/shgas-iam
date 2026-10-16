ARG BUN_IMAGE=docker.xuanyuan.run/oven/bun:1.4.2-alpine
FROM ${BUN_IMAGE}
WORKDIR /workspace
COPY apps/gateway/manifests/dev/iam.yaml ./apps/gateway/manifests/dev/iam.yaml
COPY e2e/system/src/gateway-sync.ts e2e/system/src/gateway-credential.ts ./e2e/system/src/
CMD ["bun", "e2e/system/src/gateway-sync.ts"]
