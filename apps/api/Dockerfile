# Build context: monorepo root
#   docker build -f apps/api/Dockerfile -t iam-api .

# ── Stage 1: pnpm base ───────────────────────────────────────────────────────
FROM docker.xuanyuan.run/node:24-bookworm AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json           ./apps/api/
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN pnpm install --frozen-lockfile

# ── Stage 3: Create deploy bundle ────────────────────────────────────────────
FROM deps AS builder
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
COPY packages/domain/ ./packages/domain/
COPY apps/api/        ./apps/api/
# Flatten monorepo -> self-contained bundle (prod deps + source, no devDeps).
# pnpm v10 requires --legacy unless inject-workspace-packages is enabled.
RUN pnpm --filter @iam/api deploy --prod --legacy /deploy/api

# ── Stage 4: Production runtime (Bun) ────────────────────────────────────────
FROM docker.xuanyuan.run/oven/bun:1.3.14-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy/api ./
EXPOSE 30000
CMD ["bun", "run", "src/index.ts"]
