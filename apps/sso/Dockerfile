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
# pnpm reads patchedDependencies before --prod; this is build metadata, not a runtime dependency.
COPY patches/ ./patches/
COPY .husky/install.mjs ./.husky/install.mjs
COPY packages/client-subject-projection/package.json ./packages/client-subject-projection/
COPY packages/custom-sso/package.json ./packages/custom-sso/
COPY packages/subject-access/package.json ./packages/subject-access/
COPY packages/unit-of-work/package.json ./packages/unit-of-work/
COPY packages/client-snapshot/package.json ./packages/client-snapshot/
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/test-support/package.json ./packages/test-support/
COPY packages/domain/package.json ./packages/domain/
COPY packages/delegation/package.json ./packages/delegation/
COPY packages/db/package.json ./packages/db/
COPY packages/session-kernel/package.json ./packages/session-kernel/
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
ARG IAM_SSO_WEB_API_PREFIX
ARG IAM_SSO_WEB_CLIENT_CODE
ARG IAM_SSO_WEB_CAP_SITE_KEY
ARG IAM_SSO_WEB_CAP_ENDPOINT
ARG IAM_SSO_WEB_CAP_WASM_URL
ARG IAM_SSO_WEB_CAP_PAKO_URL
ARG IAM_SSO_WEB_LOGIN_CREDENTIAL_KID
ARG IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY
ARG IAM_SSO_WEB_WELL_KNOWN_URL
ENV IAM_SSO_WEB_API_PREFIX=$IAM_SSO_WEB_API_PREFIX
ENV IAM_SSO_WEB_CLIENT_CODE=$IAM_SSO_WEB_CLIENT_CODE
ENV IAM_SSO_WEB_CAP_SITE_KEY=$IAM_SSO_WEB_CAP_SITE_KEY
ENV IAM_SSO_WEB_CAP_ENDPOINT=$IAM_SSO_WEB_CAP_ENDPOINT
ENV IAM_SSO_WEB_CAP_WASM_URL=$IAM_SSO_WEB_CAP_WASM_URL
ENV IAM_SSO_WEB_CAP_PAKO_URL=$IAM_SSO_WEB_CAP_PAKO_URL
ENV IAM_SSO_WEB_LOGIN_CREDENTIAL_KID=$IAM_SSO_WEB_LOGIN_CREDENTIAL_KID
ENV IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY=$IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY
ENV IAM_SSO_WEB_WELL_KNOWN_URL=$IAM_SSO_WEB_WELL_KNOWN_URL
COPY packages/client-subject-projection/ ./packages/client-subject-projection/
COPY packages/custom-sso/ ./packages/custom-sso/
COPY packages/subject-access/ ./packages/subject-access/
COPY packages/unit-of-work/ ./packages/unit-of-work/
COPY packages/client-snapshot/ ./packages/client-snapshot/
COPY packages/runtime/ ./packages/runtime/
COPY packages/domain/ ./packages/domain/
COPY packages/delegation/ ./packages/delegation/
COPY packages/db/ ./packages/db/
COPY packages/session-kernel/ ./packages/session-kernel/
COPY packages/contracts/ ./packages/contracts/
COPY apps/sso/ ./apps/sso/
RUN pnpm rebuild && pnpm --filter @iam/sso run build

FROM docker.xuanyuan.run/nginx:1.27.5-alpine AS runtime
COPY apps/sso/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/sso/dist/ /usr/share/nginx/html/portal/
EXPOSE 80

FROM runtime AS e2e
COPY e2e/system/docker/rp-terminal.html /usr/share/nginx/html/portal/e2e-rp.html

# Production remains the default target.
FROM runtime AS runner
