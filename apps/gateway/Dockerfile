# Build context: monorepo root.
ARG NODE_IMAGE=docker.xuanyuan.run/node:24.18.0-alpine
ARG BUN_IMAGE=docker.xuanyuan.run/oven/bun:1.4.2-alpine
FROM ${NODE_IMAGE} AS workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_USE_ENV_PROXY=1
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV HUSKY=0
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /workspace
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
COPY packages/api-core/package.json ./packages/api-core/package.json
COPY packages/session-kernel/package.json ./packages/session-kernel/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY apps/gateway/package.json ./apps/gateway/package.json
RUN --mount=type=cache,id=iam-gateway-pnpm-v12,target=/pnpm/store \
    pnpm install --filter @iam/gateway-apisix... --prod --frozen-lockfile --ignore-scripts
COPY packages/api-core/ ./packages/api-core/
COPY packages/session-kernel/ ./packages/session-kernel/
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY apps/gateway/src/ ./apps/gateway/src/
RUN --mount=type=cache,id=iam-gateway-pnpm-v12,target=/pnpm/store \
    pnpm --config.inject-workspace-packages=true --filter @iam/gateway-apisix deploy --prod /deploy/gateway
FROM ${BUN_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=workspace /deploy/gateway ./
EXPOSE 30004
CMD ["bun", "run", "src/main.ts"]
