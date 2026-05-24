# Build context: monorepo root

FROM docker.xuanyuan.run/node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV NODE_USE_ENV_PROXY=1
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/sso/package.json ./apps/sso/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/contracts/ ./packages/contracts/
COPY apps/sso/ ./apps/sso/
RUN pnpm --filter @iam/sso build

FROM docker.xuanyuan.run/nginx:1.27-alpine AS runner
COPY apps/sso/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/sso/dist/ /usr/share/nginx/html/portal/
EXPOSE 80
