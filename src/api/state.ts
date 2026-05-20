/**
 * GET /api/state
 * Returns the latest payload for a given node.
 */

import { Hono } from 'hono'
import { requireApiKey } from '../middleware/auth'
import { nodeExists } from '../dao/nodes'
import { getLatestPayload } from '../dao/deviceLog'

const state = new Hono()

state.get('/state', requireApiKey, async (c) => {
  const db = (c.env as { DB: D1Database }).DB
  const node = c.req.query('node') || 'Bridge_Dev_PC'

  // Check if node exists
  const exists = await nodeExists(db, node)
  if (!exists) {
    return c.json({ error: `node '${node}' not found` }, 404)
  }

  const row = await getLatestPayload(db, node)
  if (!row) {
    return c.json({ id: null, payload: null })
  }

  return c.json({
    id: row.id,
    payload: JSON.parse(row.payload)
  })
})

export default state