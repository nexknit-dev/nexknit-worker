import { D1Database } from '@cloudflare/workers-types'

export interface CleanupResult {
  deletedCount: number
  remainingNodes: number
}

export async function clearAllDeviceLogs(db: D1Database): Promise<CleanupResult> {
  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM device_log`)
    .first<{ count: number }>()
  
  const deletedCount = countResult?.count ?? 0

  await db.prepare(`DELETE FROM device_log`).run()

  const nodesResult = await db
    .prepare(`SELECT COUNT(*) as count FROM nodes`)
    .first<{ count: number }>()

  return {
    deletedCount,
    remainingNodes: nodesResult?.count ?? 0
  }
}

export async function getDeviceLogCount(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`SELECT COUNT(*) as count FROM device_log`)
    .first<{ count: number }>()
  return result?.count ?? 0
}
