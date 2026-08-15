// Structured address primitive — built on YGeoPoint (file.ts). Zero dependencies.

import type { YGeoPoint } from './file.js'

/** A place, as entered by a user. `point` is set by clicking a map (no geocoder in v1). */
export interface YAddress {
  text?: string
  point?: YGeoPoint
}
