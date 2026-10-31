import { feature } from 'topojson-client'
import { geoBounds, geoContains } from 'd3-geo'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson'
import landTopo from 'world-atlas/land-110m.json'

// Land geometry for the globe. The 110 m world-atlas land mask (public domain, Natural Earth)
// is turned into two things: a set of dots on the sphere that fall on land, and the coastline
// outlines. Both are computed once and cached. The dots give the "inverted" treatment the
// brief asks for — luminous land on a dark sea — without any texture download.

const DEG = Math.PI / 180

let coastCache: Float32Array[] | null = null
const dotCache = new Map<number, Float32Array>()

/** Longitude/latitude → unit-sphere position, matching three.js's Y-up frame. */
export function lonLatToVec(lon: number, lat: number, r = 1): [number, number, number] {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)]
}

function landPolygons(): Polygon['coordinates'][] {
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
  // `feature()` yields a FeatureCollection for a GeometryCollection object, a Feature otherwise.
  const fc = feature(topo, topo.objects.land) as unknown as FeatureCollection<Geometry> | Feature<Geometry>
  const features = fc.type === 'FeatureCollection' ? fc.features : [fc]
  return features.flatMap((f) => (f.geometry.type === 'Polygon' ? [(f.geometry as Polygon).coordinates] : f.geometry.type === 'MultiPolygon' ? (f.geometry as MultiPolygon).coordinates : []))
}

/** Coastline polylines as xyz triples on the unit sphere. Cheap; computed once. */
export function getCoasts(): Float32Array[] {
  if (coastCache) return coastCache
  coastCache = landPolygons().flatMap((poly) =>
    poly.map((ring) => {
      const arr = new Float32Array(ring.length * 3)
      ring.forEach(([lon, lat], i) => arr.set(lonLatToVec(lon, lat, 1.002), i * 3))
      return arr
    }),
  )
  return coastCache
}

/**
 * xyz triples for the land dots: a Fibonacci sphere (even spacing) keeping only dots over land.
 * Slow enough (~0.5 s) that the globe runs it in a worker (land.worker.ts) rather than block the page.
 * Each polygon's bounding box is checked before the exact spherical test, which skips most
 * polygons per dot; the result is identical to testing every polygon.
 */
export function computeLandDots(dotCount: number): Float32Array {
  const cached = dotCache.get(dotCount)
  if (cached) return cached
  const PAD = 0.5 // degrees of slack around each box
  const boxes = landPolygons().map((coordinates) => {
    const polygon: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }
    const [[w, s], [e, n]] = geoBounds(polygon)
    return { polygon, w, s, e, n }
  })
  // A box with w > e crosses the antimeridian.
  const inLon = (lon: number, w: number, e: number) => (w <= e ? lon >= w - PAD && lon <= e + PAD : lon >= w - PAD || lon <= e + PAD)

  const golden = Math.PI * (3 - Math.sqrt(5))
  const kept: number[] = []
  for (let i = 0; i < dotCount; i++) {
    const y = 1 - (i / (dotCount - 1)) * 2
    const lat = Math.asin(y) / DEG
    const lon = (((i * golden) % (Math.PI * 2)) / DEG) - 180
    const onLand = boxes.some((b) => lat >= b.s - PAD && lat <= b.n + PAD && inLon(lon, b.w, b.e) && geoContains(b.polygon, [lon, lat]))
    if (onLand) kept.push(...lonLatToVec(lon, lat, 1.001))
  }
  const dots = new Float32Array(kept)
  dotCache.set(dotCount, dots)
  return dots
}
