import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GlobeBoundary, GlobeFallback, webglAvailable } from './GlobeFallback'

// Schematic Earth with inclined orbits and tracked objects. This is an illustration of the
// problem space, not propagated orbits — the fixture encounters are not plotted here.

const EARTH_R = 1

const ORBITS = [
  { inclination: 53, raan: 0, radius: 1.14, period: 26, count: 7, phase: 0.0 },
  { inclination: 97.6, raan: 60, radius: 1.17, period: 30, count: 5, phase: 0.3 },
  { inclination: 86, raan: 130, radius: 1.21, period: 34, count: 4, phase: 0.6 },
  { inclination: 44, raan: 200, radius: 1.12, period: 24, count: 6, phase: 0.15 },
  { inclination: 70, raan: 275, radius: 1.26, period: 38, count: 3, phase: 0.8 },
  { inclination: 98, raan: 320, radius: 1.19, period: 31, count: 4, phase: 0.45 },
]

const DEG = Math.PI / 180

function orbitBasis(inclination: number, raan: number) {
  const q = new THREE.Quaternion()
  const e = new THREE.Euler(inclination * DEG, raan * DEG, 0, 'YXZ')
  q.setFromEuler(e)
  return q
}

function Earth() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uRim: { value: new THREE.Color('#6fe3ff') },
          uBase: { value: new THREE.Color('#0b1424') },
          uLight: { value: new THREE.Vector3(-0.6, 0.5, 0.8).normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uRim;
          uniform vec3 uBase;
          uniform vec3 uLight;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float diffuse = clamp(dot(vNormal, uLight), 0.0, 1.0);
            float fresnel = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 3.0);
            vec3 color = uBase * (0.35 + diffuse * 0.9) + uRim * fresnel * 0.55;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [],
  )

  return (
    <group>
      <mesh material={material}>
        <sphereGeometry args={[EARTH_R, 96, 96]} />
      </mesh>
      {/* Atmosphere: back-facing shell with additive fresnel. */}
      <mesh scale={1.035}>
        <sphereGeometry args={[EARTH_R, 64, 64]} />
        <shaderMaterial
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{ uColor: { value: new THREE.Color('#6fe3ff') } }}
          vertexShader={/* glsl */ `
            varying float vFres;
            void main() {
              vec3 n = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vFres = pow(clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0), 2.5);
              gl_Position = projectionMatrix * mv;
            }
          `}
          fragmentShader={/* glsl */ `
            uniform vec3 uColor;
            varying float vFres;
            void main() { gl_FragColor = vec4(uColor, vFres * 0.35); }
          `}
        />
      </mesh>
      <Graticule />
    </group>
  )
}

/** Latitude / longitude lines, very faint. */
function Graticule() {
  const lines = useMemo(() => {
    const out: THREE.Vector3[][] = []
    const r = EARTH_R * 1.002
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = []
      const rr = r * Math.cos(lat * DEG)
      const y = r * Math.sin(lat * DEG)
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2
        pts.push(new THREE.Vector3(rr * Math.cos(a), y, rr * Math.sin(a)))
      }
      out.push(pts)
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2
        const v = new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0)
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), lon * DEG)
        pts.push(v)
      }
      out.push(pts)
    }
    return out
  }, [])
  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#8fb3e6" transparent opacity={0.08} lineWidth={1} />
      ))}
    </group>
  )
}

function Orbit({ inclination, raan, radius, period, count, phase }: (typeof ORBITS)[number]) {
  const group = useRef<THREE.Group>(null)
  const q = useMemo(() => orbitBasis(inclination, raan), [inclination, raan])
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)))
    }
    return pts
  }, [radius])
  const sats = useMemo(() => Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2 + phase), [count, phase])
  const refs = useRef<(THREE.Mesh | null)[]>([])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    sats.forEach((offset, i) => {
      const m = refs.current[i]
      if (!m) return
      const a = offset + (t / period) * Math.PI * 2
      m.position.set(radius * Math.cos(a), 0, radius * Math.sin(a))
    })
  })

  return (
    <group ref={group} quaternion={q}>
      <Line points={ring} color="#6fe3ff" transparent opacity={0.26} lineWidth={1} />
      {sats.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[0.011, 10, 10]} />
          <meshBasicMaterial color="#e9eef7" />
        </mesh>
      ))}
    </group>
  )
}

/** Two objects on crossing orbits approaching the same point, with a marker at the crossing. */
function Conjunction() {
  const a = useRef<THREE.Mesh>(null)
  const b = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const qa = useMemo(() => orbitBasis(53, 0), [])
  const qb = useMemo(() => orbitBasis(97.6, 60), [])
  const ra = 1.14
  const rb = 1.17
  // Crossing point: intersection of the two orbital planes, picked numerically once.
  const crossing = useMemo(() => {
    const na = new THREE.Vector3(0, 1, 0).applyQuaternion(qa)
    const nb = new THREE.Vector3(0, 1, 0).applyQuaternion(qb)
    return na.cross(nb).normalize()
  }, [qa, qb])
  const angleOn = (q: THREE.Quaternion) => {
    const local = crossing.clone().applyQuaternion(q.clone().invert())
    return Math.atan2(local.z, local.x)
  }
  const thetaA = useMemo(() => angleOn(qa), [qa]) // eslint-disable-line react-hooks/exhaustive-deps
  const thetaB = useMemo(() => angleOn(qb), [qb]) // eslint-disable-line react-hooks/exhaustive-deps
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), [])
  const linkObj = useMemo(() => new THREE.Line(geom, new THREE.LineBasicMaterial({ color: '#ff5f6d', transparent: true, opacity: 0.6 })), [geom])
  // Ring lies tangent to the sphere at the crossing point.
  const ringQ = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), crossing), [crossing])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    // Both objects oscillate toward and away from the crossing over a 9 s cycle.
    const s = (Math.sin((t / 9) * Math.PI * 2) + 1) / 2 // 0..1
    const spread = 0.08 + s * 0.9
    const pa = new THREE.Vector3(ra * Math.cos(thetaA - spread), 0, ra * Math.sin(thetaA - spread)).applyQuaternion(qa)
    const pb = new THREE.Vector3(rb * Math.cos(thetaB + spread), 0, rb * Math.sin(thetaB + spread)).applyQuaternion(qb)
    a.current?.position.copy(pa)
    b.current?.position.copy(pb)
    const pos = geom.attributes.position as THREE.BufferAttribute
    pos.setXYZ(0, pa.x, pa.y, pa.z)
    pos.setXYZ(1, pb.x, pb.y, pb.z)
    pos.needsUpdate = true
    if (ringRef.current) {
      const close = 1 - s
      ringRef.current.scale.setScalar(0.03 + close * 0.05)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + close * 0.6
    }
  })

  const ringPos = crossing.clone().multiplyScalar((ra + rb) / 2)
  return (
    <group>
      <mesh ref={a}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color="#ff5f6d" />
      </mesh>
      <mesh ref={b}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshBasicMaterial color="#ff5f6d" />
      </mesh>
      <primitive object={linkObj} />
      <mesh ref={ringRef} position={ringPos} quaternion={ringQ}>
        <ringGeometry args={[0.8, 1, 48]} />
        <meshBasicMaterial color="#ff5f6d" transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Scene() {
  const root = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (root.current) root.current.rotation.y += dt * 0.04
  })
  return (
    <>
      <group ref={root} rotation={[0.25, 0, 0]}>
        <Earth />
        {ORBITS.map((o) => (
          <Orbit key={`${o.inclination}-${o.raan}`} {...o} />
        ))}
        <Conjunction />
      </group>
      <Stars />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.4} autoRotate={false} />
    </>
  )
}

function Stars() {
  const positions = useMemo(() => {
    const n = 700
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 6)
      arr.set([v.x, v.y, v.z], i * 3)
    }
    return arr
  }, [])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#a7b2c6" transparent opacity={0.55} sizeAttenuation />
    </points>
  )
}

export function Globe({ className = '' }: { className?: string }) {
  const ok = useMemo(webglAvailable, [])
  if (!ok) return <GlobeFallback className={className} />
  return (
    <div className={className} aria-label="Schematic globe with orbits and tracked objects" role="img">
      <GlobeBoundary fallback={<GlobeFallback className="absolute inset-0" />}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.2, 3.35], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        style={{ background: 'transparent', width: '100%', height: '100%', display: 'block' }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      </GlobeBoundary>
    </div>
  )
}
