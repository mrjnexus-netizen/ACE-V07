#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo "Starting ACE-2026 backup..."

# PostgreSQL dump
pg_dump "$DATABASE_URL" > "$BACKUP_DIR/database.sql.gz"

# Redis backup (AOF)
cp ./data/redis/appendonly.aof "$BACKUP_DIR/redis_backup.aof"

# S3 media sync (if AWS CLI configured)
if command -v aws &> /dev/null; then
    aws s3 sync "s3://$AWS_S3_BUCKET_NAME" "$BACKUP_DIR/s3_media"
fi

echo "Backup completed at $BACKUP_DIR"
