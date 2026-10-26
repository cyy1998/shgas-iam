ARG APISIX_IMAGE=docker.xuanyuan.run/apache/apisix:3.16.0-debian
FROM ${APISIX_IMAGE}
COPY e2e/system/test-assets/apisix.yaml /usr/local/apisix/conf/config.yaml
