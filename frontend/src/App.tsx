import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Nav } from './components/layout/Nav'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
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

/** Everything except the sign-in page needs a (demonstration) operator session. */
function Protected({ children }: { children: ReactNode }) {
  const { operator } = useAuth()
  const location = useLocation()
  if (!operator) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <Nav />
      {children}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/queue" element={<Protected><Queue /></Protected>} />
          <Route path="/encounter/:id" element={<Protected><Encounter /></Protected>} />
          <Route path="/radar" element={<Protected><Radar /></Protected>} />
          <Route path="/evaluation" element={<Protected><Evaluation /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
