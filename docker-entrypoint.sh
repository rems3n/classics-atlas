#!/bin/sh
set -eu
mkdir -p /data
chown node:node /data
exec su node -s /bin/sh -c 'exec node /app/server.cjs'
