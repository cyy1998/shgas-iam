ARG BUN_IMAGE=docker.xuanyuan.run/oven/bun:1.4.4-alpine
FROM ${BUN_IMAGE}
WORKDIR /app
COPY src/stubs/ ./src/stubs/
COPY docker/e2e-stubs/entrypoint.ts ./docker/e2e-stubs/entrypoint.ts
COPY docker/rp-terminal.html ./docker/rp-terminal.html
COPY test-assets/e2e-stubs-cert.pem ./test-assets/e2e-stubs-cert.pem
COPY test-assets/e2e-stubs-key.pem ./test-assets/e2e-stubs-key.pem
EXPOSE 443 8080
CMD ["bun", "run", "docker/e2e-stubs/entrypoint.ts"]
