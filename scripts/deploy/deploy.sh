#!/usr/bin/env bash
# ==============================================================================
# PACT Production Deployment Script (Ubuntu / Docker Compose)
# Builds and starts FalkorDB + Eve Roles + Next.js Web + Caddy Reverse Proxy.
# SAFE & NON-DESTRUCTIVE: Preserves persistent graph and workflow volumes.
# ==============================================================================

set -euo pipefail

ENV_FILE="${PACT_ENV_FILE:-/etc/pact/pact.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================================"
echo " PACT Deployment Launch"
echo " Working directory: ${APP_DIR}"
echo " Environment file:  ${ENV_FILE}"
echo "========================================================"

# 1. Validate secrets file existence
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[-] Error: Environment file not found at ${ENV_FILE}." >&2
  echo "    Please run install.sh first or provide PACT_ENV_FILE=/path/to/pact.env." >&2
  exit 1
fi

# 2. Check required secrets without printing their values
SESSION_SECRET_VAL=$(grep -E "^SESSION_SECRET=" "$ENV_FILE" | cut -d= -f2- | tr -d ' "\r\n' || true)
PACT_RUNTIME_TOKEN_VAL=$(grep -E "^PACT_RUNTIME_TOKEN=" "$ENV_FILE" | cut -d= -f2- | tr -d ' "\r\n' || true)

if [[ -z "$SESSION_SECRET_VAL" ]] || [[ ${#SESSION_SECRET_VAL} -lt 32 ]]; then
  echo "[-] Error: SESSION_SECRET is missing or less than 32 characters in ${ENV_FILE}." >&2
  echo "    Generate a 32-byte secret: openssl rand -hex 32" >&2
  exit 1
fi

if [[ -z "$PACT_RUNTIME_TOKEN_VAL" ]]; then
  echo "[-] Error: PACT_RUNTIME_TOKEN is missing or empty in ${ENV_FILE}." >&2
  echo "    Generate a runtime token: openssl rand -hex 32" >&2
  exit 1
fi

echo "[✓] Configuration verified (required secrets present and formatted)."

# 3. Verify Compose configuration files
if [[ ! -f "${APP_DIR}/compose.yaml" ]] || [[ ! -f "${APP_DIR}/Caddyfile" ]]; then
  echo "[-] Error: compose.yaml or Caddyfile not found in ${APP_DIR}." >&2
  exit 1
fi

# 4. Build and start containers
echo "[+] Launching services via Docker Compose..."
cd "${APP_DIR}"

# Note: Never run 'docker compose config' with real secrets in CI/logs.
# We launch directly with --env-file.
docker compose --env-file "$ENV_FILE" up -d --build --wait --wait-timeout 120

echo "========================================================"
echo " PACT containers ready. Verify public HTTPS before publishing."
echo " Service Status Summary:"
docker compose --env-file "$ENV_FILE" ps
echo "--------------------------------------------------------"
echo " Public Ports: 80 / 443 (Caddy Reverse Proxy)"
echo " Protected Internal: FalkorDB (:6379), Eve Roles (:3010, :3011), Next (:3000)"
echo " Logs command: docker compose --env-file ${ENV_FILE} logs -f"
echo "========================================================"
