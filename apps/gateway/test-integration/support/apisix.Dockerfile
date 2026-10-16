FROM docker.xuanyuan.run/apache/apisix:3.16.0-debian
COPY apisix.config.yaml /usr/local/apisix/conf/config.yaml
