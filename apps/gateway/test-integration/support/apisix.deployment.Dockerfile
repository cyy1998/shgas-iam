FROM docker.xuanyuan.run/apache/apisix:3.16.0-debian
ARG APISIX_CONFIG=config.dev.yaml
COPY docker/apisix/${APISIX_CONFIG} /usr/local/apisix/conf/config.yaml
