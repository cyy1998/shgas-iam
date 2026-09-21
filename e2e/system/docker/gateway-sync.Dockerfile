FROM docker.xuanyuan.run/node:24.18.0-alpine AS workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

WORKDIR /workspace
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY gateway/package.json ./gateway/package.json
RUN --mount=type=cache,id=iam-e2e-pnpm-v12,target=/pnpm/store \
    pnpm install --filter @iam/gateway-apisix... --prod --frozen-lockfile --ignore-scripts

COPY gateway ./gateway
COPY e2e/system/src/gateway-sync.ts ./e2e/system/src/gateway-sync.ts

FROM docker.xuanyuan.run/oven/bun:1.4.2-alpine

WORKDIR /workspace
COPY --from=workspace /workspace /workspace

CMD ["bun", "e2e/system/src/gateway-sync.ts"]
