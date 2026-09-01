import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {
  existsSync,
  createReadStream,
  statSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IB_PUBLIC = path.resolve(__dirname, '../instruction-builder/public')
const LDRAW_PARTS = path.join(IB_PUBLIC, 'ldraw-parts')
const CONNECTIVITY_ROOT = path.join(IB_PUBLIC, 'ldcad-parts-connectivity')
/** Always-writable overlay inside this workspace (used when IB public is not writable). */
const CONNECTIVITY_OVERLAY = path.resolve(__dirname, 'connectivity-overrides')

function atomicWrite(dest: string, body: string): void {
  mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, dest)
}

function shadowExists(partFile: string): boolean {
  return (
    existsSync(path.join(CONNECTIVITY_OVERLAY, 'parts', partFile)) ||
    existsSync(path.join(CONNECTIVITY_ROOT, 'parts', partFile))
  )
}

function isSafeRelativeDatPath(rel: string): boolean {
  if (!rel || rel.includes('\0')) return false
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')
  if (normalized !== rel.replace(/\\/g, '/') && normalized !== path.normalize(rel)) {
    // allow path.normalize collapsing of ./ segments
  }
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return false
  if (!normalized.toLowerCase().endsWith('.dat')) return false
  return true
}

function resolveUnderRoot(root: string, relUrl: string): string | null {
  const clean = decodeURIComponent(relUrl.split('?')[0]).replace(/^\/+/, '')
  if (!isSafeRelativeDatPath(clean) && !clean.toLowerCase().endsWith('.ldr')) {
    // Allow non-.dat for ldraw (LDConfig.ldr, etc.) under ldraw-parts only
    if (!clean || clean.includes('\0') || clean.includes('..')) return null
  }
  if (clean.includes('..')) return null
  const full = path.resolve(root, clean)
  if (!full.startsWith(root)) return null
  return full
}

function serveStaticDir(urlPrefix: string, rootDir: string): Plugin {
  return {
    name: `serve-${urlPrefix.replace(/\W+/g, '-')}`,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const cleanUrl = (req.url ?? '').split('?')[0]
        const filePath = resolveUnderRoot(rootDir, cleanUrl)
        if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
          if (!filePath || !existsSync(filePath)) {
            res.statusCode = 404
            res.end('Not Found')
            return
          }
          next()
          return
        }
        const lower = filePath.toLowerCase()
        const contentType =
          lower.endsWith('.ldr') || lower.endsWith('.dat')
            ? 'text/plain; charset=utf-8'
            : 'application/octet-stream'
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

function serveConnectivityOverlayFirst(): Plugin {
  return {
    name: 'serve-connectivity-overlay-first',
    configureServer(server) {
      server.middlewares.use('/ldcad-parts-connectivity', (req, res, _next) => {
        const cleanUrl = (req.url ?? '').split('?')[0]
        const overlayPath = resolveUnderRoot(CONNECTIVITY_OVERLAY, cleanUrl)
        const basePath = resolveUnderRoot(CONNECTIVITY_ROOT, cleanUrl)
        const filePath =
          overlayPath && existsSync(overlayPath) && !statSync(overlayPath).isDirectory()
            ? overlayPath
            : basePath && existsSync(basePath) && !statSync(basePath).isDirectory()
              ? basePath
              : null
        if (!filePath) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

function connectivityApiPlugin(): Plugin {
  return {
    name: 'connectivity-api',
    configureServer(server) {
      server.middlewares.use('/api/connectivity', (req, res, next) => {
        const method = req.method ?? 'GET'
        const urlPath = (req.url ?? '').split('?')[0].replace(/^\/+/, '')

        if (method === 'GET' && urlPath === 'search') {
          const url = new URL(req.url ?? '', 'http://localhost')
          const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
          if (!q) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ results: [] }))
            return
          }
          const partsDir = path.join(LDRAW_PARTS, 'parts')
          const results: Array<{ partFile: string; hasShadow: boolean }> = []
          try {
            const files = readdirSync(partsDir)
            for (const name of files) {
              if (!name.toLowerCase().endsWith('.dat')) continue
              if (!name.toLowerCase().includes(q)) continue
              results.push({
                partFile: name.toLowerCase(),
                hasShadow: shadowExists(name.toLowerCase()),
              })
              if (results.length >= 40) break
            }
          } catch {
            // ignore
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ results }))
          return
        }

        if (method === 'GET' && urlPath === 'status') {
          const url = new URL(req.url ?? '', 'http://localhost')
          const partFile = (url.searchParams.get('part') ?? '').toLowerCase()
          if (!partFile.endsWith('.dat') || partFile.includes('..')) {
            res.statusCode = 400
            res.end('Bad Request')
            return
          }
          const geometryExists = existsSync(path.join(LDRAW_PARTS, 'parts', partFile))
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              partFile,
              geometryExists,
              hasShadow: shadowExists(partFile),
            }),
          )
          return
        }

        if (method === 'PUT') {
          const rel = decodeURIComponent(urlPath)
          if (!isSafeRelativeDatPath(rel) || rel.includes('..')) {
            res.statusCode = 400
            res.end('Invalid path')
            return
          }
          // Only allow writes under parts/ (not p/ primitives) for safety in v1
          if (!rel.replace(/\\/g, '/').startsWith('parts/')) {
            res.statusCode = 403
            res.end('Writes only allowed under parts/')
            return
          }
          const ibDest = path.resolve(CONNECTIVITY_ROOT, rel)
          const overlayDest = path.resolve(CONNECTIVITY_OVERLAY, rel)
          if (!ibDest.startsWith(CONNECTIVITY_ROOT) || !overlayDest.startsWith(CONNECTIVITY_OVERLAY)) {
            res.statusCode = 400
            res.end('Invalid path')
            return
          }

          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf8')
              if (!body.includes('!LDCAD')) {
                res.statusCode = 400
                res.end('Body does not look like LDCad connectivity')
                return
              }

              let wroteToIb = false
              let writeError: string | null = null
              try {
                atomicWrite(ibDest, body)
                wroteToIb = true
              } catch (err) {
                writeError = String(err)
              }

              // Always mirror into the workspace overlay so the running editor
              // can re-read the saved file even when IB public is not writable.
              atomicWrite(overlayDest, body)

              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: true,
                  path: rel,
                  wroteToInstructionBuilder: wroteToIb,
                  overlayPath: `connectivity-overrides/${rel}`,
                  warning: wroteToIb
                    ? undefined
                    : `Could not write to Instruction Builder library (${writeError}). Saved to connectivity-overrides/ instead — copy into IB public when ready.`,
                }),
              )
            } catch (err) {
              res.statusCode = 500
              res.end(String(err))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    serveStaticDir('/ldraw-parts', LDRAW_PARTS),
    serveConnectivityOverlayFirst(),
    connectivityApiPlugin(),
  ],
  resolve: {
    dedupe: ['three', '@types/three'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@eb/ldraw-models': path.resolve(__dirname, '../eb-ldraw-toolkit/packages/ldraw-models/src/index.ts'),
      '@eb/ldraw-parser': path.resolve(__dirname, '../eb-ldraw-toolkit/packages/ldraw-parser/src/index.ts'),
      '@eb/ldraw-three-core': path.resolve(__dirname, '../eb-ldraw-toolkit/packages/ldraw-three-core/src/index.ts'),
      three: path.resolve(__dirname, 'node_modules/three'),
    },
  },
  server: {
    fs: {
      allow: [
        __dirname,
        path.resolve(__dirname, '../eb-ldraw-toolkit'),
        IB_PUBLIC,
      ],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
