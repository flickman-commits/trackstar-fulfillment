import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useState, useEffect, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Dashboard from '@/pages/Dashboard'
import OrderDetails from '@/pages/OrderDetails'
import ApprovalPortal from '@/pages/ApprovalPortal'
import CreatorsHome from '@/pages/CreatorsHome'

const PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || ''

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-off-black flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-white/60 text-body-sm mb-6">An unexpected error occurred.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 text-body-sm font-medium text-off-black bg-white hover:bg-white/90 rounded-md transition-opacity"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('trackstar_auth')
    if (stored === 'true') {
      setIsAuthenticated(true)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === PASSWORD) {
      localStorage.setItem('trackstar_auth', 'true')
      setIsAuthenticated(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  if (isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/trackstar-logo.png" alt="Trackstar" className="h-12" />
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-border-gray rounded-md p-6 shadow-sm">
          <label className="block text-body-sm font-medium text-off-black mb-2">
            Enter Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-4 py-3 text-body-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-off-black/20 transition-colors ${
              error ? 'border-red-500' : 'border-border-gray'
            }`}
            placeholder="Password"
            autoFocus
          />
          {error && (
            <p className="text-red-500 text-body-sm mt-2">Incorrect password</p>
          )}
          <button
            type="submit"
            className="w-full mt-4 px-4 py-3 text-body-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public route — no password gate */}
          <Route path="/approve/:token" element={<ApprovalPortal />} />

          {/* Protected routes */}
          <Route path="/*" element={
            <PasswordGate>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                <Route path="/creators" element={<CreatorsHome />} />
              </Routes>
            </PasswordGate>
          } />
        </Routes>
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "!bg-off-black !text-white !rounded-md"
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
