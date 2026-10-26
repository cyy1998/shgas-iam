FROM docker.xuanyuan.run/apache/apisix:3.16.0-debian
ARG APISIX_CONFIG=apisix.publication.config.yaml
COPY ${APISIX_CONFIG} /usr/local/apisix/conf/config.yaml
