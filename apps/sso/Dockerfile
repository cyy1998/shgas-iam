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
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

FROM base AS deps
WORKDIR /app
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/sso/package.json ./apps/sso/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
RUN pnpm install --frozen-lockfile --ignore-scripts

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
COPY packages/contracts/ ./packages/contracts/
COPY apps/sso/ ./apps/sso/
RUN pnpm rebuild && pnpm --filter @iam/sso run setup && pnpm --filter @iam/sso run build

FROM docker.xuanyuan.run/nginx:1.27-alpine AS runner
COPY apps/sso/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/sso/dist/ /usr/share/nginx/html/portal/
EXPOSE 80
