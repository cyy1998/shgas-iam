FROM docker.xuanyuan.run/node:24.18.0-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"
ENV NPM_CONFIG_REGISTRY="https://registry.npmmirror.com"
ENV npm_config_registry="https://registry.npmmirror.com"
ENV HUSKY=0

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

WORKDIR /workspace
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY e2e/system/package.json ./e2e/system/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
RUN --mount=type=cache,id=iam-e2e-pnpm-v11,target=/pnpm/store \
    pnpm install --filter @iam/db... --frozen-lockfile --ignore-scripts

COPY packages/db ./packages/db

CMD ["pnpm", "--filter", "@iam/db", "db:migrate"]
