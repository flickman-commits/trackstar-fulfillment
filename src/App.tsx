import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useState, useEffect, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Dashboard from '@/pages/Dashboard'
import OrderDetails from '@/pages/OrderDetails'
import ApprovalPortal from '@/pages/ApprovalPortal'
import CreatorsHome from '@/pages/CreatorsHome'
import BriefsAdmin from '@/pages/BriefsAdmin'
import CreatorPortal from '@/pages/CreatorPortal'
import CreatorApply from '@/pages/CreatorApply'
import Monopoly from '@/pages/Monopoly'
import MonopolyModel from '@/pages/MonopolyModel'
import ProductsBulkEdit from '@/pages/ProductsBulkEdit'

const API_BASE = import.meta.env.VITE_API_URL || ''

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
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/auth/login`, { credentials: 'include' })
      .then((res) => {
        if (!cancelled && res.ok) setIsAuthenticated(true)
      })
      .catch(() => { /* treat as unauthenticated */ })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(false)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setIsAuthenticated(true)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-off-white" />
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
            disabled={submitting}
            className="w-full mt-4 px-4 py-3 text-body-sm font-medium text-white bg-off-black hover:opacity-90 rounded-md transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * True when the app is being served from the Marathon Monopoly subdomain.
 *
 * On that host the partnership page is the whole site: it answers at "/" so a
 * race director gets monopoly.trackstar.art rather than a path hanging off the
 * fulfilment tool. The dashboard and the rest of the admin surface are not
 * routed there at all, which also means the subdomain cannot be used to reach
 * them even with the password.
 *
 * Matched on the leading label rather than the full string so preview
 * deployments and any future monopoly.* host behave the same way.
 */
function isMonopolyHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.split('.')[0] === 'monopoly'
}

/** The one canonical address for the partnership page. */
const MONOPOLY_ORIGIN = 'https://monopoly.trackstar.art'

/**
 * Sends an old /monopoly link to the subdomain that now owns the page.
 *
 * A hard redirect rather than a removed route, because links to
 * fast.trackstar.art/monopoly are already in race directors' inboxes and a 404
 * is a worse answer than a redirect. The query string survives so a
 * personalised ?p= link still greets the right race.
 *
 * Only fires on the real domain. On localhost the page keeps rendering in
 * place, otherwise every local run of /monopoly would bounce to production.
 */
function RedirectToMonopolyHost({ path = '/' }: { path?: string }) {
  const onProduction = window.location.hostname.endsWith('trackstar.art')

  useEffect(() => {
    if (onProduction) {
      window.location.replace(`${MONOPOLY_ORIGIN}${path}${window.location.search}`)
    }
  }, [onProduction, path])

  if (onProduction) return null
  return path === '/model' ? (
    <PasswordGate>
      <MonopolyModel />
    </PasswordGate>
  ) : (
    <Monopoly />
  )
}

export default function App() {
  if (isMonopolyHost()) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Monopoly />} />
            {/* Same page, so an existing /monopoly link pasted at this host
                still lands somewhere sensible instead of 404ing. */}
            <Route path="/monopoly" element={<Monopoly />} />
            <Route
              path="/model"
              element={
                <PasswordGate>
                  <MonopolyModel />
                </PasswordGate>
              }
            />
            <Route
              path="/monopoly/model"
              element={
                <PasswordGate>
                  <MonopolyModel />
                </PasswordGate>
              }
            />
            {/* Anything else on this host is not a page we publish here. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="bottom-center"
            toastOptions={{ className: '!bg-off-black !text-white !rounded-md' }}
          />
        </BrowserRouter>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes — no password gate */}
          <Route path="/approve/:token" element={<ApprovalPortal />} />
          <Route path="/creator/:token" element={<CreatorPortal />} />
          <Route path="/apply" element={<CreatorApply />} />
          {/* The page lives on monopoly.trackstar.art now. */}
          <Route path="/monopoly" element={<RedirectToMonopolyHost />} />

          {/* Protected routes */}
          <Route path="/*" element={
            <PasswordGate>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                <Route path="/creators" element={<CreatorsHome />} />
                <Route path="/products" element={<ProductsBulkEdit />} />
                <Route path="/briefs" element={<BriefsAdmin />} />
                <Route path="/monopoly/model" element={<RedirectToMonopolyHost path="/model" />} />
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
