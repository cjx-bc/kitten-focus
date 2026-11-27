import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

export interface FixtureEntry {
  body: string | Buffer
  contentType?: string
}

export interface StaticServerOptions {
  rootDir?: string
  fixtures?: Record<string, string | FixtureEntry>
}

export interface StaticServer {
  url: string
  port: number
  close: () => Promise<void>
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
}

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

export async function startStaticServer(options: StaticServerOptions = {}): Promise<StaticServer> {
  const rootDir = path.resolve(options.rootDir ?? path.resolve(process.cwd(), 'dist'))
  const fixtures = options.fixtures

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/'
    let reqPath: string
    try {
      reqPath = decodeURIComponent(rawUrl.split('?')[0] || '/')
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Bad Request')
      return
    }
    const normalizedPath = reqPath === '/' ? '/index.html' : reqPath

    if (fixtures) {
      const entry = fixtures[normalizedPath] ?? fixtures[reqPath]
      if (entry !== undefined) {
        const body = typeof entry === 'string' ? entry : entry.body
        const contentType =
          typeof entry === 'string' ? mimeForPath(normalizedPath) : (entry.contentType ?? mimeForPath(normalizedPath))
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        })
        res.end(body)
        return
      }
    }

    const relative = normalizedPath.replace(/^\/+/, '')
    const resolved = path.resolve(rootDir, relative)
    if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Forbidden')
      return
    }

    let target = resolved
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html')
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }
      const data = fs.readFileSync(target)
      res.writeHead(200, {
        'Content-Type': mimeForPath(target),
        'Cache-Control': 'no-store',
      })
      res.end(data)
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(error instanceof Error ? error.message : String(error))
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo | null
  if (!address || typeof address.port !== 'number') {
    throw new Error('Failed to bind ephemeral port for static server')
  }

  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}
