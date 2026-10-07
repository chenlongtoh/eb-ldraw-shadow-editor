import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { existsSync, createReadStream, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
  if (!isSafeRelativeDatPath(clean) || clean.includes('..')) return null
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
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

/** Dev-only write API: Save writes shadow files into the local LDCadShadowLibrary checkout. */
function connectivityApiPlugin(shadowLibrary: string): Plugin {
  return {
    name: 'connectivity-api',
    configureServer(server) {
      server.middlewares.use('/api/connectivity', (req, res, next) => {
        const method = req.method ?? 'GET'
        const urlPath = (req.url ?? '').split('?')[0].replace(/^\/+/, '')

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

function localEbToolkitAliases(): Record<string, string> {
  const toolkitRoot = path.resolve(__dirname, '../eb-ldraw-toolkit')
  const aliases = {
    '@eb/ldraw-models': path.join(toolkitRoot, 'packages/ldraw-models/src/index.ts'),
    '@eb/ldraw-parser': path.join(toolkitRoot, 'packages/ldraw-parser/src/index.ts'),
    '@eb/ldraw-three-core': path.join(toolkitRoot, 'packages/ldraw-three-core/src/index.ts'),
  }
  return Object.values(aliases).every((file) => existsSync(file)) ? aliases : {}
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  // The connectivity checkout this editor reads and saves into (geometry comes from the CDN).
  const CONNECTIVITY = resolveConfiguredPath(env.LDCAD_LIBRARY_DIR, '../LDCadShadowLibrary')
  const ebAliases = localEbToolkitAliases()
  const allowedFs = [__dirname, CONNECTIVITY]
  if (Object.keys(ebAliases).length > 0) {
    allowedFs.push(path.resolve(__dirname, '../eb-ldraw-toolkit'))
  }

  return {
    plugins: [
      react(),
      serveStaticDir('/ldraw-connectivity', CONNECTIVITY),
      connectivityApiPlugin(CONNECTIVITY),
    ],
    resolve: {
      dedupe: ['three', '@types/three'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        ...ebAliases,
        three: path.resolve(__dirname, 'node_modules/three'),
      },
    },
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      fs: {
        allow: allowedFs,
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
