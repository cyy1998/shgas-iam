# Build context: monorepo root

FROM docker.xuanyuan.run/node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HTTP_PROXY="http://176.169.105.96:3928"
ENV HTTPS_PROXY="http://176.169.105.96:3928"
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/sso/package.json ./apps/sso/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/contracts/ ./packages/contracts/
COPY apps/sso/ ./apps/sso/
RUN pnpm --filter @iam/sso build

FROM docker.xuanyuan.run/nginx:1.27-alpine AS runner
COPY apps/sso/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/sso/dist/ /usr/share/nginx/html/portal/
EXPOSE 80
