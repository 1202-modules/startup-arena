#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SSL_DIR="${ROOT_DIR}/ssl"

mkdir -p "${SSL_DIR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${SSL_DIR}/server.key" \
  -out "${SSL_DIR}/server.crt" \
  -subj "/CN=104.171.139.202/O=PlatypusArena/C=RU" \
  -addext "subjectAltName=IP:104.171.139.202,IP:127.0.0.1,DNS:localhost"

chmod 600 "${SSL_DIR}/server.key"
chmod 644 "${SSL_DIR}/server.crt"

echo "SSL certificate and key generated successfully in ${SSL_DIR}"
