import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {
  existsSync,
  createReadStream,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readdirSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isUnofficialLdrawPart, parseLdrawPartDescription } from './src/services/part-official'
import { libraryRelCandidates } from './src/services/ldraw-library-paths'
import { listDirectChildFiles } from './src/services/part-children'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveConfiguredPath(raw: string | undefined, fallbackRelative: string): string {
  const value = (raw ?? fallbackRelative).trim()
  return path.isAbsolute(value) ? value : path.resolve(__dirname, value)
}

function atomicWrite(dest: string, body: string): void {
  mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, dest)
}

function isSafeRelativeDatPath(rel: string): boolean {
  if (!rel || rel.includes('\0')) return false
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')
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

function resolveLibraryFile(root: string, partFile: string): { rel: string; abs: string } | null {
  for (const rel of libraryRelCandidates(partFile)) {
    const abs = path.join(root, rel)
    if (existsSync(abs) && statSync(abs).isFile()) return { rel, abs }
  }
  return null
}

function connectivityApiPlugin(ldrawParts: string, shadowLibrary: string): Plugin {
  const shadowExists = (partFile: string) => resolveLibraryFile(shadowLibrary, partFile) != null

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
          const partsDir = path.join(ldrawParts, 'parts')
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
          const geometry = resolveLibraryFile(ldrawParts, partFile)
          let isUnofficial = false
          let description: string | null = null
          if (geometry) {
            try {
              const header = readFileSync(geometry.abs, 'utf8').slice(0, 8192)
              isUnofficial = isUnofficialLdrawPart(header)
              description = parseLdrawPartDescription(header)
            } catch {
              // ignore unreadable header
            }
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              partFile,
              geometryExists: geometry != null,
              geometryUrl: geometry ? `/ldraw-parts/${geometry.rel}` : null,
              hasShadow: shadowExists(partFile),
              isUnofficial,
              description,
            }),
          )
          return
        }

        if (method === 'GET' && urlPath === 'children') {
          const url = new URL(req.url ?? '', 'http://localhost')
          const partFile = (url.searchParams.get('part') ?? '').toLowerCase()
          if (!partFile.endsWith('.dat') || partFile.includes('..')) {
            res.statusCode = 400
            res.end('Bad Request')
            return
          }
          const geometry = resolveLibraryFile(ldrawParts, partFile)
          const children = geometry
            ? listDirectChildFiles(readFileSync(geometry.abs, 'utf8')).map((child) => ({
                ...child,
                hasShadow: shadowExists(child.loadFile),
                geometryExists: resolveLibraryFile(ldrawParts, child.loadFile) != null,
              }))
            : []
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ partFile, children }))
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
          const shadowDest = path.resolve(shadowLibrary, rel)
          if (!shadowDest.startsWith(shadowLibrary)) {
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

              atomicWrite(shadowDest, body)

              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: true,
                  path: rel,
                  wroteToShadowLibrary: true,
                  shadowPath: shadowDest,
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const IB_PUBLIC = resolveConfiguredPath(env.LDRAW_PARTS_ROOT, '../instruction-builder/public')
  const LDRAW_PARTS = path.join(IB_PUBLIC, env.LDRAW_PARTS_SUBDIR?.trim() || 'ldraw-parts')
  const SHADOW_LIBRARY = resolveConfiguredPath(env.LDCAD_SHADOW_LIBRARY, '../LDCadShadowLibrary')

  return {
    plugins: [
      react(),
      serveStaticDir('/ldraw-parts', LDRAW_PARTS),
      serveStaticDir('/ldcad-parts-connectivity', SHADOW_LIBRARY),
      connectivityApiPlugin(LDRAW_PARTS, SHADOW_LIBRARY),
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
          SHADOW_LIBRARY,
        ],
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
