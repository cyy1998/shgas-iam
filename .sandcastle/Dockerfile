FROM docker.xuanyuan.run/library/node:24.18.0-bookworm

ARG CODEX_VERSION=0.154.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gh ripgrep unzip postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.5.1 @openai/codex@${CODEX_VERSION}
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" \
    && install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun

# Keep this version aligned with pnpm-lock.yaml; smoke launches the workspace version.
ARG PLAYWRIGHT_VERSION=1.61.1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && chmod -R a+rX /opt/ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Client tools only: the sandbox connects to the host daemon through its dedicated socket.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable' \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin docker-compose-plugin \
    && npm install -g playwright@${PLAYWRIGHT_VERSION} \
    && rm -rf /var/lib/apt/lists/*

ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g ${AGENT_GID} node \
    && usermod -o -u ${AGENT_UID} -g ${AGENT_GID} -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}
ENV HOME=/home/agent
WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
