import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { Toaster } from 'sonner'
import { useEffect, Component } from 'react'
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
import { SignInGate, RequireAdmin } from '@/lib/auth'

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
        <div className="min-h-screen bg-dark-fill flex items-center justify-center px-4">
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
 * personalized ?p= link still greets the right race.
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
    <SignInGate>
      <MonopolyModel />
    </SignInGate>
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
                <SignInGate>
                  <MonopolyModel />
                </SignInGate>
              }
            />
            <Route
              path="/monopoly/model"
              element={
                <SignInGate>
                  <MonopolyModel />
                </SignInGate>
              }
            />
            {/* Anything else on this host is not a page we publish here. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="bottom-center"
            toastOptions={{ className: '!bg-dark-fill !text-white !rounded-md' }}
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
            <SignInGate>
              {/* The rail and the tool panels live outside the route table so
                  they survive a page change. */}
              <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                {/* Admin view: the creator programme, the bulk product editor
                    and the brief admin all change things outside the day to day
                    fulfillment work. */}
                <Route path="/creators" element={<RequireAdmin><CreatorsHome /></RequireAdmin>} />
                <Route path="/products" element={<RequireAdmin><ProductsBulkEdit /></RequireAdmin>} />
                <Route path="/briefs" element={<RequireAdmin><BriefsAdmin /></RequireAdmin>} />
                <Route path="/monopoly/model" element={<RedirectToMonopolyHost path="/model" />} />
              </Routes>
              </AppShell>
            </SignInGate>
          } />
        </Routes>
        <Toaster
          position="bottom-center"
          toastOptions={{
            className: "!bg-dark-fill !text-white !rounded-md"
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
