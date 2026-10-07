/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Part library CDN base (default: the eb CloudFront `/ldraw`). */
  readonly VITE_LDRAW_PARTS_URL?: string
  /** Connectivity library CDN base for deployed builds (default: the eb CloudFront `/ldcad`). */
  readonly VITE_LDCAD_CONNECTIVITY_URL?: string
}
