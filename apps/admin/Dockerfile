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
COPY packages/custom-sso/package.json ./packages/custom-sso/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/session-kernel/package.json ./packages/session-kernel/
COPY packages/domain/package.json ./packages/domain/
COPY packages/jobs/package.json ./packages/jobs/
COPY packages/organization-responsibility-resolution/package.json ./packages/organization-responsibility-resolution/
COPY packages/role-assignment-resolution/package.json ./packages/role-assignment-resolution/
COPY packages/user-profile-read-model/package.json ./packages/user-profile-read-model/
COPY apps/admin-api/package.json ./apps/admin-api/
COPY apps/admin/package.json ./apps/admin/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN --mount=type=cache,id=iam-pnpm-v11,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder
ARG UMI_APP_ADMIN_API_PREFIX
ARG UMI_APP_ADMIN_SSO_AUTHORIZE_URL
ARG UMI_APP_ADMIN_SSO_LOGOUT_URL
ARG UMI_APP_ADMIN_CLIENT_CODE
ARG UMI_APP_ADMIN_GRAFANA_URL
ARG UMI_APP_ADMIN_SYSTEM_LOG_ENV
ENV UMI_APP_ADMIN_API_PREFIX=$UMI_APP_ADMIN_API_PREFIX
ENV UMI_APP_ADMIN_SSO_AUTHORIZE_URL=$UMI_APP_ADMIN_SSO_AUTHORIZE_URL
ENV UMI_APP_ADMIN_SSO_LOGOUT_URL=$UMI_APP_ADMIN_SSO_LOGOUT_URL
ENV UMI_APP_ADMIN_CLIENT_CODE=$UMI_APP_ADMIN_CLIENT_CODE
ENV UMI_APP_ADMIN_GRAFANA_URL=$UMI_APP_ADMIN_GRAFANA_URL
ENV UMI_APP_ADMIN_SYSTEM_LOG_ENV=$UMI_APP_ADMIN_SYSTEM_LOG_ENV
COPY packages/client-subject-projection/ ./packages/client-subject-projection/
COPY packages/custom-sso/ ./packages/custom-sso/
COPY packages/contracts/ ./packages/contracts/
COPY packages/db/ ./packages/db/
COPY packages/api-core/ ./packages/api-core/
COPY packages/session-kernel/ ./packages/session-kernel/
COPY packages/domain/ ./packages/domain/
COPY packages/jobs/ ./packages/jobs/
COPY packages/organization-responsibility-resolution/ ./packages/organization-responsibility-resolution/
COPY packages/role-assignment-resolution/ ./packages/role-assignment-resolution/
COPY packages/user-profile-read-model/ ./packages/user-profile-read-model/
COPY apps/admin-api/ ./apps/admin-api/
COPY apps/admin/ ./apps/admin/
RUN pnpm rebuild && pnpm --filter @iam/admin run setup && pnpm --filter @iam/admin run build

FROM docker.xuanyuan.run/nginx:1.27.5-alpine AS runner
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin/dist/ /usr/share/nginx/html/iam-admin/
EXPOSE 80
