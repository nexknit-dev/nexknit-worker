/**
 * Static assets middleware for Nexknit Worker.
 * 
 * Tries to serve static files from ASSETS binding before
 * falling through to API routes. Uses request cloning to
 * avoid consuming the request body on POST requests.
 */

import { Context, Next } from 'hono'

export async function serveAssets(c: Context, next: Next) {
  const asset = await c.env.ASSETS.fetch(c.req.raw.clone())
  if (asset.status !== 404) {
    return asset
  }
  await next()
}