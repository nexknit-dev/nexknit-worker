/**
 * GET /api/nodes â€?list all registered nodes
 * DELETE /api/nodes/:nodeName â€?delete a node and its logs
 */

import { Hono } from 'hono'
import { requireApiKey } from '../middleware/auth'
import { getAllNodes, deleteNode, nodeExists } from '../dao/nodes'
import { deleteDeviceLogsByNode } from '../dao/deviceLog'

const nodes = new Hono()

// List all nodes with last report time
nodes.get('/nodes', requireApiKey, async (c) => {
  const db = (c.env as { DB: D1Database }).DB
  const rows = await getAllNodes(db)

  return c.json({
    count: rows.length,
    nodes: rows.map((row: { node_name: string; updated_at: number }) => ({
      node_name: row.node_name,
      last_report_time: row.updated_at,
      last_report_time_iso: new Date(row.updated_at).toISOString()
    }))
  })
})

// Delete a node and all its logs
nodes.delete('/nodes/:nodeName', requireApiKey, async (c) => {
  const db = (c.env as { DB: D1Database }).DB
  const nodeName = c.req.param('nodeName') || 'unknown'

  const exists = await nodeExists(db, nodeName)
  if (!exists) {
    return c.json({ error: `node '${nodeName}' not found` }, 404)
  }

  // Delete logs first, then node registration
  await deleteDeviceLogsByNode(db, nodeName)
  await deleteNode(db, nodeName)

  return c.json({
    ok: true,
    message: `node '${nodeName}' and its logs have been deleted`
  })
})

export default nodes