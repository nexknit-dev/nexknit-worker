/**
 * NexKnit Worker — Entry point.
 * Assembles middleware, API routes, static assets, and database initialization.
 * 
 * Transparent mode: each node keeps only ONE latest payload record.
 * Weekly cleanup via Cloudflare Scheduled Trigger.
 */

import { Hono } from 'hono'
import { serveAssets } from './middleware/assets'
import { clearAllDeviceLogs } from './dao/cleanup'
import { getOfflineNodes } from './dao/nodes'
import push from './api/push'
import state from './api/state'
import nodes from './api/nodes'

interface Env {
  DB: D1Database
  API_KEY?: string
  ASSETS: Fetcher
  OFFLINE_THRESHOLD_MS?: string
  NOTIFICATION_EMAIL?: string
  MAIL_FROM?: string
  sendEmail?: (message: { from: string; to: string; subject: string; text: string }) => Promise<void>
}

const app = new Hono<{ Bindings: Env }>()

/**
 * Initialize database schema.
 * - nodes: registry of all nodes (never auto-deleted)
 * - device_log: transparent mode (node_name as PRIMARY KEY, one record per node)
 */
async function initializeDatabase(DB: D1Database): Promise<void> {
  const { results } = await DB.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('nodes', 'device_log')
  `).all<{ name: string }>()

  const existingTables = new Set(results.map(r => r.name))

  if (!existingTables.has('nodes')) {
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS nodes (
        node_name TEXT PRIMARY KEY,
        updated_at INTEGER DEFAULT (unixepoch() * 1000)
      )
    `).run()
  }

  if (!existingTables.has('device_log')) {
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS device_log (
        node_name TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()
  }
}

// 1. Database initialization (runs on first request after cold start)
app.use('*', async (c, next) => {
  await initializeDatabase(c.env.DB)
  await next()
})

// 2. Serve static assets (frontend)
app.use('*', serveAssets)

// 3. API routes
app.route('/api', push)
app.route('/api', state)
app.route('/api', nodes)

// 4. 404 fallback
app.notFound((c) => c.json({ error: 'not found' }, 404))

/**
 * Send email notification for offline nodes.
 * Uses Cloudflare Workers Email Routing.
 */
async function sendOfflineNotification(
  env: Env,
  offlineNodes: Array<{ node_name: string; updated_at: number; offline_duration_ms: number }>
): Promise<void> {
  const { NOTIFICATION_EMAIL, MAIL_FROM } = env

  if (!NOTIFICATION_EMAIL || !MAIL_FROM) {
    console.log('[Notification] Email not configured, skipping notification')
    return
  }

  if (offlineNodes.length === 0) {
    return
  }

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  const nodeList = offlineNodes
    .map(n => `  - ${n.node_name}: offline for ${formatDuration(n.offline_duration_ms)} (last seen: ${new Date(n.updated_at).toISOString()})`)
    .join('\n')

  const subject = `⚠️ Nexknit Alert: ${offlineNodes.length} node${offlineNodes.length > 1 ? 's' : ''} offline`
  const body = `Nexknit Worker Notification

The following nodes have been offline for longer than the configured threshold:

${nodeList}

---
Sent by Nexknit Worker
`

  try {
    await env.sendEmail?.({
      from: MAIL_FROM,
      to: NOTIFICATION_EMAIL,
      subject,
      text: body,
    })
    console.log(`[Notification] Email sent to ${NOTIFICATION_EMAIL} for ${offlineNodes.length} offline node(s)`)
  } catch (err) {
    console.error('[Notification] Failed to send email:', err)
  }
}

/**
 * Scheduled Worker entry point.
 * Triggered weekly by Cloudflare Cron Trigger to clean device_log.
 * Also checks for offline nodes and sends email notification.
 */
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  console.log('[Scheduled] Weekly cleanup triggered at', new Date(event.scheduledTime).toISOString())

  try {
    await initializeDatabase(env.DB)
    const result = await clearAllDeviceLogs(env.DB)
    console.log(`[Scheduled] Cleanup complete: deleted=${result.deletedCount}, nodes_preserved=${result.remainingNodes}`)
  } catch (err) {
    console.error('[Scheduled] Cleanup failed:', err)
  }

  // Check for offline nodes and send notification
  const thresholdMs = parseInt(env.OFFLINE_THRESHOLD_MS || '1800000', 10)
  if (thresholdMs > 0 && env.NOTIFICATION_EMAIL && env.MAIL_FROM) {
    try {
      const offlineNodes = await getOfflineNodes(env.DB, thresholdMs)
      if (offlineNodes.length > 0) {
        console.log(`[Scheduled] Found ${offlineNodes.length} offline node(s)`, offlineNodes)
        await sendOfflineNotification(env, offlineNodes)
      } else {
        console.log('[Scheduled] No offline nodes detected')
      }
    } catch (err) {
      console.error('[Scheduled] Offline check failed:', err)
    }
  }
}

export default app
