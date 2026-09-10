/**
 * Part loading helpers (geometry URL + connectivity resolve).
 * Kept as a thin facade over connectivity-api for a stable import surface.
 */
export {
  loadPartConnectivity,
  loadCustomPartFile,
  partGeometryUrl,
  fetchPartStatus,
  searchParts,
} from './connectivity-api'
