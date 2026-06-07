#!/bin/bash
set -e
BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: restore.sh <backup_directory>"
    exit 1
fi

echo "Restoring ACE-2026 from $BACKUP_DIR..."

# Restore PostgreSQL
gunzip -c "$BACKUP_DIR/database.sql.gz" | psql "$DATABASE_URL"

# Restore Redis (AOF)
cp "$BACKUP_DIR/redis_backup.aof" ./data/redis/appendonly.aof

# Restore S3 media (if AWS CLI configured)
if command -v aws &> /dev/null; then
    aws s3 sync "$BACKUP_DIR/s3_media" "s3://$AWS_S3_BUCKET_NAME"
fi

echo "Restore completed."
