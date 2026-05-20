/**
 * API Key validation middleware for Nexknit Worker.
 * 
 * Validates the X-Nexknit-Key header against the expected API_KEY
 * stored in Cloudflare environment variables.
 */

import { Context, Next } from 'hono'

/**
 * Middleware that checks X-Nexknit-Key header.
 * Returns 401 if missing or invalid.
 */
export async function requireApiKey(c: Context, next: Next) {
  const expectedKey = c.env.API_KEY
  
  // If no API_KEY configured, allow all requests (development fallback)
  if (!expectedKey) {
    return await next()
  }

  const providedKey = c.req.header('X-Nexknit-Key')
  
  if (!providedKey || providedKey !== expectedKey) {
    return c.json({ error: 'Unauthorized: Invalid or missing API key' }, 401)
  }

  await next()
}