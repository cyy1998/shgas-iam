FROM docker.xuanyuan.run/library/node:24.18.0-bookworm

ARG CODEX_VERSION=0.154.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gh ripgrep unzip postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.5.1 @openai/codex@${CODEX_VERSION}
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" \
    && install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun

ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g ${AGENT_GID} node \
    && usermod -o -u ${AGENT_UID} -g ${AGENT_GID} -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}
ENV HOME=/home/agent
WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
