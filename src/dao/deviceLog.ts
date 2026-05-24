/**
 * DAO for device_log table.
 * Responsibilities: pure SQL operations on device_log.
 * Does NOT touch request context, does NOT parse payload.
 * 
 * Transparent mode: each node keeps only ONE latest record (upsert).
 */

import { D1Database } from '@cloudflare/workers-types'

/**
 * Upsert device_log: insert if new, overwrite payload if existing.
 * Each node maintains only ONE record (transparent/passthrough mode).
 */
export async function upsertDeviceLog(
  db: D1Database,
  nodeName: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO device_log (node_name, payload) VALUES (?, ?)
       ON CONFLICT(node_name) DO UPDATE SET payload = excluded.payload, created_at = datetime('now')`
    )
    .bind(nodeName, JSON.stringify(payload))
    .run()
}

/**
 * Get the payload for a given node (single record per node).
 */
export async function getPayloadByNode(
  db: D1Database,
  nodeName: string
): Promise<{ payload: string } | null> {
  const row = await db
    .prepare(`SELECT payload FROM device_log WHERE node_name = ?`)
    .bind(nodeName)
    .first<{ payload: string }>()

  return row ?? null
}

/**
 * Delete device_log record for a given node.
 */
export async function deleteDeviceLogByNode(
  db: D1Database,
  nodeName: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM device_log WHERE node_name = ?`)
    .bind(nodeName)
    .run()
}

/**
 * Get all device_log records (for listing).
 */
export async function getAllDeviceLogs(
  db: D1Database
): Promise<Array<{ node_name: string; payload: string }>> {
  const { results } = await db
    .prepare(`SELECT node_name, payload FROM device_log`)
    .all<{ node_name: string; payload: string }>()

  return results
}