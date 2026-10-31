import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/layout/Nav'
import { Home } from './pages/Home'
import { Queue } from './pages/Queue'
import { Encounter } from './pages/Encounter'
import { Radar } from './pages/Radar'
import { Evaluation } from './pages/Evaluation'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="flex min-h-dvh flex-col bg-void">
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/encounter/:id" element={<Encounter />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
