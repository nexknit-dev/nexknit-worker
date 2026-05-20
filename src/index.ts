/**
 * Nexknit Worker â€?Entry point.
 * Assembles middleware, API routes, and static assets.
 */

import { Hono } from 'hono'
import { serveAssets } from './middleware/assets'
import push from './api/push'
import state from './api/state'
import nodes from './api/nodes'

interface Env {
  DB: D1Database
  API_KEY?: string
  ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

// 1. Serve static assets (frontend)
app.use('*', serveAssets)

// 2. API routes
app.route('/api', push)
app.route('/api', state)
app.route('/api', nodes)

// 3. 404 fallback
app.notFound((c) => c.json({ error: 'not found' }, 404))

export default app