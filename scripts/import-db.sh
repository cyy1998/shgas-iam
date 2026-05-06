#!/usr/bin/env bash
# 将 SQL 备份文件导入 docker-db-1 容器的 iam_db 数据库
set -euo pipefail

SQL_FILE="${1:-scripts/iam_backup20260430.sql}"
CONTAINER="docker-db-mysql-1"
DB="iam_db"
ROOT_PASSWORD="root"

if [ ! -f "$SQL_FILE" ]; then
  echo "错误：找不到文件 $SQL_FILE"
  exit 1
fi

echo ">>> 拷贝 $SQL_FILE 到容器 $CONTAINER ..."
docker cp "$SQL_FILE" "$CONTAINER:/tmp/import_backup.sql"

echo ">>> 开始导入到数据库 $DB ..."
docker exec -i "$CONTAINER" \
  mysql -uroot -p"$ROOT_PASSWORD" "$DB" -e "SOURCE /tmp/import_backup.sql;"

echo ">>> 清理临时文件 ..."
docker exec "$CONTAINER" rm -f /tmp/import_backup.sql

echo ">>> 导入完成！"
