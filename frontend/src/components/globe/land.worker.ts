// Computes the land dots off the main thread so the globe can draw immediately.
import { computeLandDots } from './land'

self.onmessage = (e: MessageEvent<number>) => {
  const dots = computeLandDots(e.data)
  ;(self as unknown as Worker).postMessage(dots, [dots.buffer])
}
