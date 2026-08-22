# Build context: monorepo root

FROM docker.xuanyuan.run/node:24.18.0-alpine AS base
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
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

FROM base AS deps
WORKDIR /app
ENV HUSKY=0
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY .husky/install.mjs ./.husky/install.mjs
COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/domain/package.json ./packages/domain/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/organization-responsibility-resolution/package.json ./packages/organization-responsibility-resolution/
COPY packages/role-assignment-resolution/package.json ./packages/role-assignment-resolution/
COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/
COPY apps/admin-api/package.json ./apps/admin-api/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN --mount=type=cache,id=iam-pnpm-v11,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM deps AS builder
COPY packages/client-subject-projection/ ./packages/client-subject-projection/
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
COPY packages/domain/ ./packages/domain/
COPY packages/jobs/ ./packages/jobs/
COPY packages/organization-responsibility-resolution/ ./packages/organization-responsibility-resolution/
COPY packages/role-assignment-resolution/ ./packages/role-assignment-resolution/
COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/
COPY apps/admin-api/ ./apps/admin-api/
RUN --mount=type=cache,id=iam-pnpm-v11,target=/pnpm/store \
    pnpm --config.inject-workspace-packages=true --filter @iam/admin-api deploy --prod /deploy/admin-api

FROM docker.xuanyuan.run/oven/bun:1.3.14-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy/admin-api ./
EXPOSE 30001
CMD ["bun", "run", "src/index.ts"]
