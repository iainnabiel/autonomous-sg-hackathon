import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { Satellite } from '../../auth/operators'
import { GlobeBoundary, GlobeFallback, webglAvailable } from './GlobeFallback'
import { getLand } from './land'

// Operational globe. Earth is drawn as luminous land dots and coastlines on a dark sphere.
// Satellites move on circular orbits from the demo asset list (auth/operators.ts); the
// motion is time-compressed and not propagated from real elements. The caller supplies
// which objects belong to the signed-in operator and which carry open encounters.

const EARTH_KM = 6371
const DEG = Math.PI / 180
/** 1 real second = this many seconds of orbital motion. */
const TIME_SCALE = 40
/** Angular rate for a circular orbit, rad per (scaled) second. */
function rate(altKm: number) {
  const a = (EARTH_KM + altKm) * 1000
  const mu = 3.986004418e14
  return Math.sqrt(mu / (a * a * a))
}
function basis(incl: number, raan: number) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(incl * DEG, raan * DEG, 0, 'YXZ'))
}
function orbitRadius(altKm: number) {
  return 1 + altKm / EARTH_KM
}
/** World position of a satellite at scaled time t. */
export function satPosition(s: Satellite, t: number, out = new THREE.Vector3()) {
  const r = orbitRadius(s.orbit.altitude_km)
  const a = s.orbit.phase_deg * DEG + rate(s.orbit.altitude_km) * t * TIME_SCALE
  out.set(r * Math.cos(a), 0, r * Math.sin(a)).applyQuaternion(basis(s.orbit.inclination_deg, s.orbit.raan_deg))
  return out
}

export type MarkerLevel = 'immediate' | 'attention' | null

export interface GlobeProps {
  satellites: Satellite[]
  /** IDs belonging to the signed-in operator. */
  ownIds: ReadonlySet<string>
  /** Alert level per satellite id, from its open encounters. */
  markers: ReadonlyMap<string, MarkerLevel>
  /** Pairs to draw a line between, e.g. a protected asset and the object it may meet. */
  links: readonly [string, string][]
  selectedId: string | null
  onSelect: (id: string | null) => void
  className?: string
  /** Lower detail for small embeds. */
  compact?: boolean
}

export function Globe(props: GlobeProps) {
  const ok = useMemo(webglAvailable, [])
  const selLabel = useRef<HTMLDivElement>(null)
  const hovLabel = useRef<HTMLDivElement>(null)
  if (!ok) return <GlobeFallback className={props.className} />
  return (
    <div className={props.className} role="img" aria-label="Globe with operator satellites and tracked objects">
      {/* Labels live in the DOM, outside the canvas; the Projector moves them each frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div ref={selLabel} className="absolute top-0 left-0 hidden -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-sm border border-line-strong bg-void/85 px-2 py-1 font-mono text-[10px] text-ink backdrop-blur-sm will-change-transform" />
        <div ref={hovLabel} className="absolute top-0 left-0 hidden -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-sm border border-line bg-void/75 px-2 py-1 font-mono text-[10px] text-ink-2 backdrop-blur-sm will-change-transform" />
      </div>
      <GlobeBoundary fallback={<GlobeFallback className="absolute inset-0" />}>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.55, 3.85], fov: 36, near: 0.05, far: 60 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
          style={{ background: 'transparent', width: '100%', height: '100%', display: 'block' }}
          onPointerMissed={() => props.onSelect(null)}
        >
          <Suspense fallback={null}>
            <Scene {...props} selLabel={selLabel} hovLabel={hovLabel} />
          </Suspense>
        </Canvas>
      </GlobeBoundary>
    </div>
  )
}

type LabelRef = React.RefObject<HTMLDivElement | null>

function Scene({ satellites, ownIds, markers, links, selectedId, onSelect, compact, selLabel, hovLabel }: GlobeProps & { selLabel: LabelRef; hovLabel: LabelRef }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const byId = useMemo(() => new Map(satellites.map((s) => [s.id, s])), [satellites])
  const positions = useRef(new Map<string, THREE.Vector3>())
  satellites.forEach((s) => {
    if (!positions.current.has(s.id)) positions.current.set(s.id, new THREE.Vector3())
  })

  // Advance every satellite once per frame; children read from the shared map.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (const s of satellites) satPosition(s, t, positions.current.get(s.id))
  })

  return (
    <>
      <Earth compact={compact} />
      <Graticule />
      {satellites.map((s) => (
        <OrbitRing key={`ring-${s.id}`} s={s} own={ownIds.has(s.id)} selected={s.id === selectedId} />
      ))}
      {satellites.map((s) => (
        <SatelliteMark
          key={s.id}
          s={s}
          own={ownIds.has(s.id)}
          marker={markers.get(s.id) ?? null}
          selected={s.id === selectedId}
          position={positions.current.get(s.id)!}
          onSelect={onSelect}
          onHover={(h) => setHoverId(h ? s.id : null)}
        />
      ))}
      <Links links={links} positions={positions.current} />
      <Projector
        positions={positions.current}
        targets={[
          { id: selectedId, el: selLabel, text: selectedId ? labelText(byId.get(selectedId), markers.get(selectedId) ?? null) : '' },
          { id: hoverId && hoverId !== selectedId ? hoverId : null, el: hovLabel, text: hoverId ? labelText(byId.get(hoverId), markers.get(hoverId) ?? null) : '' },
        ]}
      />
      <Stars />
      <CameraRig controls={controls} target={selectedId ? positions.current.get(selectedId) ?? null : null} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableZoom
        minDistance={1.6}
        maxDistance={6}
        zoomSpeed={0.6}
        rotateSpeed={0.45}
        enableDamping
        dampingFactor={0.08}
        autoRotate={!selectedId}
        autoRotateSpeed={0.25}
      />
    </>
  )
}

/** Eases the camera to a vantage above a selected satellite, so it is never behind the planet; releases when unselected. */
function CameraRig({ controls, target }: { controls: React.RefObject<OrbitControlsImpl | null>; target: THREE.Vector3 | null }) {
  const { camera } = useThree()
  const home = useMemo(() => new THREE.Vector3(0, 0, 0), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const k = 1 - Math.exp(-dt * 2.6)
    if (target) {
      // Look at a point between Earth centre and the satellite so the limb stays in frame,
      // from a camera placed radially above the satellite at a fixed distance.
      tmp.copy(target).multiplyScalar(0.72)
      c.target.lerp(tmp, k)
      tmp.copy(target).normalize().multiplyScalar(2.7)
      camera.position.lerp(tmp, k)
    } else {
      c.target.lerp(home, k)
      // Drift back out to a comfortable distance without snapping.
      const d = camera.position.length()
      if (d < 3.4) camera.position.multiplyScalar(1 + (3.6 / d - 1) * k * 0.5)
    }
    c.update()
  })
  return null
}

function Earth({ compact }: { compact?: boolean }) {
  const land = useMemo(() => getLand(compact ? 7000 : 16000), [compact])
  const coastPoints = useMemo(
    () => land.coasts.map((c) => Array.from({ length: c.length / 3 }, (_, j) => [c[j * 3], c[j * 3 + 1], c[j * 3 + 2]] as [number, number, number])),
    [land],
  )
  const base = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRim: { value: new THREE.Color('#6fe3ff') },
          uDeep: { value: new THREE.Color('#081222') },
          uShallow: { value: new THREE.Color('#102540') },
          uLight: { value: new THREE.Vector3(-0.5, 0.45, 0.75).normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uRim, uDeep, uShallow, uLight;
          varying vec3 vN; varying vec3 vV;
          void main() {
            float d = clamp(dot(vN, uLight), 0.0, 1.0);
            float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 3.5);
            vec3 c = mix(uDeep, uShallow, d * 0.9) + uRim * f * 0.45;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  )
  return (
    <group>
      <mesh material={base}>
        <sphereGeometry args={[1, 96, 96]} />
      </mesh>
      {/* Land as dots: the inverted, luminous treatment. */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[land.dots, 3]} />
        </bufferGeometry>
        <pointsMaterial size={compact ? 0.012 : 0.0105} color="#a9e4f2" transparent opacity={0.85} sizeAttenuation depthWrite={false} />
      </points>
      {coastPoints.map((pts, i) => (
        <Line key={i} points={pts} color="#6fe3ff" transparent opacity={0.35} lineWidth={1} />
      ))}
      {/* Atmosphere: back-facing shell, additive fresnel. */}
      <mesh scale={1.045}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{ uColor: { value: new THREE.Color('#5fd3f0') } }}
          vertexShader={/* glsl */ `
            varying float vF;
            void main() {
              vec3 n = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vF = pow(clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0), 2.2);
              gl_Position = projectionMatrix * mv;
            }`}
          fragmentShader={/* glsl */ `
            uniform vec3 uColor; varying float vF;
            void main() { gl_FragColor = vec4(uColor, vF * 0.42); }`}
        />
      </mesh>
    </group>
  )
}

function Graticule() {
  const lines = useMemo(() => {
    const out: [number, number, number][][] = []
    const r = 1.003
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: [number, number, number][] = []
      const rr = r * Math.cos(lat * DEG)
      const y = r * Math.sin(lat * DEG)
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * Math.PI * 2
        pts.push([rr * Math.cos(a), y, rr * Math.sin(a)])
      }
      out.push(pts)
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const pts: [number, number, number][] = []
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * Math.PI * 2
        const v = new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), lon * DEG)
        pts.push([v.x, v.y, v.z])
      }
      out.push(pts)
    }
    return out
  }, [])
  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#8fb3e6" transparent opacity={0.07} lineWidth={1} />
      ))}
    </group>
  )
}

function OrbitRing({ s, own, selected }: { s: Satellite; own: boolean; selected: boolean }) {
  const pts = useMemo(() => {
    const r = orbitRadius(s.orbit.altitude_km)
    const q = basis(s.orbit.inclination_deg, s.orbit.raan_deg)
    return Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * Math.PI * 2
      const v = new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)).applyQuaternion(q)
      return [v.x, v.y, v.z] as [number, number, number]
    })
  }, [s])
  if (!own && !selected) return null
  return <Line points={pts} color={selected ? '#ffffff' : '#6fe3ff'} transparent opacity={selected ? 0.55 : 0.22} lineWidth={selected ? 1.4 : 1} />
}

function SatelliteMark({ s, own, marker, selected, position, onSelect, onHover }: { s: Satellite; own: boolean; marker: MarkerLevel; selected: boolean; position: THREE.Vector3; onSelect: (id: string | null) => void; onHover: (h: boolean) => void }) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(false)
  const { camera } = useThree()

  useFrame(({ clock }) => {
    if (group.current) group.current.position.copy(position)
    if (ring.current) {
      ring.current.lookAt(camera.position)
      const t = clock.getElapsedTime()
      const pulse = marker === 'immediate' ? 1 + 0.35 * Math.sin(t * 4) : 1
      ring.current.scale.setScalar(pulse)
    }
  })
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    onHover(hover)
    return () => {
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover])

  const color = marker === 'immediate' ? '#ff5f6d' : marker === 'attention' ? '#f2b34a' : own ? '#6fe3ff' : '#8b97ab'
  const size = own ? 0.016 : 0.011
  const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation()

  return (
    <group ref={group}>
      <mesh
        onClick={(e) => {
          stop(e)
          onSelect(selected ? null : s.id)
        }}
        onPointerOver={(e) => {
          stop(e)
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
      >
        {/* Oversized invisible hit target so small marks are easy to click. */}
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {(own || marker || selected) && (
        <mesh ref={ring}>
          <ringGeometry args={[size * 1.9, size * 2.3, 32]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : marker ? 0.8 : 0.45} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function labelText(s: Satellite | undefined, marker: MarkerLevel) {
  if (!s) return ''
  return marker === 'immediate' ? `${s.name} · immediate` : marker === 'attention' ? `${s.name} · review` : s.name
}

/** Projects world positions to the canvas and moves DOM labels without touching React state. */
function Projector({ positions, targets }: { positions: Map<string, THREE.Vector3>; targets: { id: string | null; el: LabelRef; text: string }[] }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const t of targets) {
      const el = t.el.current
      if (!el) continue
      const p = t.id ? positions.get(t.id) : undefined
      if (!p) {
        el.style.display = 'none'
        continue
      }
      v.copy(p).project(camera)
      // Hide when behind the camera or behind the planet (planet radius 1 at origin).
      const behindPlanet = p.dot(camera.position) < 0 && p.lengthSq() < camera.position.lengthSq()
      const hidden = v.z > 1 || behindPlanet
      el.style.display = hidden ? 'none' : 'block'
      if (hidden) continue
      if (el.textContent !== t.text) el.textContent = t.text
      el.style.left = `${((v.x + 1) / 2) * size.width}px`
      el.style.top = `${((1 - v.y) / 2) * size.height}px`
    }
  })
  return null
}

/** Straight lines between linked objects, refreshed every frame from the shared position map. */
function Links({ links, positions }: { links: readonly [string, string][]; positions: Map<string, THREE.Vector3> }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(links.length, 1) * 6), 3))
    return g
  }, [links.length])
  const obj = useMemo(() => new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: '#ff5f6d', transparent: true, opacity: 0.55 })), [geom])
  useFrame(() => {
    const attr = geom.attributes.position as THREE.BufferAttribute
    links.forEach(([a, b], i) => {
      const pa = positions.get(a)
      const pb = positions.get(b)
      if (!pa || !pb) return
      attr.setXYZ(i * 2, pa.x, pa.y, pa.z)
      attr.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z)
    })
    attr.needsUpdate = true
    geom.setDrawRange(0, links.length * 2)
  })
  return <primitive object={obj} />
}

function Stars() {
  const positions = useMemo(() => {
    const n = 900
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 8)
      arr.set([v.x, v.y, v.z], i * 3)
    }
    return arr
  }, [])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#a7b2c6" transparent opacity={0.5} sizeAttenuation />
    </points>
  )
}
