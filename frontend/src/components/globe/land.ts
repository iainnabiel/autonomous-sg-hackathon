import { feature } from 'topojson-client'
import { geoContains } from 'd3-geo'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson'
import landTopo from 'world-atlas/land-110m.json'

// Land geometry for the globe. The 110 m world-atlas land mask (public domain, Natural Earth)
// is turned into two things: a set of dots on the sphere that fall on land, and the coastline
// outlines. Both are computed once and cached. The dots give the "inverted" treatment the
// brief asks for — luminous land on a dark sea — without any texture download.

const DEG = Math.PI / 180

export interface LandData {
  /** xyz triples on the unit sphere for every land dot. */
  dots: Float32Array
  /** Coastline polylines, each as xyz triples on the unit sphere. */
  coasts: Float32Array[]
}

let cache: LandData | null = null

/** Longitude/latitude → unit-sphere position, matching three.js's Y-up frame. */
export function lonLatToVec(lon: number, lat: number, r = 1): [number, number, number] {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)]
}

export function getLand(dotCount = 14000): LandData {
  if (cache) return cache
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
  // `feature()` yields a FeatureCollection for a GeometryCollection object, a Feature otherwise.
  const fc = feature(topo, topo.objects.land) as unknown as FeatureCollection<Geometry> | Feature<Geometry>
  const land: FeatureCollection<Geometry> = fc.type === 'FeatureCollection' ? fc : { type: 'FeatureCollection', features: [fc] }

  // Fibonacci sphere gives an even dot spacing; keep only the dots over land.
  const golden = Math.PI * (3 - Math.sqrt(5))
  const kept: number[] = []
  for (let i = 0; i < dotCount; i++) {
    const y = 1 - (i / (dotCount - 1)) * 2
    const lat = Math.asin(y) / DEG
    const lon = (((i * golden) % (Math.PI * 2)) / DEG) - 180
    if (geoContains(land, [lon, lat])) kept.push(...lonLatToVec(lon, lat, 1.001))
  }

  const coasts: Float32Array[] = []
  const polygons = land.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [(f.geometry as Polygon).coordinates] : f.geometry.type === 'MultiPolygon' ? (f.geometry as MultiPolygon).coordinates : []))
  for (const poly of polygons) {
    for (const ring of poly) {
      const arr = new Float32Array(ring.length * 3)
      ring.forEach(([lon, lat], i) => arr.set(lonLatToVec(lon, lat, 1.002), i * 3))
      coasts.push(arr)
    }
  }

  cache = { dots: new Float32Array(kept), coasts }
  return cache
}
