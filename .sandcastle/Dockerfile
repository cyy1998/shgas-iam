FROM docker.xuanyuan.run/library/node:24.22.3-bookworm

ARG CODEX_VERSION=0.171.0
ARG POSTGRES_VERSION=18.4-1.pgdg12+1
ARG REDIS_VERSION=6:8.8.0-1rl1~bookworm1
ARG ETCD_VERSION=3.5.11
ARG APISIX_VERSION=3.16.0-0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git ripgrep unzip \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.21.0 @openai/codex@${CODEX_VERSION}
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4" \
    && install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /root/.bun

# Plan X native integration stack (no Docker CLI/Compose; no resident services):
# PostgreSQL 18.4 (PGDG archive), Redis 8.8.0 (official Redis repo),
# Apache APISIX 3.16.0 (official APISIX repo), and etcd 3.5.11 (official release binary).
RUN set -eux; \
    install -m 0755 -d /etc/apt/keyrings /etc/postgresql-common; \
    printf '%s\n' 'create_main_cluster = false' > /etc/postgresql-common/createcluster.conf; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /etc/apt/keyrings/pgdg.asc; \
    curl -fsSL https://packages.redis.io/gpg -o /etc/apt/keyrings/redis.asc; \
    curl -fsSL https://repos.apiseven.com/pubkey.gpg -o /etc/apt/keyrings/apisix.gpg; \
    chmod a+r /etc/apt/keyrings/pgdg.asc /etc/apt/keyrings/redis.asc /etc/apt/keyrings/apisix.gpg; \
    printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/pgdg.asc] https://apt-archive.postgresql.org/pub/repos/apt bookworm-pgdg-archive main' \
        > /etc/apt/sources.list.d/pgdg.list; \
    printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/redis.asc] https://packages.redis.io/deb bookworm main' \
        > /etc/apt/sources.list.d/redis.list; \
    printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/apisix.gpg] https://repos.apiseven.com/packages/debian debian12 main' \
        > /etc/apt/sources.list.d/apisix.list; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        libpq5=${POSTGRES_VERSION} \
        postgresql-client-18=${POSTGRES_VERSION} \
        postgresql-18=${POSTGRES_VERSION} \
        redis-tools=${REDIS_VERSION} \
        redis-server=${REDIS_VERSION} \
        apisix=${APISIX_VERSION}; \
    rm -rf /var/lib/apt/lists/*; \
    ARCH="$(dpkg --print-architecture)"; \
    curl -fsSL "https://github.com/etcd-io/etcd/releases/download/v${ETCD_VERSION}/etcd-v${ETCD_VERSION}-linux-${ARCH}.tar.gz" -o /tmp/etcd.tar.gz; \
    tar -xzf /tmp/etcd.tar.gz -C /tmp --strip-components=1 \
        "etcd-v${ETCD_VERSION}-linux-${ARCH}/etcd" \
        "etcd-v${ETCD_VERSION}-linux-${ARCH}/etcdctl"; \
    install -m 0755 /tmp/etcd /usr/local/bin/etcd; \
    install -m 0755 /tmp/etcdctl /usr/local/bin/etcdctl; \
    rm -f /tmp/etcd.tar.gz /tmp/etcd /tmp/etcdctl; \
    chmod -R a+rX /usr/local/apisix /usr/local/openresty

# Keep /usr/local/bin ahead of /usr/local/openresty/bin so pinned etcdctl 3.5.11 wins.
ENV PATH="/usr/lib/postgresql/18/bin:${PATH}:/usr/local/openresty/luajit/bin:/usr/local/openresty/nginx/sbin:/usr/local/openresty/bin"
RUN printf '%s\n' 'export PATH="/usr/lib/postgresql/18/bin:${PATH}:/usr/local/openresty/luajit/bin:/usr/local/openresty/nginx/sbin:/usr/local/openresty/bin"' \
        > /etc/profile.d/iam-native-stack.sh \
    && chmod 0644 /etc/profile.d/iam-native-stack.sh

ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g ${AGENT_GID} node \
    && usermod -o -u ${AGENT_UID} -g ${AGENT_GID} -d /home/agent -m -l agent node \
    && chown -R ${AGENT_UID}:${AGENT_GID} /home/agent
USER ${AGENT_UID}:${AGENT_GID}
ENV HOME=/home/agent
WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
