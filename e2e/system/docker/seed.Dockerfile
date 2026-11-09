FROM docker.xuanyuan.run/node:24.18.0-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"

RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

FROM base AS deps
WORKDIR /workspace
ENV HUSKY=0
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
COPY e2e/system/package.json ./e2e/system/package.json
COPY packages/subject-access/package.json ./packages/subject-access/package.json
COPY packages/unit-of-work/package.json ./packages/unit-of-work/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
COPY packages/test-support/package.json ./packages/test-support/package.json
COPY packages/session-kernel/package.json ./packages/session-kernel/package.json
COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/documents/package.json ./packages/documents/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/jobs/package.json ./packages/jobs/package.json
COPY packages/assignment-resolution/package.json ./packages/assignment-resolution/package.json
COPY packages/filter-engine/package.json ./packages/filter-engine/package.json
RUN --mount=type=cache,id=iam-e2e-pnpm-v12,target=/pnpm/store \
    pnpm install --filter @iam/e2e-system... --frozen-lockfile --prod --ignore-scripts

FROM deps AS builder
COPY e2e/system ./e2e/system
COPY packages/subject-access ./packages/subject-access
COPY packages/unit-of-work ./packages/unit-of-work
COPY packages/runtime ./packages/runtime
COPY packages/session-kernel ./packages/session-kernel
COPY packages/client-subject-projection ./packages/client-subject-projection
COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
COPY packages/documents ./packages/documents
COPY packages/domain ./packages/domain
COPY packages/jobs ./packages/jobs
COPY packages/assignment-resolution ./packages/assignment-resolution
COPY packages/filter-engine ./packages/filter-engine
RUN --mount=type=cache,id=iam-e2e-pnpm-v12,target=/pnpm/store \
    pnpm --config.inject-workspace-packages=true --filter @iam/e2e-system deploy --prod /deploy/e2e-system

FROM docker.xuanyuan.run/oven/bun:1.4.2-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy/e2e-system ./
CMD ["bun", "run", "src/seed-cli.ts"]
