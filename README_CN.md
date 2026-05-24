# Nexknit —— 免费自托管个人节点集群仪表盘

> 无需 VPS、无需 Hub、无需公网 IP，全天候高可用监控。
> 三分钟部署，并立刻在浏览器中查看数据。
> 零运维，零依赖，零外部攻击面。

---

**需要在公网查看内网的数值、状态或者日志？**
**觉得配置麻烦，或者害怕污染开发环境？**
**担心引入安全风险、破坏现有网络，或者干脆无法开放任何设备？**

## [Nexknit](https://github.com/nexknit-dev/nexknit-gateway) — 在这里查看我的回答

# Nexknit Worker —— 云端数据接收服务

> 接收数据，存储数据，响应查询。仅此而已。
> 零入站监听，零主动出站，零日志留存。

---

### 这是什么？

Nexknit Worker 是 nexknit 监控系统的云端组件。它是一个部署在 Cloudflare Workers 上的轻量级服务，负责：

- **接收网关推送**：网关每 5 秒向 `/api/push` 发送一次 POST 请求，携带节点状态数据
- **存储到 D1**：Worker 将 payload 原样写入 D1 数据库，不做任何解析
- **响应前端查询**：前端仪表盘轮询 `/api/state` 和 `/api/nodes`，Worker 从 D1 读取最新数据并返回

Worker 本身不主动发起任何网络连接，不监听任何端口，不存储任何日志。它是一个被动的"邮筒"——数据从网关进来，等着前端来取。

---

### 🛡️ 安全模型

Worker 只响应经过 API Key 认证的请求。所有写操作（`/api/push`）和读操作（`/api/state`、`/api/nodes`）都需要在请求头中携带 `X-Nexknit-Key`，与部署时设置的 `API_KEY` 环境变量匹配。

未经认证的请求会收到 `401 Unauthorized`。Worker 本身不暴露任何公网端口，不主动连接任何外部服务，攻击面为零。

---

### 📡 API 端点

#### `POST /api/push`

接收网关推送的数据。

**请求头**：
```
Content-Type: application/json
X-Nexknit-Key: <你的 API Key>
```

**请求体**：
```json
{
  "n": "节点名称",
  "t": 1779077834305,
  "p": {
    "批次UID": {
      "Index": { "指标名": [[时间戳, 数值], ...] },
      "Trend": { "指标名": [[时间戳, 数值], ...] },
      "Status": { "指标名": [[时间戳, 状态值], ...] },
      "Log": { "指标名": [[时间戳, 日志内容], ...] }
    }
  }
}
```

**响应**：
- `201 Created` — 数据写入成功
- `400 Bad Request` — 缺少必填字段 `n`
- `401 Unauthorized` — API Key 无效

---

#### `GET /api/state?node=<节点名>`

获取指定节点的最新状态。

**请求头**：
```
X-Nexknit-Key: <你的 API Key>
```

**响应**：
```json
{
  "id": 1779077834305,
  "payload": {
    "n": "节点名称",
    "t": 1779077834305,
    "p": { ... }
  }
}
```

- `200 OK` — 返回最新数据
- `404 Not Found` — 节点不存在

---

#### `GET /api/nodes`

获取所有已注册节点的列表。

**请求头**：
```
X-Nexknit-Key: <你的 API Key>
```

**响应**：
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

删除指定节点及其所有历史数据。

**请求头**：
```
X-Nexknit-Key: <你的 API Key>
```

**响应**：
- `200 OK` — 删除成功
- `404 Not Found` — 节点不存在

---

### ⚡ 手动部署

如果一键部署按钮失效，你可以手动部署 Worker：

**前置要求**：Node.js 22.x+，一个 Cloudflare 账户。

```bash
git clone https://github.com/nexknit-dev/nexknit-worker
cd nexknit-worker
npm install
npx wrangler deploy
```

部署完成后，设置 API Key：

```bash
npx wrangler secret put API_KEY
```

按照提示输入你的密钥，Worker 会自动读取这个环境变量作为认证凭证。

---

### 🗄️ 数据库设计

Worker 使用 Cloudflare D1（基于 SQLite）存储数据。数据库只维护两张核心表，采用纯透传模式——不保留历史快照，只存储每个节点的最新状态。

**`nodes` 表**：

```sql
CREATE TABLE IF NOT EXISTS nodes (
    node_name TEXT PRIMARY KEY,
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
);
```

记录所有已注册的节点。当网关推送数据时，Worker 会自动注册或更新节点的最后活跃时间。

**`device_log` 表**：

```sql
CREATE TABLE IF NOT EXISTS device_log (
    node_name TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

每个节点只保留**一条**记录，存储该节点最新一次推送的完整 payload JSON 字符串。网关每次推送时通过 `UPSERT` 覆盖旧记录，不产生写入次数膨胀。

---

### 📊 数据生命周期与容量

**透传模式**：Worker 不存储历史快照。这不是功能缺陷，而是面向免费额度设计的主动选择——任何形式的历史数据清理都会消耗额外的 D1 写入额度，从而侵蚀我们承诺的 120 节点工时。

**容量评估**：在 D1 免费计划 500MB 存储上限下，即使每个节点的 payload 达到 5KB（正常运维场景下通常为 1-2KB），5 个全天候节点的总存储量也不超过 25KB，距离上限有 4 个数量级的余量。

**兜底策略**：Worker 配置了每周自动清空的 Cron Trigger（每周日 00:00 UTC），作为防止极端情况下数据异常的最终兜底。节点重新上线时会自动重新注册并推送最新状态，无需担心数据丢失。

---

### 🏛️ 架构

Worker 的代码结构遵循单一职责原则：

```
src/
├── index.ts          # 入口，组装路由和中间件，包含 scheduled 定时任务
├── api/
│   ├── push.ts       # POST /api/push
│   ├── state.ts      # GET /api/state
│   └── nodes.ts      # GET /api/nodes, DELETE /api/nodes/:name
├── dao/
│   ├── deviceLog.ts  # device_log 表的 CRUD（upsert 模式）
│   ├── nodes.ts      # nodes 表的 CRUD
│   └── cleanup.ts    # 数据库清理工具函数
├── middleware/
│   ├── auth.ts       # API Key 鉴权中间件
│   └── assets.ts     # 静态资源服务（与前端同源部署时使用）
```

Worker 不做任何数据解析。它只做三件事：存、取、认证。

---

### ⏰ 定时任务

Worker 配置了每周清理的 Cron Trigger：

```toml
[triggers]
crons = ["0 0 * * 0"]  # 每周日 00:00 UTC
```

定时任务只清理 `device_log` 表，**不会**删除 `nodes` 表中的节点注册信息。节点只能通过 `DELETE /api/nodes/:nodeName` API 删除。

---

### 📜 开源协议与贡献

**相关仓库**：
- [Nexknit Gateway](https://github.com/nexknit-dev/nexknit-gateway) — Python 网关，采集并推送数据
- [Nexknit Frontend](https://github.com/nexknit-dev/nexknit-frontend) — Vue 3 仪表盘前端