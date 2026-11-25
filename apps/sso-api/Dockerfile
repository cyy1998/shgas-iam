# Build context: monorepo root
#   docker build -f apps/sso-api/Dockerfile -t iam-sso-api .

# ── Stage 1: pnpm base ───────────────────────────────────────────────────────
FROM docker.xuanyuan.run/node:24.22.3-alpine AS base
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
# Warm up pnpm's native binary in the shared base layer so Stage 2 never redownloads it on manifest changes.
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate && pnpm --version

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
ENV HUSKY=0
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
# pnpm reads patchedDependencies before --prod; this is build metadata, not a runtime dependency.
COPY patches/ ./patches/
COPY .husky/install.mjs ./.husky/install.mjs
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/assignment-resolution/package.json ./packages/assignment-resolution/
COPY packages/client-snapshot/package.json ./packages/client-snapshot/
COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/custom-sso/package.json ./packages/custom-sso/
COPY packages/db/package.json ./packages/db/
COPY packages/documents/package.json ./packages/documents/
COPY packages/domain/package.json ./packages/domain/
COPY packages/filter-engine/package.json ./packages/filter-engine/
COPY packages/oidc/package.json ./packages/oidc/
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/session-kernel/package.json ./packages/session-kernel/
COPY packages/subject-access/package.json ./packages/subject-access/
COPY packages/test-support/package.json ./packages/test-support/
COPY packages/unit-of-work/package.json ./packages/unit-of-work/
COPY apps/sso-api/package.json ./apps/sso-api/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN --mount=type=cache,id=iam-pnpm-v12,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── Stage 3: Create deploy bundle ────────────────────────────────────────────
FROM deps AS builder
COPY packages/api-core/ ./packages/api-core/
COPY packages/assignment-resolution/ ./packages/assignment-resolution/
COPY packages/client-snapshot/ ./packages/client-snapshot/
COPY packages/client-subject-projection/ ./packages/client-subject-projection/
COPY packages/contracts/ ./packages/contracts/
COPY packages/custom-sso/ ./packages/custom-sso/
COPY packages/db/ ./packages/db/
COPY packages/documents/ ./packages/documents/
COPY packages/domain/ ./packages/domain/
COPY packages/filter-engine/ ./packages/filter-engine/
COPY packages/oidc/ ./packages/oidc/
COPY packages/runtime/ ./packages/runtime/
COPY packages/session-kernel/ ./packages/session-kernel/
COPY packages/subject-access/ ./packages/subject-access/
COPY packages/unit-of-work/ ./packages/unit-of-work/
COPY apps/sso-api/ ./apps/sso-api/
# Flatten monorepo -> self-contained bundle (prod deps + source, no devDeps).
# Enable injected workspace packages for a portable deploy with a dedicated lockfile.
RUN --mount=type=cache,id=iam-pnpm-v12,target=/pnpm/store \
    pnpm --config.inject-workspace-packages=true --filter @iam/sso-api deploy --prod /deploy/sso-api

# ── Stage 4: Production runtime (Bun) ────────────────────────────────────────
FROM docker.xuanyuan.run/oven/bun:1.4.4-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy/sso-api ./
EXPOSE 30002
CMD ["bun", "run", "src/index.ts"]
