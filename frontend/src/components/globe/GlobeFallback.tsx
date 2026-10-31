import { Component, type ReactNode } from 'react'

/** Static schematic shown when WebGL is unavailable, so the hero never renders empty. */
export function GlobeFallback({ className = '' }: { className?: string }) {
  return (
    <div className={`grid place-items-center ${className}`} role="img" aria-label="Schematic globe with orbits">
      <svg viewBox="0 0 400 400" className="h-full max-h-[560px] w-auto" fill="none">
        <defs>
          <radialGradient id="g" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#1a2a46" />
            <stop offset="1" stopColor="#0b1424" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="120" fill="url(#g)" stroke="#6fe3ff" strokeOpacity="0.35" />
        {[-60, -30, 0, 30, 60].map((lat) => (
          <ellipse key={lat} cx="200" cy={200 + Math.sin((lat * Math.PI) / 180) * 120} rx={Math.cos((lat * Math.PI) / 180) * 120} ry={Math.cos((lat * Math.PI) / 180) * 120 * 0.18} stroke="#8fb3e6" strokeOpacity="0.12" />
        ))}
        {[0, 30, 60].map((lon) => (
          <ellipse key={lon} cx="200" cy="200" rx={120 * Math.abs(Math.cos((lon * Math.PI) / 180))} ry="120" stroke="#8fb3e6" strokeOpacity="0.12" />
        ))}
        {[
          [-28, 150, 46],
          [62, 148, 58],
          [20, 152, 36],
          [-70, 140, 54],
        ].map(([rot, rx, ry], i) => (
          <ellipse key={i} cx="200" cy="200" rx={rx} ry={ry} transform={`rotate(${rot} 200 200)`} stroke="#6fe3ff" strokeOpacity="0.22" />
        ))}
        <circle cx="330" cy="135" r="4" fill="#ff5f6d" />
        <circle cx="300" cy="118" r="3" fill="#ff5f6d" />
        <line x1="330" y1="135" x2="300" y2="118" stroke="#ff5f6d" strokeOpacity="0.6" />
        {[
          [92, 240],
          [258, 320],
          [120, 110],
          [285, 262],
          [66, 180],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#e9eef7" />
        ))}
      </svg>
    </div>
  )
}

interface State {
  failed: boolean
}

/** Catches WebGL context failures from the 3D scene and swaps in the static fallback. */
export class GlobeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
