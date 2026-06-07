#!/bin/bash
set -e

echo "Running ACE-2026 Health Check..."

# Check frontend
if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "? Frontend is serving"
else
    echo "? Frontend is down"
    exit 1
fi

# Check API health endpoint
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "? API health endpoint is responding"
else
    echo "? API health endpoint is down"
    exit 1
fi

# Check API identity endpoint
if curl -f http://localhost:8080/api/identity > /dev/null 2>&1; then
    echo "? API identity endpoint is responding"
else
    echo "? API identity endpoint is down"
    exit 1
fi

# Check WebGL shaders
if [ -f "public/shaders/mesh.vert" ] && [ -f "public/shaders/mesh.frag" ]; then
    echo "? WebGL shaders exist"
else
    echo "? WebGL shaders missing"
    exit 1
fi

echo "All health checks passed."
exit 0
