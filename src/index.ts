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
import push from './api/push'
import state from './api/state'
import nodes from './api/nodes'

interface Env {
  DB: D1Database
  API_KEY?: string
  ASSETS: Fetcher
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
 * Scheduled Worker entry point.
 * Triggered weekly by Cloudflare Cron Trigger to clean device_log.
 * Does NOT delete nodes (nodes only deletable via DELETE API).
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
}

export default app
