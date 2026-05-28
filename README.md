# Nexknit — Free Self-Hosted Personal Node Cluster Dashboard

[中文文档](README_CN.md) | English

> No VPS required, no Hub required, no public IP required. 24/7 high-availability monitoring.
> Deploy in three minutes and view data instantly in your browser.
> Zero maintenance, zero dependencies, zero external attack surface.

---

**Need to view internal network metrics, status, or logs from the public internet?**
**Find configuration complicated or fear contaminating your development environment?**
**Worried about introducing security risks, disrupting existing networks, or simply unable to open any devices?**

## [Nexknit](https://github.com/nexknit-dev/nexknit-gateway) — See my answers here

# Nexknit Worker - Cloud Data Receiver Service

> Receive data, store data, respond to queries. Nothing more.
> Zero inbound listening, zero outbound connections, zero log retention.

---

### What is this?

Nexknit Worker is the cloud component of the nexknit monitoring system. It is a lightweight service deployed on Cloudflare Workers, responsible for:

- **Receiving gateway pushes**: The gateway sends POST requests to `/api/push` every 5 seconds, carrying node status data
- **Storing to D1**: Worker writes the payload as-is to the D1 database without any parsing
- **Responding to frontend queries**: The frontend dashboard polls `/api/state` and `/api/nodes`, and Worker reads the latest data from D1 and returns it

The Worker itself does not initiate any network connections, listen on any ports, or store any logs. It is a passive "mailbox" — data comes in from the gateway and waits for the frontend to retrieve it.

---

### 🛡️ Security Model

Worker only responds to requests authenticated with an API Key. All write operations (`/api/push`) and read operations (`/api/state`, `/api/nodes`) require the `X-Nexknit-Key` header matching the `API_KEY` environment variable set during deployment.

Unauthenticated requests receive `401 Unauthorized`. The Worker itself exposes no public ports and does not actively connect to any external services, resulting in zero attack surface.

---

### 📡 API Endpoints

#### `POST /api/push`

Receive data pushed from the gateway.

**Request Headers**:
```
Content-Type: application/json
X-Nexknit-Key: <your API Key>
```

**Request Body**:
```json
{
  "n": "Node Name",
  "t": 1779077834305,
  "p": {
    "batchUID": {
      "Index": { "metricName": [[timestamp, value], ...] },
      "Trend": { "metricName": [[timestamp, value], ...] },
      "Status": { "metricName": [[timestamp, statusValue], ...] },
      "Log": { "metricName": [[timestamp, logContent], ...] }
    }
  }
}
```

**Responses**:
- `201 Created` — Data written successfully
- `400 Bad Request` — Missing required field `n`
- `401 Unauthorized` — Invalid API Key

---

#### `GET /api/state?node=<nodeName>`

Get the latest state for a specified node.

**Request Headers**:
```
X-Nexknit-Key: <your API Key>
```

**Response**:
```json
{
  "id": 1779077834305,
  "payload": {
    "n": "Node Name",
    "t": 1779077834305,
    "p": { ... }
  }
}
```

- `200 OK` — Returns latest data
- `404 Not Found` — Node does not exist

---

#### `GET /api/nodes`

Get a list of all registered nodes.

**Request Headers**:
```
X-Nexknit-Key: <your API Key>
```

**Response**:
```json
{
  "count": 2,
  "nodes": [
    {
      "node_name": "AI-Training-01",
      "last_report_time": 1779077834305,
      "last_report_time_iso": "2026-05-15T12:17:14.305Z"
    }
  ]
}
```

---

#### `DELETE /api/nodes/:nodeName`

Delete a specified node and all its data.

**Request Headers**:
```
X-Nexknit-Key: <your API Key>
```

**Responses**:
- `200 OK` — Deletion successful
- `404 Not Found` — Node does not exist

---

### ⚡ Manual Deployment

If the one-click deploy button fails, you can deploy the Worker manually:

**Prerequisites**: Node.js 22.x+, a Cloudflare account.

```bash
git clone https://github.com/nexknit-dev/nexknit-worker
cd nexknit-worker
npm install
npx wrangler deploy
```

After deployment, set the API Key:

```bash
npx wrangler secret put API_KEY
```

Follow the prompts to enter your secret key. The Worker will automatically read this environment variable as the authentication credential.

---

### 🗄️ Database Design

Worker uses Cloudflare D1 (SQLite-based) for data storage. The database maintains only two core tables, using a pure pass-through mode — no historical snapshots are retained, only the latest state for each node is stored.

**`nodes` table**:

```sql
CREATE TABLE IF NOT EXISTS nodes (
    node_name TEXT PRIMARY KEY,
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
);
```

Records all registered nodes. When the gateway pushes data, Worker automatically registers or updates the node's last active time.

**`device_log` table**:

```sql
CREATE TABLE IF NOT EXISTS device_log (
    node_name TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

Each node maintains only **one** record, storing the complete payload JSON string from the node's latest push. The gateway uses `UPSERT` to overwrite old records on each push, preventing write count inflation.

---

### 📊 Data Lifecycle & Capacity

**Pass-through Mode**: Worker does not store historical snapshots. This is not a limitation but an intentional design choice for the free tier — any form of historical data cleanup would consume additional D1 write credits, reducing our promised 120 node-hours.

**Capacity Assessment**: Under D1's free plan 500MB storage limit, even if each node's payload reaches 5KB (typically 1-2KB in normal operations), the total storage for 5 24/7 nodes would not exceed 25KB — four orders of magnitude below the limit.

**Safety Net**: Worker is configured with a weekly auto-purge Cron Trigger as a final safeguard against extreme data anomalies. Nodes automatically re-register and push their latest state when they come back online, so there's no need to worry about data loss.

---

### 🏛️ Architecture

Worker's code structure follows the single responsibility principle:

```
src/
├── index.ts          # Entry point, assembles routes and middleware, includes scheduled tasks
├── api/
│   ├── push.ts       # POST /api/push
│   ├── state.ts      # GET /api/state
│   └── nodes.ts      # GET /api/nodes, DELETE /api/nodes/:name
├── dao/
│   ├── deviceLog.ts  # CRUD for device_log table (upsert mode)
│   ├── nodes.ts      # CRUD for nodes table
│   └── cleanup.ts    # Database cleanup utilities
├── middleware/
│   ├── auth.ts       # API Key authentication middleware
│   └── assets.ts     # Static asset serving (used when co-deployed with frontend)
```

Worker does not parse any data. It only does three things: store, retrieve, and authenticate.

---

### ⏰ Scheduled Tasks

Worker is configured with a weekly cleanup Cron Trigger:

```toml
[triggers]
crons = ["0 0 * * 0"]  # Every Sunday at 00:00 UTC
```

The scheduled task only cleans the `device_log` table and **does not** delete node registration information from the `nodes` table. Nodes can only be deleted via the `DELETE /api/nodes/:nodeName` API.

---

### 📜 License & Contribution

**Related Repositories**:
- [Nexknit Gateway](https://github.com/nexknit-dev/nexknit-gateway) — Python gateway for data collection and pushing
- [Nexknit Frontend](https://github.com/nexknit-dev/nexknit-frontend) — Vue 3 dashboard frontend