/**
 * DAO for device_log table.
 * Responsibilities: pure SQL operations on device_log.
 * Does NOT touch request context, does NOT parse payload.
 */

import { D1Database } from '@cloudflare/workers-types'

/**
 * Insert a new record into device_log.
 * The payload is stored as a raw JSON string (opaque to Worker).
 */
export async function insertDeviceLog(
  db: D1Database,
  nodeName: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO device_log (node_name, payload) VALUES (?, ?)`
    )
    .bind(nodeName, JSON.stringify(payload))
    .run()
}

/**
 * Get the latest payload for a given node.
 * Returns the row with the highest id (most recent insert).
 */
export async function getLatestPayload(
  db: D1Database,
  nodeName: string
): Promise<{ id: number; payload: string } | null> {
  const row = await db
    .prepare(
      `SELECT id, payload FROM device_log
       WHERE node_name = ?
       ORDER BY id DESC LIMIT 1`
    )
    .bind(nodeName)
    .first<{ id: number; payload: string }>()

  return row ?? null
}

/**
 * Delete all device_log records for a given node.
 */
export async function deleteDeviceLogsByNode(
  db: D1Database,
  nodeName: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM device_log WHERE node_name = ?`)
    .bind(nodeName)
    .run()
}