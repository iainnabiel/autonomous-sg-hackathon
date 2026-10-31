import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { OPERATORS, type Operator } from './operators'

// Demonstration sign-in only. The "session" is the chosen operator's id in sessionStorage.
// There is no credential check, no server, and no authorisation. See auth/operators.ts.

const KEY = 'orbit.demo.operator'

interface AuthValue {
  operator: Operator | null
  signIn: (operatorId: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [operatorId, setOperatorId] = useState<string | null>(() => sessionStorage.getItem(KEY))

  const signIn = useCallback((id: string) => {
    if (!OPERATORS.some((o) => o.id === id)) return
    sessionStorage.setItem(KEY, id)
    setOperatorId(id)
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(KEY)
    setOperatorId(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ operator: OPERATORS.find((o) => o.id === operatorId) ?? null, signIn, signOut }),
    [operatorId, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
