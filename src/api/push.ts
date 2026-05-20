/**
 * POST /api/push
 * Receives a payload from the gateway and stores it.
 */

import { Hono } from 'hono'
import { requireApiKey } from '../middleware/auth'
import { upsertNode } from '../dao/nodes'
import { insertDeviceLog } from '../dao/deviceLog'

const push = new Hono()

push.post('/push', requireApiKey, async (c) => {
  const db = (c.env as { DB: D1Database }).DB
  const body = await c.req.json()
  const { n, t, p } = body

  if (!n) {
    return c.json({ error: 'missing node name (n)' }, 400)
  }

  // Update node registry (heartbeat)
  await upsertNode(db, n)

  // Store payload as opaque JSON
  await insertDeviceLog(db, n, { n, t, p })

  return c.json({ ok: true, node: n }, 201)
})

export default push