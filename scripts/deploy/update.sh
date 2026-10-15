#!/usr/bin/env bash
# ==============================================================================
# PACT Production Update Script (Ubuntu / Docker Compose)
# Performs safe, non-destructive rolling updates preserving persistent data volumes.
# ==============================================================================

set -euo pipefail

ENV_FILE="${PACT_ENV_FILE:-/etc/pact/pact.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================================"
echo " PACT Safe Update"
echo " Working directory: ${APP_DIR}"
echo " Environment file:  ${ENV_FILE}"
echo "========================================================"

# 1. Validate secrets file existence
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[-] Error: Environment file not found at ${ENV_FILE}." >&2
  exit 1
fi

cd "${APP_DIR}"

# 2. Rebuild images with updated code
echo "[+] Building updated images..."
docker compose --env-file "$ENV_FILE" build

# 3. Apply rolling container updates
echo "[+] Applying rolling container recreation..."
docker compose --env-file "$ENV_FILE" up -d --wait --wait-timeout 120

# 4. Verify post-update health
echo "[+] Checking service health post-update..."
docker compose --env-file "$ENV_FILE" ps

echo "========================================================"
echo " PACT containers updated. Verify public HTTPS before publishing."
echo "========================================================"
