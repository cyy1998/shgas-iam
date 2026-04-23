# Build context: monorepo root
#   docker build -f apps/api/Dockerfile -t iam-api .

# ── Stage 1: pnpm base ───────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json           ./apps/api/
RUN pnpm install --frozen-lockfile

# ── Stage 3: Generate Prisma client & create deploy bundle ───────────────────
FROM deps AS builder
COPY packages/shared/ ./packages/shared/
COPY apps/api/        ./apps/api/
# Prisma client outputs to apps/api/src/db/generated/prisma
RUN pnpm --filter @iam/api exec prisma generate
# Flatten monorepo → self-contained bundle (prod deps + source, no devDeps)
RUN pnpm --filter @iam/api deploy --prod /deploy/api

# ── Stage 4: Production runtime (Bun) ────────────────────────────────────────
FROM oven/bun:1-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy/api ./
EXPOSE 30000
CMD ["bun", "run", "src/index.ts"]
