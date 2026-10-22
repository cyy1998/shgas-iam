ARG APISIX_IMAGE=docker.xuanyuan.run/apache/apisix:3.16.0-debian
FROM ${APISIX_IMAGE}
COPY docker/apisix/config.dev.yaml /usr/local/apisix/conf/config.yaml
