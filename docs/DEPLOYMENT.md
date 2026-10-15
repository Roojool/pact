# PACT Production Deployment Guide (Azure Ubuntu VM & Docker Compose)

This guide documents the production deployment architecture, security invariants, host preparation, and operational lifecycle for **PACT** (*Programmatic Agency Conflict Tracker*).

---

## 1. System Architecture & Port Isolation

PACT deploys as an isolated multi-container topology using standard Docker Compose. The public entrypoint is strictly limited to ports `80` (HTTP) and `443` (HTTPS) via Caddy. All internal databases, application servers, and agent runtimes communicate across a private Docker bridge network without exposing host ports.

```
                              +---------------------------------------+
                              |         Public Internet / Client      |
                              +-------------------+-------------------+
                                                  |
                                                  | Ports :80 / :443 (TLS)
                                                  v
                              +---------------------------------------+
                              |         proxy (Caddy 2 Alpine)        |
                              |   Volumes: caddy-data, caddy-config   |
                              +-------------------+-------------------+
                                                  |
                                                  | Internal HTTP (:3000)
                                                  v
                              +---------------------------------------+
                              |         web (Next.js 16 Standalone)   |
                              |   Node.js 24 Bookworm, non-root user  |
                              +--------+--------------------+---------+
                                       |                    |
        +------------------------------+                    +------------------------------+
        | redis://graph:6379                                | Bearer $PACT_RUNTIME_TOKEN   |
        v                                                   v                              v
+-------------------------------+         +----------------------------+    +----------------------------+
|        graph (FalkorDB)       |         |   agent-account-manager    |    |       agent-producer       |
| Pinned SHA256 digest          |         | Eve runtime (:3010)        |    | Eve runtime (:3011)        |
| Persistent: graph-data volume |         | Volume: am-workflow-data   |    | Vol: producer-workflow-data|
+-------------------------------+         +----------------------------+    +----------------------------+
```

### Network & Port Policy
| Service | Internal Port | Host Port Binding | Authentication / Protection |
| :--- | :--- | :--- | :--- |
| `proxy` (Caddy) | 80, 443 | `80:80`, `443:443` | TLS termination, security headers, rate limiting |
| `web` (PACT App) | 3000 | *None* (Internal only) | HMAC-signed workspace session cookies |
| `graph` (FalkorDB) | 6379 | *None* (Internal only) | Docker bridge network isolation |
| `agent-account-manager` | 3010 | *None* (Internal only) | Shared secret `Authorization: Bearer <token>` |
| `agent-producer` | 3011 | *None* (Internal only) | Shared secret `Authorization: Bearer <token>` |

> [!CAUTION]
> Never map ports `6379`, `3010`, `3011`, or `3000` to `0.0.0.0` in `compose.yaml`. Only ports `80` and `443` on the reverse proxy should be bound to the public host interface.

---

## 2. Secrets Management & Security Invariants

Production secrets must **never** be checked into version control, embedded in Docker images, passed as Docker build arguments, or stored inside the repository tree.

### External Secret Configuration
Store environment variables outside the repository directory at:
```bash
/etc/pact/pact.env
```
Ensure strict filesystem permissions (`0600`) so that only `root` or the designated service user can read the file:
```bash
sudo chmod 600 /etc/pact/pact.env
```

### Required & Optional Variables
| Variable | Required? | Min Length / Default | Description |
| :--- | :---: | :--- | :--- |
| `SESSION_SECRET` | **YES** | 32 characters (hex) | Secret used to sign HMAC-SHA256 session cookies (`pact_workspace`). Unset or short secrets fail closed with HTTP 503. |
| `PACT_RUNTIME_TOKEN` | **YES** | 32 characters (hex) | Shared bearer token for authenticated requests between `web` and the Eve agent runtimes. Unauthenticated calls return HTTP 401. |
| `PACT_DOMAIN` | No | `localhost` | Hostname Caddy serves TLS for (e.g. an Azure `<vm>.<region>.cloudapp.azure.com` name — no domain purchase needed — or a custom FQDN). Caddy provisions a certificate automatically for a resolvable host and redirects HTTP to HTTPS. For direct IP access, set to `:80`. |
| `OPENAI_API_KEY` | No | *Blank* | API key for OpenAI model calls. If left blank, PACT operates in deterministic, graph-grounded offline mode ($0 spend). |
| `OPENAI_MODEL` | No | `gpt-6.1-sol` | Model identifier passed to agent runtimes when live AI is enabled. |
| `PACT_API_BUDGET_USD` | No | `5` | Hard limit on cumulative LLM API spending managed by the persistent FalkorDB budget ledger. |

> [!WARNING]
> **Never run `docker compose config` with real secrets.**  
> Docker Compose prints resolved environment variable values to `stdout`. To validate compose syntax safely, use dummy placeholder variables or the provided deployment scripts.

---

## 3. Host Preparation (Azure Ubuntu VM)

### Recommended Azure Specifications
- **VM Size:** `Standard_B2s` (2 vCPU, 4 GiB RAM) or `Standard_D2s_v5` (2 vCPU, 8 GiB RAM)
- **OS:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- **Disk:** 30+ GiB Premium SSD
- **Azure NSG (Network Security Group) Inbound Rules:**
  - Allow `SSH` (port 22) from administrative IPs
  - Allow `HTTP` (port 80) from `Internet`
  - Allow `HTTPS` (port 443) from `Internet`
  - *Deny all other inbound ports*

### Step 1: Install Host Prerequisites
Clone or copy the source archive to the VM:
```bash
mkdir -p /opt/pact
cd /opt/pact
tar -xzf pact-source.tar.gz --strip-components=1
```

Run the automated host installation script:
```bash
sudo bash scripts/deploy/install.sh
```
The script will:
1. Verify system dependencies (`curl`, `openssl`, `tar`).
2. Verify Docker and the `docker compose` plugin.
3. Create the secure directory `/etc/pact` (mode `0700`).
4. Generate cryptographically strong random secrets for `SESSION_SECRET` and `PACT_RUNTIME_TOKEN` in `/etc/pact/pact.env` (mode `0600`) if not already present.

---

## 4. Launching the Production Stack

### Exact Production Command
Execute deployment using the external secret file:
```bash
docker compose --env-file /etc/pact/pact.env up -d --build
```
Or run the non-destructive deployment script:
```bash
sudo bash scripts/deploy/deploy.sh
```

### Startup Order & Health Sequencing
Compose sequences container startup deterministically using Docker health checks:
1. `graph` starts and waits for `redis-cli PING` to report healthy.
2. `agent-account-manager` and `agent-producer` wait for `graph` to be healthy, boot their Eve runtimes, and report healthy when `GET /eve/v1/health` returns HTTP 200.
3. `web` waits for `graph`, `agent-account-manager`, and `agent-producer` to be healthy before starting. It runs standalone Next.js on `0.0.0.0:3000`. The container health check fetches `GET /api/health` and only reports healthy when the response body parses and `ok` is exactly `true` (i.e. the graph connection is live).
4. `proxy` (Caddy) starts after `web` reports healthy. This avoids serving before the app is ready on a cold start, but it is **not** a zero-downtime guarantee: an update that recreates containers can leave a brief window where the proxy returns `502 Bad Gateway`.

---

## 5. Verification & Health Checks

Caddy terminates TLS and redirects plain HTTP to HTTPS, so probe the HTTPS URL of
the host named by `PACT_DOMAIN` rather than `http://localhost` (a request to port
80 returns a redirect, not the app response). Add `-k` only when testing the
default self-signed `localhost` certificate.

### 1. Health Route Inspection
From the host or reverse proxy:
```bash
curl -fsSk "https://${PACT_DOMAIN:-localhost}/api/health"
```
Expected JSON output:
```json
{
  "status": "ok",
  "ok": true,
  "database": true,
  "graphConnected": true,
  "runtimeReachable": true,
  "amRuntimeReachable": true,
  "producerRuntimeReachable": true,
  "liveAiAvailable": false,
  "transport": "eve",
  "synthetic": true
}
```
*Note: `liveAiAvailable: false` is expected when `OPENAI_API_KEY` is blank. The core graph engine, conflict solver, repair recommendations, and memory recall operate deterministically.*

### 2. Static Asset Verification
Verify that Next.js standalone correctly serves CSS and JS bundles:
```bash
curl -ISk "https://${PACT_DOMAIN:-localhost}/_next/static/css/..."
```
Should return `HTTP/2 200` with appropriate `Content-Type: text/css`.

### 3. Session Signing Verification
Initialize a new session:
```bash
curl -k -c cookies.txt -i "https://${PACT_DOMAIN:-localhost}/api/workspace"
```
Verify that the `Set-Cookie` header sets `pact_workspace=ws_<id>.<signature>` with `HttpOnly`, `SameSite=Lax`, and valid HMAC signature.

---

## 6. Updating PACT

To apply updates while preserving every persistent data volume:
```bash
sudo bash scripts/deploy/update.sh
```
`update.sh` runs `docker compose build`, which rebuilds **all** built service
images (`web` and both agent runtimes), then `docker compose up -d --wait
--wait-timeout 120`. Compose `--wait` blocks until the containers report healthy,
but this is a **recreate, not a zero-downtime rolling update**: expect a brief
interval where the app is unavailable and the proxy can return `502`. Named
volumes (graph data, both workflow-data volumes, Caddy state) are preserved.

> [!IMPORTANT]
> Never run `docker compose down -v` on production. The `-v` flag deletes named Docker volumes, destroying the persistent FalkorDB graph data and agent workflow logs.

---

## 7. Persistent Data & Backup Procedures

### Persistent Volumes
- `graph-data`: Stores FalkorDB RDB snapshots and AOF (Append-Only File) persistence logs at `/var/lib/falkordb/data`.
- `am-workflow-data`: Stores Account Manager Eve workflow states at `/workspace/agents/account-manager/.eve/.workflow-data`.
- `producer-workflow-data`: Stores Producer Eve workflow states at `/workspace/agents/producer/.eve/.workflow-data`.
- `caddy-data`: Stores Let's Encrypt TLS certificates and account keys at `/data`.
- `caddy-config`: Stores Caddy runtime configuration at `/config`.

### Volume Backup Command
```bash
docker run --rm \
  -v pact_graph-data:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar -czf /backup/graph-data-$(date +%Y%m%d%H%M%S).tar.gz -C /data .
```

---

## 8. Remaining Cloud & Live-AI Gaps

1. **Live Model Provider:** `OPENAI_API_KEY` is intentionally unpopulated in default deployments, so live AI is blocked until the operator supplies a key. Container environment variables are fixed when a container is created, so a plain restart does not pick up a new value: add the key to `/etc/pact/pact.env` and **recreate** `web` and both runtimes, for example `docker compose --env-file /etc/pact/pact.env up -d --force-recreate web agent-account-manager agent-producer`. Everything else runs deterministically at $0.
2. **HTTPS via `PACT_DOMAIN`:** Caddy terminates TLS for whatever hostname `PACT_DOMAIN` names and redirects plain HTTP to HTTPS. Set it to the VM's Azure DNS name (for example `pact-vm.eastus.cloudapp.azure.com`), which works **without buying a domain**, or to a custom domain whose A/CNAME record points at the VM's public IP. For raw-IP-only access set `PACT_DOMAIN=:80` (no TLS).
3. **Single-Node Storage:** Volume data is currently pinned to local host storage. For multi-node Azure VM scale sets or high availability, graph persistence should target Azure Managed Disks or a managed FalkorDB cluster.
