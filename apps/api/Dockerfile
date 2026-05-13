# Build context: monorepo root
#   docker build -f apps/api/Dockerfile -t iam-api .

# ── Stage 1: pnpm base ───────────────────────────────────────────────────────
FROM docker.xuanyuan.run/node:24-bookworm AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json           ./apps/api/
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN pnpm install --frozen-lockfile

# ── Stage 3: Create deploy bundle ────────────────────────────────────────────
# FROM deps AS builder
# COPY packages/contracts/ ./packages/contracts/
# COPY packages/db/ ./packages/db/
# COPY apps/api/        ./apps/api/
# # Flatten monorepo → self-contained bundle (prod deps + source, no devDeps)
# RUN pnpm --filter @iam/api deploy --prod /deploy/api

# ── Stage 4: Production runtime (Bun) ────────────────────────────────────────
FROM docker.xuanyuan.run/oven/bun:1-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules              ./node_modules
# COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/apps/api/node_modules    ./apps/api/node_modules
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY apps/api/        ./apps/api/
WORKDIR /app/apps/api
EXPOSE 30000
CMD ["bun", "run", "src/index.ts"]
