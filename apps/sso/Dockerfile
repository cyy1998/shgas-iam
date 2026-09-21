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
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

FROM base AS deps
WORKDIR /app
ENV HUSKY=0
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY .husky/install.mjs ./.husky/install.mjs
COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/
COPY packages/custom-sso/package.json ./packages/custom-sso/
COPY packages/api-core/package.json ./packages/api-core/
COPY packages/domain/package.json ./packages/domain/
COPY packages/db/package.json ./packages/db/
COPY packages/session-kernel/package.json ./packages/session-kernel/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/sso/package.json ./apps/sso/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN --mount=type=cache,id=iam-pnpm-v12,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder
ARG UMI_APP_SSO_API_PREFIX
ARG UMI_APP_SSO_CLIENT_CODE
ARG UMI_APP_SSO_CAP_SITE_KEY
ARG UMI_APP_SSO_CAP_ENDPOINT
ARG UMI_APP_SSO_CAP_WASM_URL
ARG UMI_APP_SSO_CAP_PAKO_URL
ARG UMI_APP_SSO_LOGIN_CREDENTIAL_KID
ARG UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY
ARG UMI_APP_SSO_WELL_KNOWN_URL
ENV UMI_APP_SSO_API_PREFIX=$UMI_APP_SSO_API_PREFIX
ENV UMI_APP_SSO_CLIENT_CODE=$UMI_APP_SSO_CLIENT_CODE
ENV UMI_APP_SSO_CAP_SITE_KEY=$UMI_APP_SSO_CAP_SITE_KEY
ENV UMI_APP_SSO_CAP_ENDPOINT=$UMI_APP_SSO_CAP_ENDPOINT
ENV UMI_APP_SSO_CAP_WASM_URL=$UMI_APP_SSO_CAP_WASM_URL
ENV UMI_APP_SSO_CAP_PAKO_URL=$UMI_APP_SSO_CAP_PAKO_URL
ENV UMI_APP_SSO_LOGIN_CREDENTIAL_KID=$UMI_APP_SSO_LOGIN_CREDENTIAL_KID
ENV UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY=$UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY
ENV UMI_APP_SSO_WELL_KNOWN_URL=$UMI_APP_SSO_WELL_KNOWN_URL
COPY packages/client-subject-projection/ ./packages/client-subject-projection/
COPY packages/custom-sso/ ./packages/custom-sso/
COPY packages/api-core/ ./packages/api-core/
COPY packages/domain/ ./packages/domain/
COPY packages/db/ ./packages/db/
COPY packages/session-kernel/ ./packages/session-kernel/
COPY packages/eslint-config/ ./packages/eslint-config/
COPY packages/contracts/ ./packages/contracts/
COPY apps/sso/ ./apps/sso/
RUN pnpm rebuild && pnpm --filter @iam/sso run setup && pnpm --filter @iam/sso run build

FROM docker.xuanyuan.run/nginx:1.27.5-alpine AS runner
COPY apps/sso/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/sso/dist/ /usr/share/nginx/html/portal/
EXPOSE 80
