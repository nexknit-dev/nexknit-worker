/**
 * DAO for nodes table.
 * Responsibilities: pure SQL operations on nodes.
 * Does NOT touch request context, does NOT validate input.
 */

import { D1Database } from '@cloudflare/workers-types'

/**
 * Upsert a node: insert if new, update updated_at if existing.
 * Returns void �?errors are thrown by D1 on failure.
 */
export async function upsertNode(
  db: D1Database,
  nodeName: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO nodes (node_name, updated_at) VALUES (?, (unixepoch() * 1000))
       ON CONFLICT(node_name) DO UPDATE SET updated_at = (unixepoch() * 1000)`
    )
    .bind(nodeName)
    .run()
}

/**
 * Get all nodes ordered by last updated time (descending).
 */
export async function getAllNodes(
  db: D1Database
): Promise<Array<{ node_name: string; updated_at: number }>> {
  const { results } = await db
    .prepare(
      `SELECT node_name, updated_at FROM nodes ORDER BY updated_at DESC`
    )
    .all<{ node_name: string; updated_at: number }>()

  return results
}

/**
 * Delete a node from the registry.
 */
export async function deleteNode(
  db: D1Database,
  nodeName: string
): Promise<void> {
  await db
    .prepare(`DELETE FROM nodes WHERE node_name = ?`)
    .bind(nodeName)
    .run()
}

/**
 * Check if a node exists in the registry.
 */
export async function nodeExists(
  db: D1Database,
  nodeName: string
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT node_name FROM nodes WHERE node_name = ?`)
    .bind(nodeName)
    .first()

  return row !== null
}

/**
 * Get all nodes that have been offline (no update for longer than threshold).
 * @param db - D1Database instance
 * @param thresholdMs - Time threshold in milliseconds
 * @returns Array of offline nodes with their last update timestamp
 */
export async function getOfflineNodes(
  db: D1Database,
  thresholdMs: number
): Promise<Array<{ node_name: string; updated_at: number; offline_duration_ms: number }>> {
  const now = Date.now()
  const cutoff = now - thresholdMs

  const { results } = await db
    .prepare(
      `SELECT node_name, updated_at, ? - updated_at as offline_duration_ms
       FROM nodes
       WHERE updated_at < ?
       ORDER BY updated_at ASC`
    )
    .bind(now, cutoff)
    .all<{ node_name: string; updated_at: number; offline_duration_ms: number }>()

  return results
}