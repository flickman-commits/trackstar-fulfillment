import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Upload, Copy, Loader2, FlaskConical, Pencil, Check, X, Settings, Mail, ChevronRight } from 'lucide-react'

// API calls now go to /api/* serverless functions (same origin)

type DesignStatus = 'not_started' | 'in_progress' | 'concepts_done' | 'in_revision' | 'approved_by_customer' | 'sent_to_production'

interface Order {
  id: string
  orderNumber: string        // Unique ID for this line item (parentOrderNumber-lineItemIndex)
  parentOrderNumber: string  // Original Shopify/Etsy order number
  lineItemIndex: number      // Which line item this is (0, 1, 2, etc.)
  displayOrderNumber: string // Friendly display number (Shopify order.name like "2585")
  source: 'shopify' | 'etsy'
  raceName: string
  raceYear: number | null
  raceDate?: string
  raceLocation?: string
  resultsUrl?: string
  eventType?: string
  runnerName: string
  productSize: string
  notes?: string
  hadNoTime?: boolean         // Flag: customer entered "no time"
  status: 'pending' | 'ready' | 'flagged' | 'completed' | 'missing_year'
  flagReason?: string
  completedAt?: string
  createdAt: string
  // Runner research data
  bibNumber?: string
  officialTime?: string
  officialPace?: string
  researchStatus?: 'found' | 'not_found' | 'ambiguous' | null
  researchNotes?: string
  // Weather data
  weatherTemp?: string
  weatherCondition?: string
  raceId?: number | null
  // Scraper availability
  hasScraperAvailable?: boolean
  // Override fields
  yearOverride?: number | null
  raceNameOverride?: string | null
  runnerNameOverride?: string | null
  // Effective values (computed by API)
  effectiveRaceYear?: number | null
  effectiveRaceName?: string
  effectiveRunnerName?: string
  hasOverrides?: boolean
  // Trackstar order type and custom order fields
  trackstarOrderType?: 'standard' | 'custom'
  designStatus?: DesignStatus
  dueDate?: string
  customerEmail?: string
  customerName?: string
  bibNumberCustomer?: string
  timeCustomer?: string
  creativeDirection?: string
  isGift?: boolean
}

// Design status display config
const DESIGN_STATUS_CONFIG: Record<DesignStatus, { icon: string; label: string; color: string; bgColor: string }> = {
  not_started: { icon: '⚪', label: 'Not Started', color: 'text-off-black/50', bgColor: 'bg-off-black/5' },
  in_progress: { icon: '🔵', label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  concepts_done: { icon: '🟡', label: 'Concepts Done', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  in_revision: { icon: '🟠', label: 'In Revision', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  approved_by_customer: { icon: '🟣', label: 'Approved by Customer', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  sent_to_production: { icon: '🟢', label: 'Sent to Production', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
}

// Toast notification component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
      type === 'success' ? 'bg-green-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      'bg-blue-600 text-white'
    }`}>
      {message}
    </div>
  )
}

// Copyable field component
function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-off-black">{value}</span>
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-off-black/10 rounded-sm transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <span className="text-success-green text-xs font-medium">✓</span>
          ) : (
            <Copy className="w-3.5 h-3.5 text-off-black/40 hover:text-off-black/70" />
          )}
        </button>
      </div>
    </div>
  )
}

// Static field without copy button
function StaticField({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-medium text-off-black">{value}</span>
        {flag && <span className="text-warning-amber" title="Year Missing">🚩</span>}
      </div>
    </div>
  )
}

// Pending field for data not yet available
function PendingField({ label }: { label: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <span className="text-body-sm text-off-black/30 italic">Pending research</span>
    </div>
  )
}

// Not available field (no scraper for this race)
function NotAvailableField({ label }: { label: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-off-black/60">{label}</span>
      <span className="text-body-sm text-off-black/30 italic">Manual entry needed</span>
    </div>
  )
}

function getGreeting(timezone: string = 'America/Costa_Rica'): string {
  const now = new Date()
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const hour = localTime.getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatLastUpdated(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/Costa_Rica',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// Date and pace are now pre-formatted by the API for direct copy to Illustrator
// Date: MM.DD.YY (e.g., "11.02.25")
// Pace: X:XX / mi (e.g., "7:15 / mi")

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [isResearching, setIsResearching] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsAction, setSettingsAction] = useState<string | null>(null)
  const [scraperResults, setScraperResults] = useState<{ raceName: string; status: 'untested' | 'pass' | 'fail'; raceInfoStatus?: string; runnerSearchStatus?: string; durationMs?: number; error?: string; runnerSearchError?: string; testRunnerName?: string }[]>([])
  const [isTestingScrapers, setIsTestingScrapers] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  // Store possible matches per order for ambiguous results (not persisted to DB)
  const [possibleMatchesMap, setPossibleMatchesMap] = useState<Record<string, Array<{ name: string; bib: string; time: string; pace?: string; city?: string; state?: string; eventType?: string; resultsUrl?: string }>>>({})
  // Race database state
  const [races, setRaces] = useState<{ id: number; raceName: string; year: number; raceDate: string; location: string | null; weatherCondition: string | null; weatherTemp: string | null; weatherFetchedAt: string | null; _count?: { runnerResearch: number } }[]>([])
  const [isLoadingRaces, setIsLoadingRaces] = useState(false)
  const [editingRaceId, setEditingRaceId] = useState<number | null>(null)
  const [raceEditValues, setRaceEditValues] = useState({ raceDate: '', location: '', weatherCondition: '', weatherTemp: '' })
  const [isSavingRace, setIsSavingRace] = useState(false)
  const [showAddRace, setShowAddRace] = useState(false)
  const [newRaceValues, setNewRaceValues] = useState({ raceName: '', year: new Date().getFullYear().toString(), raceDate: '', location: '' })
  const [showRaceDatabase, setShowRaceDatabase] = useState(false)
  const [showScraperStatus, setShowScraperStatus] = useState(false)
  // Tab switcher: standard vs custom order view
  const [activeView, setActiveView] = useState<'standard' | 'custom'>('standard')

  // Fetch orders from database (filtered by activeView type)
  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders?type=${activeView}`)
      if (!response.ok) throw new Error('Failed to fetch orders')
      const data = await response.json()

      // Transform database orders to match our Order interface
      const transformedOrders: Order[] = (data.orders || []).map((order: Record<string, unknown>) => {
        // Extract display order number from shopifyOrderData if available
        const shopifyData = order.shopifyOrderData as Record<string, unknown> | null
        const displayNum = shopifyData?.name as string | undefined

        return {
          id: order.id as string,
          orderNumber: order.orderNumber as string,
          parentOrderNumber: order.parentOrderNumber as string,
          lineItemIndex: order.lineItemIndex as number,
          displayOrderNumber: displayNum || (order.parentOrderNumber as string),
          source: order.source as 'shopify' | 'etsy',
          raceName: order.raceName as string,
          raceYear: order.raceYear as number | null,
          raceDate: order.raceDate as string | undefined,
          raceLocation: order.raceLocation as string | undefined,
          runnerName: order.runnerName as string,
          productSize: order.productSize as string,
          notes: order.notes as string | undefined,
          status: order.status as 'pending' | 'ready' | 'flagged' | 'completed' | 'missing_year',
          createdAt: order.createdAt as string,
          completedAt: order.researchedAt as string | undefined,
          // Research data
          bibNumber: order.bibNumber as string | undefined,
          officialTime: order.officialTime as string | undefined,
          officialPace: order.officialPace as string | undefined,
          eventType: order.eventType as string | undefined,
          researchStatus: order.researchStatus as 'found' | 'not_found' | 'ambiguous' | null,
          researchNotes: order.researchNotes as string | undefined,
          resultsUrl: order.resultsUrl as string | undefined,
          // Weather
          weatherTemp: order.weatherTemp as string | undefined,
          weatherCondition: order.weatherCondition as string | undefined,
          raceId: order.raceId as number | null | undefined,
          // Scraper
          hasScraperAvailable: order.hasScraperAvailable as boolean | undefined,
          // Override fields
          yearOverride: order.yearOverride as number | null | undefined,
          raceNameOverride: order.raceNameOverride as string | null | undefined,
          runnerNameOverride: order.runnerNameOverride as string | null | undefined,
          // Effective values
          effectiveRaceYear: order.effectiveRaceYear as number | null | undefined,
          effectiveRaceName: order.effectiveRaceName as string | undefined,
          effectiveRunnerName: order.effectiveRunnerName as string | undefined,
          hasOverrides: order.hasOverrides as boolean | undefined,
          // Custom order fields
          trackstarOrderType: order.trackstarOrderType as 'standard' | 'custom' | undefined,
          designStatus: order.designStatus as DesignStatus | undefined,
          dueDate: order.dueDate as string | undefined,
          customerEmail: order.customerEmail as string | undefined,
          customerName: order.customerName as string | undefined,
          bibNumberCustomer: order.bibNumberCustomer as string | undefined,
          timeCustomer: order.timeCustomer as string | undefined,
          creativeDirection: order.creativeDirection as string | undefined,
          isGift: order.isGift as boolean | undefined
        }
      })

      setOrders(transformedOrders)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Error fetching orders:', error)
      setToast({ message: 'Failed to fetch orders', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [activeView])

  // Import new orders from Artelo
  const importOrders = async () => {
    setIsImporting(true)
    try {
      const response = await fetch(`/api/orders/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Import failed (${response.status}): ${errorData}`)
      }

      const data = await response.json()
      const parts = []
      if (data.imported > 0) parts.push(`${data.imported} imported`)
      if (data.updated > 0) parts.push(`${data.updated} updated`)
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`)
      if (data.needsAttention > 0) parts.push(`${data.needsAttention} missing year`)
      setToast({
        message: parts.length > 0 ? parts.join(', ') : 'No changes',
        type: 'success'
      })

      // Refresh the orders list
      await fetchOrders()
    } catch (error) {
      console.error('Error importing orders:', error)
      const message = error instanceof Error ? error.message : 'Failed to import orders from Artelo'
      setToast({ message, type: 'error' })
    } finally {
      setIsImporting(false)
    }
  }


  const runSettingsAction = async (action: 'refresh-weather' | 'clear-research' | 'clear-race-cache') => {
    setSettingsAction(action)
    try {
      // refresh-weather stays as its own endpoint; the others go through /actions
      const isActionsEndpoint = action === 'clear-research' || action === 'clear-race-cache'
      const url = isActionsEndpoint ? '/api/orders/actions' : `/api/orders/${action}`
      const body = isActionsEndpoint ? { action } : {}
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error(`Action failed (${response.status})`)
      const data = await response.json()
      const messages: Record<string, string> = {
        'refresh-weather': `Weather refreshed for ${data.refreshed ?? 0} race(s)`,
        'clear-research': `Cleared ${data.deleted ?? 0} research records — re-research to repopulate`,
        'clear-race-cache': `Race info cache cleared for ${data.cleared ?? 0} race(s)`,
      }
      setToast({ message: messages[action], type: 'success' })
      await fetchOrders()
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Action failed', type: 'error' })
    } finally {
      setSettingsAction(null)
      setShowSettings(false)
    }
  }

  // Fetch supported races when settings modal opens
  const fetchRaces = async () => {
    setIsLoadingRaces(true)
    try {
      const response = await fetch('/api/orders?list=races')
      if (!response.ok) throw new Error('Failed to fetch races')
      const data = await response.json()
      setRaces(data.races || [])
    } catch (error) {
      console.error('Error fetching races:', error)
    } finally {
      setIsLoadingRaces(false)
    }
  }

  const startEditingRace = (race: typeof races[0]) => {
    const dateStr = race.raceDate ? new Date(race.raceDate).toISOString().split('T')[0] : ''
    setRaceEditValues({
      raceDate: dateStr,
      location: race.location || '',
      weatherCondition: race.weatherCondition ? race.weatherCondition.charAt(0).toUpperCase() + race.weatherCondition.slice(1) : '',
      weatherTemp: race.weatherTemp || ''
    })
    setEditingRaceId(race.id)
  }

  const saveRaceEdit = async (raceId: number) => {
    setIsSavingRace(true)
    try {
      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raceAction: 'update',
          raceId,
          raceData: {
            raceDate: raceEditValues.raceDate || undefined,
            location: raceEditValues.location || undefined,
            weatherCondition: raceEditValues.weatherCondition || undefined,
            weatherTemp: raceEditValues.weatherTemp || undefined,
          }
        })
      })
      if (!response.ok) throw new Error('Failed to update race')
      const result = await response.json()

      // Auto-fetch weather if date + location set but no manual weather
      const hasDate = raceEditValues.raceDate
      const hasLocation = raceEditValues.location
      const weatherManuallySet = raceEditValues.weatherCondition || raceEditValues.weatherTemp
      if (hasDate && hasLocation && !weatherManuallySet && result.race?.id) {
        try {
          await fetch('/api/orders/refresh-weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raceId: result.race.id })
          })
        } catch { /* best effort */ }
      }

      setToast({ message: 'Race updated!', type: 'success' })
      setEditingRaceId(null)
      await fetchRaces()
    } catch (error) {
      console.error('Error saving race:', error)
      setToast({ message: 'Failed to update race', type: 'error' })
    } finally {
      setIsSavingRace(false)
    }
  }

  const createRace = async () => {
    if (!newRaceValues.raceName || !newRaceValues.year || !newRaceValues.raceDate) {
      setToast({ message: 'Race name, year, and date are required', type: 'error' })
      return
    }
    setIsSavingRace(true)
    try {
      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raceAction: 'create',
          raceData: {
            raceName: newRaceValues.raceName,
            year: newRaceValues.year,
            raceDate: newRaceValues.raceDate,
            location: newRaceValues.location || null,
            eventTypes: [],
          }
        })
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to create race')
      }

      // Auto-fetch weather if date + location provided
      const result = await response.json().catch(() => null)
      if (newRaceValues.location && result?.race?.id) {
        try {
          await fetch('/api/orders/refresh-weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raceId: result.race.id })
          })
        } catch { /* best effort */ }
      }

      setToast({ message: 'Race created!', type: 'success' })
      setShowAddRace(false)
      setNewRaceValues({ raceName: '', year: new Date().getFullYear().toString(), raceDate: '', location: '' })
      await fetchRaces()
    } catch (error) {
      console.error('Error creating race:', error)
      setToast({ message: error instanceof Error ? error.message : 'Failed to create race', type: 'error' })
    } finally {
      setIsSavingRace(false)
    }
  }

  useEffect(() => {
    if (!showSettings) return
    fetch('/api/orders/test-scrapers')
      .then(res => res.json())
      .then(data => {
        if (data.races && scraperResults.length === 0) {
          setScraperResults(data.races.map((r: string) => ({ raceName: r, status: 'untested' as const })))
        }
      })
      .catch(() => {})
    fetchRaces()
  }, [showSettings])

  const testScrapers = async () => {
    setIsTestingScrapers(true)
    try {
      const response = await fetch('/api/orders/test-scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!response.ok) throw new Error(`Test failed (${response.status})`)
      const data = await response.json()
      setScraperResults(data.results)
      setToast({
        message: `Scrapers tested: ${data.passed} passed, ${data.failed} failed`,
        type: data.failed > 0 ? 'error' : 'success'
      })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Scraper test failed', type: 'error' })
    } finally {
      setIsTestingScrapers(false)
    }
  }

  // Research a single order
  const researchOrder = async (orderNumber: string) => {
    setIsResearching(true)
    try {
      setToast({ message: 'Researching runner...', type: 'info' })

      const response = await fetch(`/api/orders/research-runner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Research failed')
      }

      const data = await response.json()

      if (data.found) {
        setToast({
          message: `Found! Bib: ${data.results.bibNumber}, Time: ${data.results.officialTime}`,
          type: 'success'
        })
      } else if (data.ambiguous) {
        // Store possible matches for this order so the UI can show "Accept" buttons
        if (data.possibleMatches?.length > 0) {
          setPossibleMatchesMap(prev => ({ ...prev, [orderNumber]: data.possibleMatches }))
          setToast({
            message: `Found ${data.possibleMatches.length} possible match${data.possibleMatches.length > 1 ? 'es' : ''} — please verify`,
            type: 'info'
          })
        } else {
          setToast({
            message: 'Multiple runners found with that name',
            type: 'error'
          })
        }
      } else {
        setToast({
          message: 'Runner not found in race results',
          type: 'error'
        })
      }

      // Fetch fresh data and update both orders list and selected order
      const freshResponse = await fetch(`/api/orders`)
      if (freshResponse.ok) {
        const freshData = await freshResponse.json()
        const freshOrders: Order[] = (freshData.orders || []).map((order: Record<string, unknown>) => {
          const shopifyData = order.shopifyOrderData as Record<string, unknown> | null
          const displayNum = shopifyData?.name as string | undefined
          return {
            id: order.id as string,
            orderNumber: order.orderNumber as string,
            parentOrderNumber: order.parentOrderNumber as string,
            lineItemIndex: order.lineItemIndex as number,
            displayOrderNumber: displayNum || (order.parentOrderNumber as string),
            source: order.source as 'shopify' | 'etsy',
            raceName: order.raceName as string,
            raceYear: order.raceYear as number | null,
            raceDate: order.raceDate as string | undefined,
            raceLocation: order.raceLocation as string | undefined,
            runnerName: order.runnerName as string,
            productSize: order.productSize as string,
            notes: order.notes as string | undefined,
            status: order.status as 'pending' | 'ready' | 'flagged' | 'completed' | 'missing_year',
            createdAt: order.createdAt as string,
            completedAt: order.researchedAt as string | undefined,
            bibNumber: order.bibNumber as string | undefined,
            officialTime: order.officialTime as string | undefined,
            officialPace: order.officialPace as string | undefined,
            eventType: order.eventType as string | undefined,
            researchStatus: order.researchStatus as 'found' | 'not_found' | 'ambiguous' | null,
            researchNotes: order.researchNotes as string | undefined,
            resultsUrl: order.resultsUrl as string | undefined,
            weatherTemp: order.weatherTemp as string | undefined,
            weatherCondition: order.weatherCondition as string | undefined,
            hasScraperAvailable: order.hasScraperAvailable as boolean | undefined,
            yearOverride: order.yearOverride as number | null | undefined,
            raceNameOverride: order.raceNameOverride as string | null | undefined,
            runnerNameOverride: order.runnerNameOverride as string | null | undefined,
            effectiveRaceYear: order.effectiveRaceYear as number | null | undefined,
            effectiveRaceName: order.effectiveRaceName as string | undefined,
            effectiveRunnerName: order.effectiveRunnerName as string | undefined,
            hasOverrides: order.hasOverrides as boolean | undefined,
            trackstarOrderType: order.trackstarOrderType as 'standard' | 'custom' | undefined,
            designStatus: order.designStatus as DesignStatus | undefined,
            dueDate: order.dueDate as string | undefined,
            customerEmail: order.customerEmail as string | undefined,
            customerName: order.customerName as string | undefined,
            bibNumberCustomer: order.bibNumberCustomer as string | undefined,
            timeCustomer: order.timeCustomer as string | undefined,
            creativeDirection: order.creativeDirection as string | undefined,
            isGift: order.isGift as boolean | undefined
          }
        })

        // Update orders list
        setOrders(freshOrders)
        setLastUpdated(new Date())

        // Update selected order with fresh data
        const updatedOrder = freshOrders.find(o => o.orderNumber === orderNumber)
        console.log('[Research] Looking for order:', orderNumber)
        console.log('[Research] Updated order found:', updatedOrder?.orderNumber, 'researchStatus:', updatedOrder?.researchStatus, 'status:', updatedOrder?.status)
        if (updatedOrder) {
          setSelectedOrder(updatedOrder)
        }
      }
    } catch (error) {
      console.error('Error researching order:', error)
      const message = error instanceof Error ? error.message : 'Research failed'
      setToast({ message, type: 'error' })
    } finally {
      setIsResearching(false)
    }
  }

  // Accept a suggested match for an ambiguous result
  const acceptMatch = async (orderNumber: string, match: { name: string; bib: string; time: string; pace?: string; eventType?: string; resultsUrl?: string }) => {
    try {
      setToast({ message: 'Accepting match...', type: 'info' })

      const response = await fetch(`/api/orders/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept-match', orderNumber, match })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to accept match')
      }

      setToast({
        message: `Match accepted: ${match.name} — Bib: ${match.bib}, Time: ${match.time}`,
        type: 'success'
      })

      // Clear possible matches for this order
      setPossibleMatchesMap(prev => {
        const next = { ...prev }
        delete next[orderNumber]
        return next
      })

      // Refresh orders to get updated data
      await fetchOrders()

      // Update selected order with fresh data
      const freshResponse = await fetch(`/api/orders`)
      if (freshResponse.ok) {
        const freshData = await freshResponse.json()
        const freshOrders: Order[] = (freshData.orders || []).map((order: Record<string, unknown>) => {
          const shopifyData = order.shopifyOrderData as Record<string, unknown> | null
          const displayNum = shopifyData?.name as string | undefined
          return {
            id: order.id as string,
            orderNumber: order.orderNumber as string,
            parentOrderNumber: order.parentOrderNumber as string,
            lineItemIndex: order.lineItemIndex as number,
            displayOrderNumber: displayNum || (order.parentOrderNumber as string),
            source: order.source as 'shopify' | 'etsy',
            raceName: order.raceName as string,
            raceYear: order.raceYear as number | null,
            raceDate: order.raceDate as string | undefined,
            raceLocation: order.raceLocation as string | undefined,
            runnerName: order.runnerName as string,
            productSize: order.productSize as string,
            notes: order.notes as string | undefined,
            status: order.status as 'pending' | 'ready' | 'flagged' | 'completed' | 'missing_year',
            createdAt: order.createdAt as string,
            completedAt: order.researchedAt as string | undefined,
            bibNumber: order.bibNumber as string | undefined,
            officialTime: order.officialTime as string | undefined,
            officialPace: order.officialPace as string | undefined,
            eventType: order.eventType as string | undefined,
            researchStatus: order.researchStatus as 'found' | 'not_found' | 'ambiguous' | null,
            researchNotes: order.researchNotes as string | undefined,
            resultsUrl: order.resultsUrl as string | undefined,
            weatherTemp: order.weatherTemp as string | undefined,
            weatherCondition: order.weatherCondition as string | undefined,
            hasScraperAvailable: order.hasScraperAvailable as boolean | undefined,
            yearOverride: order.yearOverride as number | null | undefined,
            raceNameOverride: order.raceNameOverride as string | null | undefined,
            runnerNameOverride: order.runnerNameOverride as string | null | undefined,
            effectiveRaceYear: order.effectiveRaceYear as number | null | undefined,
            effectiveRaceName: order.effectiveRaceName as string | undefined,
            effectiveRunnerName: order.effectiveRunnerName as string | undefined,
            hasOverrides: order.hasOverrides as boolean | undefined,
            trackstarOrderType: order.trackstarOrderType as 'standard' | 'custom' | undefined,
            designStatus: order.designStatus as DesignStatus | undefined,
            dueDate: order.dueDate as string | undefined,
            customerEmail: order.customerEmail as string | undefined,
            customerName: order.customerName as string | undefined,
            bibNumberCustomer: order.bibNumberCustomer as string | undefined,
            timeCustomer: order.timeCustomer as string | undefined,
            creativeDirection: order.creativeDirection as string | undefined,
            isGift: order.isGift as boolean | undefined
          }
        })
        setOrders(freshOrders)
        const updatedOrder = freshOrders.find(o => o.orderNumber === orderNumber)
        if (updatedOrder) {
          setSelectedOrder(updatedOrder)
        }
      }
    } catch (error) {
      console.error('Error accepting match:', error)
      const message = error instanceof Error ? error.message : 'Failed to accept match'
      setToast({ message, type: 'error' })
    }
  }

  // Mark order as completed
  const markAsCompleted = async (orderNumber: string) => {
    try {
      const response = await fetch(`/api/orders/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', orderNumber })
      })

      if (!response.ok) throw new Error('Failed to mark as completed')

      setToast({ message: 'Order marked as completed!', type: 'success' })
      setSelectedOrder(null)
      await fetchOrders()
    } catch (error) {
      console.error('Error completing order:', error)
      setToast({ message: 'Failed to complete order', type: 'error' })
    }
  }

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState<{
    yearOverride: string
    raceNameOverride: string
    runnerNameOverride: string
  }>({ yearOverride: '', raceNameOverride: '', runnerNameOverride: '' })
  const [isSaving, setIsSaving] = useState(false)

  // Weather edit mode state
  const [isEditingWeather, setIsEditingWeather] = useState(false)
  const [weatherEditValues, setWeatherEditValues] = useState<{
    weatherCondition: string
    weatherTemp: string
  }>({ weatherCondition: '', weatherTemp: '' })
  const [isSavingWeather, setIsSavingWeather] = useState(false)

  // Start editing mode
  const startEditing = (order: Order) => {
    setEditValues({
      yearOverride: order.yearOverride?.toString() || order.raceYear?.toString() || '',
      raceNameOverride: order.raceNameOverride || order.raceName || '',
      runnerNameOverride: order.runnerNameOverride || order.runnerName || ''
    })
    setIsEditing(true)
  }

  // Cancel editing
  const cancelEditing = () => {
    setIsEditing(false)
    setEditValues({ yearOverride: '', raceNameOverride: '', runnerNameOverride: '' })
  }

  // Start editing weather
  const startEditingWeather = (order: Order) => {
    setWeatherEditValues({
      weatherCondition: order.weatherCondition || '',
      weatherTemp: order.weatherTemp || ''
    })
    setIsEditingWeather(true)
  }

  // Cancel editing weather
  const cancelEditingWeather = () => {
    setIsEditingWeather(false)
    setWeatherEditValues({ weatherCondition: '', weatherTemp: '' })
  }

  // Save weather edits
  const saveWeather = async (order: Order) => {
    if (!order.raceId) {
      setToast({ message: 'No race data to update', type: 'error' })
      return
    }
    setIsSavingWeather(true)
    try {
      const response = await fetch(`/api/orders/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          raceId: order.raceId,
          weatherTemp: weatherEditValues.weatherTemp || null,
          weatherCondition: weatherEditValues.weatherCondition || null
        })
      })
      if (!response.ok) throw new Error('Failed to save weather')
      setToast({ message: 'Weather updated!', type: 'success' })
      setIsEditingWeather(false)
      await fetchOrders()

      // Update selected order with new data
      const updatedOrders = await fetch(`/api/orders?type=${activeView}`).then(r => r.json())
      const updated = updatedOrders.orders?.find((o: { orderNumber: string }) => o.orderNumber === order.orderNumber)
      if (updated) {
        const shopifyData = updated.shopifyOrderData as Record<string, unknown> | null
        setSelectedOrder({
          ...selectedOrder!,
          ...updated,
          displayOrderNumber: (shopifyData?.name as string) || updated.orderNumber
        })
      }
    } catch (error) {
      console.error('Error saving weather:', error)
      setToast({ message: 'Failed to save weather', type: 'error' })
    } finally {
      setIsSavingWeather(false)
    }
  }

  // Save overrides
  const saveOverrides = async (orderNumber: string, originalOrder: Order) => {
    setIsSaving(true)
    try {
      // Determine what changed (only send overrides if different from original)
      const updates: Record<string, string | number | null> = {}

      const newYear = editValues.yearOverride ? parseInt(editValues.yearOverride, 10) : null
      if (newYear !== originalOrder.raceYear) {
        updates.yearOverride = newYear
      } else if (originalOrder.yearOverride !== null) {
        updates.yearOverride = null // Clear override if matches original
      }

      if (editValues.raceNameOverride !== originalOrder.raceName) {
        updates.raceNameOverride = editValues.raceNameOverride || null
      } else if (originalOrder.raceNameOverride !== null) {
        updates.raceNameOverride = null
      }

      if (editValues.runnerNameOverride !== originalOrder.runnerName) {
        updates.runnerNameOverride = editValues.runnerNameOverride || null
      } else if (originalOrder.runnerNameOverride !== null) {
        updates.runnerNameOverride = null
      }

      const response = await fetch(`/api/orders/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, ...updates })
      })

      if (!response.ok) throw new Error('Failed to save changes')

      setToast({ message: 'Changes saved!', type: 'success' })
      setIsEditing(false)
      await fetchOrders()

      // Update selected order with new data
      const updatedOrders = await fetch(`/api/orders`).then(r => r.json())
      const updated = updatedOrders.orders?.find((o: { orderNumber: string }) => o.orderNumber === orderNumber)
      if (updated) {
        const shopifyData = updated.shopifyOrderData as Record<string, unknown> | null
        setSelectedOrder({
          ...selectedOrder!,
          ...updated,
          displayOrderNumber: (shopifyData?.name as string) || updated.orderNumber
        })
      }
    } catch (error) {
      console.error('Error saving overrides:', error)
      setToast({ message: 'Failed to save changes', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // Close modal and reset edit state
  const closeModal = () => {
    setSelectedOrder(null)
    setIsEditing(false)
    setEditValues({ yearOverride: '', raceNameOverride: '', runnerNameOverride: '' })
  }

  // Fetch orders on mount and when view changes
  useEffect(() => {
    setIsLoading(true)
    fetchOrders()
  }, [fetchOrders])

  // Update design status for custom orders
  const updateDesignStatus = async (orderNumber: string, designStatus: DesignStatus) => {
    try {
      const response = await fetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'design-status', orderNumber, designStatus })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update design status')
      }

      setToast({ message: `Design status updated to ${(DESIGN_STATUS_CONFIG[designStatus] || DESIGN_STATUS_CONFIG.not_started).label}`, type: 'success' })
      await fetchOrders()

      // Update selected order if it's the one we just changed
      if (selectedOrder?.orderNumber === orderNumber) {
        setSelectedOrder(prev => prev ? { ...prev, designStatus } : null)
      }
    } catch (error) {
      console.error('Error updating design status:', error)
      const message = error instanceof Error ? error.message : 'Failed to update design status'
      setToast({ message, type: 'error' })
    }
  }

  // Format due date for display
  const formatDueDate = (dateStr?: string): string => {
    if (!dateStr) return 'N/A'
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (diffDays < 0) return `${formatted} (overdue)`
    if (diffDays === 0) return `${formatted} (today)`
    if (diffDays === 1) return `${formatted} (in 1 day)`
    if (diffDays <= 3) return `${formatted} (in ${diffDays} days)`
    return formatted
  }

  // Check if due date is urgent
  const isDueDateUrgent = (dateStr?: string): boolean => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  }

  // Generate mailto link for custom order email
  const generateEmailLink = (order: Order): string => {
    const customerName = order.customerName || 'there'
    const displayOrderNumber = order.displayOrderNumber || order.orderNumber
    const subject = encodeURIComponent(`Your Trackstar Order #${displayOrderNumber} (Action Required)`)
    const body = encodeURIComponent(
      `Hey ${customerName},\n\nSuper pumped to show you your custom Trackstar print! Let us know which of these designs you prefer or if there are any tweaks you want us to make before sending it to production!\n\n`
    )
    const cc = encodeURIComponent('danielkeith.currie@gmail.com')
    return `mailto:${order.customerEmail || ''}?cc=${cc}&subject=${subject}&body=${body}`
  }

  // Designs to be personalized
  // Standard view: pending + flagged + ready + missing_year, sorted newest first
  // Custom view: all items where designStatus !== 'sent_to_production', sorted oldest first (by due date)
  const ordersToFulfill = useMemo(() => {
    // Guard: ensure orders match the active view type to prevent cross-contamination
    const typeFiltered = orders.filter(o => (o.trackstarOrderType || 'standard') === activeView)
    if (activeView === 'custom') {
      // Custom view: show all non-done designs, sorted by due date ascending (oldest/most urgent first)
      const customOrders = typeFiltered.filter(o => o.designStatus !== 'sent_to_production')
      return customOrders.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        return dateA - dateB
      })
    }
    // Standard view: filter by status, newest first
    const fulfillOrders = typeFiltered.filter(o =>
      o.status === 'flagged' || o.status === 'ready' || o.status === 'pending' || o.status === 'missing_year'
    )
    return fulfillOrders.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
  }, [orders, activeView])

  const completedOrders = useMemo(() => {
    // Guard: ensure orders match the active view type
    const typeFiltered = orders.filter(o => (o.trackstarOrderType || 'standard') === activeView)
    if (activeView === 'custom') {
      return typeFiltered.filter(o => o.designStatus === 'sent_to_production')
    }
    return typeFiltered.filter(o => o.status === 'completed')
  }, [orders, activeView])

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return ordersToFulfill
    const query = searchQuery.toLowerCase()
    return ordersToFulfill.filter(o =>
      o.orderNumber.toLowerCase().includes(query) ||
      o.displayOrderNumber.toLowerCase().includes(query) ||
      o.parentOrderNumber.toLowerCase().includes(query) ||
      o.raceName.toLowerCase().includes(query) ||
      o.runnerName.toLowerCase().includes(query)
    )
  }, [ordersToFulfill, searchQuery])

  // Helper to check if an order has multiple items
  const getOrderItemCount = useCallback((parentOrderNumber: string) => {
    return orders.filter(o => o.parentOrderNumber === parentOrderNumber).length
  }, [orders])

  const handleCopyEmail = (order: Order) => {
    const emailText = `Hi,

I'm reaching out regarding order ${order.orderNumber} for ${order.runnerName}'s ${order.raceName} ${order.raceYear} print.

${order.flagReason}

Could you please verify the runner's name and race details?

Thank you!`
    navigator.clipboard.writeText(emailText)
  }

  // Get status icon and color for table
  const getStatusDisplay = (order: Order) => {
    if (order.status === 'flagged') return { icon: '⚠️', label: 'Flagged' }
    if (order.status === 'missing_year') return { icon: '📅', label: 'Missing Year' }
    if (order.status === 'ready') return { icon: '✅', label: 'Ready' }
    if (order.researchStatus === 'found') return { icon: '✅', label: 'Researched' }
    if (order.hasScraperAvailable) return { icon: '🔍', label: 'Can Research' }
    return { icon: '⏳', label: 'Pending' }
  }

  // Generate race shorthand for filename
  const getRaceShorthand = (raceName: string): string => {
    if (!raceName) return 'Race'

    // Common race name mappings
    const shorthandMap: { [key: string]: string } = {
      'Surf City Marathon': 'Surf City',
      'Mesa Marathon': 'Mesa',
      'Berlin Marathon': 'Berlin',
      'Denver Colfax Marathon': 'Colfax',
      'Miami Marathon': 'Miami',
      'Buffalo Marathon': 'Buffalo',
      'Twin Cities Marathon': 'Twin Cities',
      'Louisiana Marathon': 'Louisiana',
      'Austin Marathon': 'Austin',
      'Ascension Seton Austin Marathon': 'Austin',
      'Army Ten Miler': 'ATM',
      'Detroit Marathon': 'Detroit',
      'Columbus Marathon': 'Columbus',
      'Pittsburgh Marathon': 'Pittsburgh',
      'Grandma\'s Marathon': 'Grandma\'s',
      'Houston Marathon': 'Houston',
      'Dallas Marathon': 'Dallas',
      'California International Marathon': 'CIM',
      'Palm Beaches Marathon': 'Palm Beaches',
      'New York City Marathon': 'NYC',
      'Baltimore Marathon': 'Baltimore',
      'Philadelphia Marathon': 'Philly',
      'San Antonio Marathon': 'San Antonio',
      'Kiawah Island Marathon': 'Kiawah',
      'Honolulu Marathon': 'Honolulu',
      'Marine Corps Marathon': 'MCM',
      'Chicago Marathon': 'Chicago',
      'Air Force Marathon': 'Air Force',
      'San Francisco Marathon': 'SF',
      'Jackson Hole Marathon': 'Jackson Hole',
      'Sydney Marathon': 'Sydney',
      // Alternate name formats
      'TCS New York City Marathon': 'NYC',
      'Bank of America Chicago Marathon': 'Chicago',
      'Marine Corps': 'MCM',
    }

    // Check for exact match
    if (shorthandMap[raceName]) {
      return shorthandMap[raceName]
    }

    // Generate acronym from race name
    // Remove common words and take initials
    const words = raceName
      .replace(/Marathon|Half Marathon|10K|5K|Race|Ultra|Trail/gi, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)

    if (words.length === 0) {
      // If no words left, just use first 3 letters of original name
      return raceName.slice(0, 3).toUpperCase()
    }

    // Take first letter of each word (up to 4 letters for acronym)
    return words
      .slice(0, 4)
      .map(word => word[0].toUpperCase())
      .join('')
  }

  // Generate filename for order
  const generateFilename = (order: Order): string => {
    const displayOrderNumber = order.displayOrderNumber || order.orderNumber
    const raceName = order.effectiveRaceName || order.raceName
    const runnerName = order.effectiveRunnerName || order.runnerName

    // Get race shorthand
    const raceShort = getRaceShorthand(raceName)

    // Get last name from runner name
    const nameParts = runnerName.trim().split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    const suffix = order.trackstarOrderType === 'custom' ? '_Custom' : ''
    return `${displayOrderNumber}_${raceShort}_${lastName}${suffix}.pdf`
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f3f3f3] flex flex-col">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-12 w-full flex flex-col h-full">
        {/* Header - Left-aligned with compact vertical space */}
        <div className="pt-6 md:pt-8 lg:pt-10 pb-4 md:pb-6 flex items-end justify-between gap-6 flex-shrink-0">
          {/* Left side: logo, greeting, and summary */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/trackstar-logo.png"
                alt="Trackstar"
                className="h-10 md:h-11"
              />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-[40px] font-bold text-off-black mb-1">
                {getGreeting(activeView === 'custom' ? 'America/New_York' : 'America/Costa_Rica')}, {activeView === 'custom' ? 'Dan' : 'Elí'}
              </h1>
              <p className="text-sm md:text-base text-off-black/60">
                Last updated {formatLastUpdated(lastUpdated)}
              </p>
            </div>
          </div>

          {/* Right side: primary actions, right-aligned */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={importOrders}
                disabled={isImporting}
                className="inline-flex items-center gap-2 px-3 md:px-6 py-2.5 bg-off-black text-white rounded-md hover:opacity-90 transition-opacity font-medium text-xs md:text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isImporting ? 'Importing…' : 'Import New Orders'}
              </button>
            </div>
            <div className="hidden md:flex flex-col items-end gap-1">
              <a
                href="https://www.artelo.io/app/orders?tab=ACTION_REQUIRED"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-off-black/40 hover:text-off-black/70 transition-colors"
              >
                Go to Artelo Orders &rarr;
              </a>
              <a
                href="https://admin.shopify.com/store/flickman-3247/orders"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-off-black/40 hover:text-off-black/70 transition-colors"
              >
                Go to Shopify Orders &rarr;
              </a>
            </div>
          </div>
        </div>

        {/* Orders to Personalize Section */}
        {!isLoading && (
        <section className="flex-1 flex flex-col min-h-0 pb-4">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-off-black uppercase tracking-tight">
                {activeView === 'standard' ? 'Designs to be Personalized' : 'Custom Designs'}
              </h2>
              <span className="px-2.5 py-1 bg-off-black/10 text-off-black/60 text-sm font-medium rounded">
                {ordersToFulfill.length}
              </span>
            </div>
            {/* View Switcher */}
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveView('standard'); setSearchQuery('') }}
                className={`px-5 py-2 text-sm font-medium rounded-full transition-colors border ${
                  activeView === 'standard'
                    ? 'bg-off-black text-white border-off-black'
                    : 'bg-white text-off-black border-border-gray hover:bg-subtle-gray'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => { setActiveView('custom'); setSearchQuery('') }}
                className={`px-5 py-2 text-sm font-medium rounded-full transition-colors border ${
                  activeView === 'custom'
                    ? 'bg-off-black text-white border-off-black'
                    : 'bg-white text-off-black border-border-gray hover:bg-subtle-gray'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white border border-border-gray rounded-lg shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
            {/* Search inside card */}
            <div className="p-4 border-b border-border-gray flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
                <input
                  type="text"
                  placeholder={activeView === 'standard' ? "Search by order #, race, or runner..." : "Search custom designs..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-subtle-gray border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30 transition-colors"
                />
              </div>
            </div>

            {/* Scrollable Table Container */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full">
                {activeView === 'standard' ? (
                  <>
                    {/* Standard Orders Table */}
                    <thead className="bg-subtle-gray border-b border-border-gray sticky top-0 z-10">
                      <tr>
                        <th className="text-center pl-6 pr-2 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-12">Src</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Order #</th>
                        <th className="text-center px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-20">Status</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Runner</th>
                        <th className="text-left px-3 pr-6 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden md:table-cell">Race</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-gray">
                      {filteredOrders.map((order, index) => {
                        const statusDisplay = getStatusDisplay(order)
                        const itemCount = getOrderItemCount(order.parentOrderNumber)
                        return (
                          <tr
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className={`hover:bg-subtle-gray cursor-pointer transition-colors ${index % 2 === 1 ? 'bg-subtle-gray/30' : ''}`}
                          >
                            <td className="pl-6 pr-2 py-5 text-center">
                              <img
                                src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                                alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                title={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                className="w-5 h-5 inline-block"
                              />
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                                {itemCount > 1 && (
                                  <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                    Item {order.lineItemIndex + 1} of {itemCount}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-5 text-center">
                              <span className="text-lg" title={statusDisplay.label}>
                                {statusDisplay.icon}
                              </span>
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                                {order.hasOverrides && (
                                  <span className="px-1 py-0.5 bg-blue-100 text-blue-600 text-[9px] rounded">edited</span>
                                )}
                              </div>
                              {order.status === 'flagged' && order.flagReason && (
                                <p className="text-xs text-warning-amber mt-1 leading-tight">{order.flagReason}</p>
                              )}
                              {order.status === 'missing_year' && !order.yearOverride && (
                                <p className="text-xs text-warning-amber mt-1 leading-tight">Year Missing</p>
                              )}
                              {order.status === 'ready' && order.bibNumber && (
                                <p className="text-xs text-green-600 mt-1 leading-tight">Bib: {order.bibNumber} • {order.officialTime}</p>
                              )}
                              {order.status === 'pending' && order.hasScraperAvailable && (order.effectiveRaceYear || order.raceYear) && (
                                <p className="text-xs text-blue-600 mt-1 leading-tight">Ready to research</p>
                              )}
                              {order.status === 'pending' && !order.hasScraperAvailable && (
                                <p className="text-xs text-off-black/40 mt-1 leading-tight">Manual research needed</p>
                              )}
                            </td>
                            <td className="px-3 pr-6 py-5 text-sm text-off-black/60 hidden md:table-cell">
                              {order.effectiveRaceName || order.raceName} {order.effectiveRaceYear || order.raceYear}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </>
                ) : (
                  <>
                    {/* Custom Designs Table */}
                    <thead className="bg-subtle-gray border-b border-border-gray sticky top-0 z-10">
                      <tr>
                        <th className="text-center pl-6 pr-2 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-12">Src</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-32">Design Status</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Order #</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Due Date</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden md:table-cell">Runner</th>
                        <th className="text-left px-3 pr-6 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden lg:table-cell">Race</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-gray">
                      {filteredOrders.map((order, index) => {
                        const designConfig = DESIGN_STATUS_CONFIG[order.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.not_started
                        const itemCount = getOrderItemCount(order.parentOrderNumber)
                        return (
                          <tr
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className={`hover:bg-subtle-gray cursor-pointer transition-colors ${index % 2 === 1 ? 'bg-subtle-gray/30' : ''}`}
                          >
                            <td className="pl-6 pr-2 py-5 text-center">
                              <img
                                src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                                alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                title={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                className="w-5 h-5 inline-block"
                              />
                            </td>
                            <td className="px-3 py-5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${designConfig.bgColor} ${designConfig.color}`}>
                                <span>{designConfig.icon}</span>
                                {designConfig.label}
                              </span>
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                                {itemCount > 1 && (
                                  <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                    Item {order.lineItemIndex + 1} of {itemCount}
                                  </span>
                                )}
                                {order.isGift && (
                                  <span className="px-1.5 py-0.5 bg-pink-50 text-pink-600 text-[10px] font-medium rounded">🎁 Gift</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-5">
                              <span className={`text-sm ${isDueDateUrgent(order.dueDate) ? 'text-red-600 font-medium' : 'text-off-black'}`}>
                                {formatDueDate(order.dueDate)}
                              </span>
                            </td>
                            <td className="px-3 py-5 hidden md:table-cell">
                              <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                            </td>
                            <td className="px-3 pr-6 py-5 text-sm text-off-black/60 hidden lg:table-cell">
                              <span className="line-clamp-1">{order.effectiveRaceName || order.raceName || '—'}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </>
                )}
              </table>

              {filteredOrders.length === 0 && (
                <div className="text-center py-16 text-off-black/40 text-sm">
                  {searchQuery ? 'No matching orders found' : activeView === 'standard' ? 'No orders to personalize' : 'No custom designs'}
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* Bottom bar: Completed Orders Toggle + Settings */}
        {!isLoading && (
          <div className="flex-shrink-0 py-4 mt-2 mb-8 border-t border-border-gray/50">
            <div className="flex items-center justify-center gap-3">
              {completedOrders.length > 0 && (
                <button
                  onClick={() => setShowCompleted(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-border-gray rounded-full shadow-sm text-sm text-off-black/70 hover:bg-subtle-gray transition-colors"
                >
                  <span>{showCompleted ? 'Close Completed Orders' : 'View Completed Orders'}</span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-off-black/5 text-off-black/60">
                    {completedOrders.length}
                  </span>
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                title="Settings & cache management"
                className="p-2 text-off-black/30 hover:text-off-black/60 transition-colors rounded-full hover:bg-off-black/5"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Completed Orders Section (Modal-style) */}
        {showCompleted && (
          <div
            className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-40"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowCompleted(false)
              }
            }}
          >
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border-gray">
                <h2 className="text-lg font-semibold text-off-black">Completed Orders</h2>
                <button
                  onClick={() => setShowCompleted(false)}
                  className="text-off-black/40 hover:text-off-black text-2xl leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full">
                  <thead className="bg-subtle-gray border-b border-border-gray sticky top-0">
                    <tr>
                      <th className="text-center pl-6 pr-2 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-12">Src</th>
                      <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Order #</th>
                      <th className="text-center px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-20">Status</th>
                      <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Runner</th>
                      <th className="text-left px-3 pr-6 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider hidden md:table-cell">Race</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-gray">
                    {completedOrders.map((order, index) => (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className={`hover:bg-subtle-gray cursor-pointer transition-colors ${index % 2 === 1 ? 'bg-subtle-gray/30' : ''}`}
                      >
                        <td className="pl-6 pr-2 py-5 text-center">
                          <img
                            src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                            alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                            title={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                            className="w-5 h-5 inline-block"
                          />
                        </td>
                        <td className="px-3 py-5">
                          <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                        </td>
                        <td className="px-3 py-5 text-center">
                          <span className="text-lg">✅</span>
                        </td>
                        <td className="px-3 py-5 text-sm text-off-black">
                          {order.runnerName}
                        </td>
                        <td className="px-3 pr-6 py-5 text-sm text-off-black/60 hidden md:table-cell">
                          {order.raceName} {order.raceYear}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {completedOrders.length === 0 && (
                  <div className="text-center py-16 text-off-black/40 text-sm">
                    No completed orders yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div
            className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-gray">
                <h2 className="text-base font-semibold text-off-black">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none">×</button>
              </div>

              {/* Navigation cards */}
              <div className="p-6 space-y-3">
                <button
                  onClick={() => setShowRaceDatabase(true)}
                  className="w-full rounded-lg border border-border-gray bg-subtle-gray p-4 hover:bg-off-black/[0.06] transition-colors text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-black">Race Database</p>
                      <p className="text-xs mt-0.5 text-off-black/50">Manage race dates, locations, and weather</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-off-black/30">{races.length} {races.length === 1 ? 'race' : 'races'}</span>
                      <ChevronRight className="w-4 h-4 text-off-black/30 group-hover:text-off-black/50 transition-colors" />
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setShowScraperStatus(true)}
                  className="w-full rounded-lg border border-border-gray bg-subtle-gray p-4 hover:bg-off-black/[0.06] transition-colors text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-black">Scraper Status</p>
                      <p className="text-xs mt-0.5 text-off-black/50">Test and monitor race result scrapers</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-off-black/30">{scraperResults.length} {scraperResults.length === 1 ? 'scraper' : 'scrapers'}</span>
                      <ChevronRight className="w-4 h-4 text-off-black/30 group-hover:text-off-black/50 transition-colors" />
                    </div>
                  </div>
                </button>
              </div>

              {/* Danger zone */}
              <div className="border-t border-border-gray p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-700">Clear Runner Research</p>
                      <p className="text-xs mt-0.5 text-red-500">Deletes all cached bib, time, and pace data. All orders go back to &quot;Ready to research&quot;. Use after fixing a scraper bug.</p>
                    </div>
                    <button
                      onClick={() => runSettingsAction('clear-research')}
                      disabled={settingsAction !== null}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-700"
                    >
                      {settingsAction === 'clear-research' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {settingsAction === 'clear-research' ? 'Running…' : 'Run'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Race Database Full-Screen Overlay */}
        {showRaceDatabase && (
          <div
            className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowRaceDatabase(false) }}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-gray flex-shrink-0">
                <h2 className="text-base font-semibold text-off-black">Race Database</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowAddRace(!showAddRace)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-off-black text-white hover:opacity-80 transition-colors"
                  >
                    {showAddRace ? 'Cancel' : '+ Add Race'}
                  </button>
                  <button onClick={() => setShowRaceDatabase(false)} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Add Race Form */}
                {showAddRace && (
                  <div className="mb-4 p-4 bg-subtle-gray border border-border-gray rounded-lg space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Race Name"
                        value={newRaceValues.raceName}
                        onChange={(e) => setNewRaceValues(prev => ({ ...prev, raceName: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                      />
                      <input
                        type="number"
                        placeholder="Year"
                        value={newRaceValues.year}
                        onChange={(e) => setNewRaceValues(prev => ({ ...prev, year: e.target.value }))}
                        className="w-24 px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newRaceValues.raceDate}
                        onChange={(e) => setNewRaceValues(prev => ({ ...prev, raceDate: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                      />
                      <input
                        type="text"
                        placeholder="Location (e.g. Boston, MA)"
                        value={newRaceValues.location}
                        onChange={(e) => setNewRaceValues(prev => ({ ...prev, location: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                      />
                    </div>
                    <button
                      onClick={createRace}
                      disabled={isSavingRace}
                      className="w-full px-3 py-2 rounded-md text-sm font-medium bg-off-black text-white hover:opacity-80 transition-colors disabled:opacity-50"
                    >
                      {isSavingRace ? 'Creating...' : 'Create Race'}
                    </button>
                  </div>
                )}

                {/* Race List */}
                {isLoadingRaces ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-off-black/40" />
                  </div>
                ) : races.length === 0 ? (
                  <p className="text-sm text-off-black/40 text-center py-8">No races in database</p>
                ) : (
                  <div className="space-y-2">
                    {races.map((race) => (
                      <div key={race.id} className="py-3 px-4 rounded-lg bg-subtle-gray border border-border-gray">
                        {editingRaceId === race.id ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-off-black">{race.raceName} {race.year}</span>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => saveRaceEdit(race.id)}
                                  disabled={isSavingRace}
                                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                                >
                                  {isSavingRace ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingRaceId(null)}
                                  className="flex items-center gap-1 text-xs text-off-black/50 hover:text-off-black/70 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-off-black/50 block mb-1">Date</label>
                                <input
                                  type="date"
                                  value={raceEditValues.raceDate}
                                  onChange={(e) => setRaceEditValues(prev => ({ ...prev, raceDate: e.target.value }))}
                                  className="w-full px-3 py-1.5 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-off-black/50 block mb-1">Location</label>
                                <input
                                  type="text"
                                  value={raceEditValues.location}
                                  onChange={(e) => setRaceEditValues(prev => ({ ...prev, location: e.target.value }))}
                                  placeholder="e.g. Austin, TX"
                                  className="w-full px-3 py-1.5 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-off-black/50 block mb-1">Weather</label>
                                <select
                                  value={raceEditValues.weatherCondition}
                                  onChange={(e) => setRaceEditValues(prev => ({ ...prev, weatherCondition: e.target.value }))}
                                  className="w-full px-3 py-1.5 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                                >
                                  <option value="">--</option>
                                  <option value="Sunny">Sunny</option>
                                  <option value="Cloudy">Cloudy</option>
                                  <option value="Rainy">Rainy</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-off-black/50 block mb-1">Temp</label>
                                <input
                                  type="text"
                                  value={raceEditValues.weatherTemp}
                                  onChange={(e) => setRaceEditValues(prev => ({ ...prev, weatherTemp: e.target.value }))}
                                  placeholder="e.g. 65°F"
                                  className="w-full px-3 py-1.5 text-sm border border-border-gray rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-off-black">{race.raceName}</span>
                              <span className="text-sm text-off-black/40 ml-2">{race.year}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-off-black/50">
                              {race.raceDate && <span>{new Date(race.raceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                              {race.location && <span>{race.location}</span>}
                              {race.weatherCondition && <span>{race.weatherCondition.charAt(0).toUpperCase() + race.weatherCondition.slice(1)}</span>}
                              {race.weatherTemp && <span>{race.weatherTemp}</span>}
                              <button
                                onClick={() => startEditingRace(race)}
                                className="text-blue-600 hover:text-blue-700 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scraper Status Full-Screen Overlay */}
        {showScraperStatus && (
          <div
            className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowScraperStatus(false) }}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-gray flex-shrink-0">
                <h2 className="text-base font-semibold text-off-black">Scraper Status</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={testScrapers}
                    disabled={isTestingScrapers || settingsAction !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-off-black text-white hover:opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTestingScrapers && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isTestingScrapers ? 'Testing...' : 'Test All Scrapers'}
                  </button>
                  <button onClick={() => setShowScraperStatus(false)} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none">×</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Legend */}
                <div className="flex items-center gap-4 mb-4 text-[11px] text-off-black/50">
                  <span>Each scraper is tested in two stages:</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Race Info</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Runner Lookup</span>
                </div>
                <div className="space-y-2">
                  {scraperResults.map((result) => (
                    <div key={result.raceName} className="py-3 px-4 rounded-lg bg-subtle-gray border border-border-gray">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-off-black">{result.raceName}</span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          result.status === 'pass' ? 'text-green-600' :
                          result.status === 'fail' ? 'text-red-600' :
                          'text-off-black/40'
                        }`}>
                          {result.status === 'pass' && <Check className="w-3.5 h-3.5" />}
                          {result.status === 'fail' && <X className="w-3.5 h-3.5" />}
                          {result.status === 'untested' ? 'Not tested' : `${((result.durationMs || 0) / 1000).toFixed(1)}s`}
                        </span>
                      </div>
                      {/* Detail row — only shown after test runs */}
                      {result.status !== 'untested' && (
                        <div className="flex items-center gap-4 mt-2 text-[11px]">
                          <span className={`inline-flex items-center gap-1 ${
                            result.raceInfoStatus === 'pass' ? 'text-green-600' :
                            result.raceInfoStatus === 'fail' ? 'text-red-600' : 'text-off-black/40'
                          }`}>
                            {result.raceInfoStatus === 'pass' ? <Check className="w-3 h-3" /> : result.raceInfoStatus === 'fail' ? <X className="w-3 h-3" /> : null}
                            Race Info
                            {result.raceInfoStatus === 'fail' && result.error && (
                              <span className="text-red-400 ml-1">— {result.error.substring(0, 30)}</span>
                            )}
                          </span>
                          <span className={`inline-flex items-center gap-1 ${
                            result.runnerSearchStatus === 'pass' ? 'text-green-600' :
                            result.runnerSearchStatus === 'fail' ? 'text-red-600' :
                            result.runnerSearchStatus === 'skipped' ? 'text-amber-500' : 'text-off-black/40'
                          }`}>
                            {result.runnerSearchStatus === 'pass' ? <Check className="w-3 h-3" /> :
                             result.runnerSearchStatus === 'fail' ? <X className="w-3 h-3" /> : null}
                            Runner Lookup
                            {result.runnerSearchStatus === 'skipped' && (
                              <span className="text-amber-400 ml-1">— no test runner in DB</span>
                            )}
                            {result.runnerSearchStatus === 'fail' && result.runnerSearchError && (
                              <span className="text-red-400 ml-1">— {result.runnerSearchError.substring(0, 40)}</span>
                            )}
                            {result.runnerSearchStatus === 'pass' && result.testRunnerName && (
                              <span className="text-off-black/30 ml-1">({result.testRunnerName})</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-off-black/40" />
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrder && (
          <div
            className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
            onClick={(e) => {
              // Close modal when clicking on backdrop (not modal content)
              if (e.target === e.currentTarget && !isEditing) {
                closeModal()
              }
            }}
          >
            <div className="bg-white rounded-md max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {selectedOrder.trackstarOrderType === 'custom'
                        ? (DESIGN_STATUS_CONFIG[selectedOrder.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.not_started).icon
                        : selectedOrder.status === 'flagged' ? '⚠️' :
                          selectedOrder.status === 'completed' ? '✅' :
                          selectedOrder.status === 'missing_year' ? '📅' :
                          selectedOrder.status === 'ready' ? '✅' :
                          selectedOrder.researchStatus === 'found' ? '✅' : '⏳'}
                    </span>
                    <h3 className="text-heading-md text-off-black">
                      Order {selectedOrder.displayOrderNumber}
                    </h3>
                    {selectedOrder.trackstarOrderType === 'custom' && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                        custom
                      </span>
                    )}
                    {selectedOrder.hasOverrides && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        edited
                      </span>
                    )}
                  </div>
                  <button
                    onClick={closeModal}
                    className="text-off-black/40 hover:text-off-black text-2xl leading-none transition-colors"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-5">

                  {/* ========== CUSTOM ORDER DETAIL VIEW ========== */}
                  {selectedOrder.trackstarOrderType === 'custom' ? (
                    <>
                      {/* Design Status Dropdown */}
                      <div>
                        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Design Status</h4>
                        <div className="relative">
                          <select
                            value={DESIGN_STATUS_CONFIG[selectedOrder.designStatus as DesignStatus] ? selectedOrder.designStatus : 'not_started'}
                            onChange={(e) => updateDesignStatus(selectedOrder.orderNumber, e.target.value as DesignStatus)}
                            className={`w-full appearance-none px-3 py-2.5 pr-8 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                              (DESIGN_STATUS_CONFIG[selectedOrder.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.not_started).bgColor
                            } ${
                              (DESIGN_STATUS_CONFIG[selectedOrder.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.not_started).color
                            } border-border-gray focus:outline-none focus:ring-2 focus:ring-off-black/20`}
                          >
                            {(Object.entries(DESIGN_STATUS_CONFIG) as [DesignStatus, typeof DESIGN_STATUS_CONFIG[DesignStatus]][]).map(([status, config]) => (
                              <option key={status} value={status}>
                                {config.icon} {config.label}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <svg className="h-4 w-4 text-off-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Due Date & Product Info */}
                      <div>
                        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Order Info</h4>
                        <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Due Date</span>
                            <span className={`text-body-sm font-medium ${isDueDateUrgent(selectedOrder.dueDate) ? 'text-red-600' : 'text-off-black'}`}>
                              {formatDueDate(selectedOrder.dueDate)}
                            </span>
                          </div>
                          <StaticField label="Size" value={selectedOrder.productSize} />
                          <CopyableField label="Filename" value={generateFilename(selectedOrder)} />
                          {selectedOrder.isGift && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-off-black/60">Gift Order</span>
                              <span className="text-body-sm font-medium text-pink-600">🎁 Yes</span>
                            </div>
                          )}
                          {selectedOrder.customerEmail && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-off-black/60">Customer Email</span>
                              <span className="text-body-sm font-medium text-off-black">{selectedOrder.customerEmail}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Customer-Provided Data */}
                      <div>
                        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Customer Details</h4>
                        <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                          <CopyableField label="Runner" value={selectedOrder.effectiveRunnerName || selectedOrder.runnerName || 'Unknown'} />
                          <CopyableField label="Race" value={selectedOrder.effectiveRaceName || selectedOrder.raceName || 'Custom'} />
                          <StaticField label="Year" value={String(selectedOrder.effectiveRaceYear || selectedOrder.raceYear || 'N/A')} />
                          {selectedOrder.bibNumberCustomer && (
                            <CopyableField label="Bib #" value={selectedOrder.bibNumberCustomer} />
                          )}
                          {selectedOrder.timeCustomer && (
                            <CopyableField label="Time" value={selectedOrder.timeCustomer} />
                          )}
                        </div>
                      </div>

                      {/* Creative Direction */}
                      {selectedOrder.creativeDirection && (
                        <div>
                          <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Creative Direction</h4>
                          <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
                            <p className="text-body-sm text-purple-800 whitespace-pre-wrap">{selectedOrder.creativeDirection}</p>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {selectedOrder.notes && (
                        <div>
                          <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Notes</h4>
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                            <p className="text-body-sm text-blue-800 whitespace-pre-wrap">{selectedOrder.notes}</p>
                          </div>
                        </div>
                      )}

                      {/* Actions for Custom Designs */}
                      <div className="flex gap-3 pt-3">
                        {/* Email Customer button - show when production files are made */}
                        {selectedOrder.designStatus === 'concepts_done' && selectedOrder.customerEmail && (
                          <a
                            href={generateEmailLink(selectedOrder)}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
                          >
                            <Mail className="w-4 h-4" />
                            Email Customer
                          </a>
                        )}
                        {selectedOrder.designStatus !== 'sent_to_production' ? (
                          <button
                            onClick={() => updateDesignStatus(selectedOrder.orderNumber, 'sent_to_production')}
                            className="flex-1 px-5 py-3 bg-off-black text-white rounded-md hover:opacity-90 transition-opacity font-medium"
                          >
                            Send to Production
                          </button>
                        ) : (
                          <button
                            onClick={() => updateDesignStatus(selectedOrder.orderNumber, 'not_started')}
                            className="flex-1 px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors font-medium"
                          >
                            Mark as Not Started
                          </button>
                        )}
                        <button
                          onClick={closeModal}
                          className="px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                  {/* ========== STANDARD ORDER DETAIL VIEW ========== */}
                  {/* Product Info */}
                  <div>
                    <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Product Info</h4>
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      <StaticField label="Size" value={selectedOrder.productSize} />
                      <CopyableField label="Filename" value={generateFilename(selectedOrder)} />
                    </div>
                  </div>

                  {/* Editable Order Info */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight">Order Details</h4>
                      {!isEditing && selectedOrder.status !== 'completed' && (
                        <button
                          onClick={() => startEditing(selectedOrder)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                      {isEditing && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveOverrides(selectedOrder.orderNumber, selectedOrder)}
                            disabled={isSaving}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="flex items-center gap-1 text-xs text-off-black/50 hover:text-off-black/70 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      {/* Runner Name - Editable */}
                      {isEditing ? (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Runner</span>
                          <input
                            type="text"
                            value={editValues.runnerNameOverride}
                            onChange={(e) => setEditValues({ ...editValues, runnerNameOverride: e.target.value })}
                            className="text-body-sm font-medium text-off-black bg-white border border-border-gray rounded px-2 py-1 w-48 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Runner</span>
                          <div className="flex items-center gap-2">
                            <span className="text-body-sm font-medium text-off-black">
                              {selectedOrder.effectiveRunnerName || selectedOrder.runnerName}
                            </span>
                            {selectedOrder.runnerNameOverride && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded">edited</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Race Name - Editable */}
                      {isEditing ? (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Race</span>
                          <input
                            type="text"
                            value={editValues.raceNameOverride}
                            onChange={(e) => setEditValues({ ...editValues, raceNameOverride: e.target.value })}
                            className="text-body-sm font-medium text-off-black bg-white border border-border-gray rounded px-2 py-1 w-48 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Race</span>
                          <div className="flex items-center gap-2">
                            <span className="text-body-sm font-medium text-off-black">
                              {selectedOrder.effectiveRaceName || selectedOrder.raceName}
                            </span>
                            {selectedOrder.raceNameOverride && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded">edited</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Year - Editable */}
                      {isEditing ? (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Year</span>
                          <input
                            type="number"
                            value={editValues.yearOverride}
                            onChange={(e) => setEditValues({ ...editValues, yearOverride: e.target.value })}
                            className="text-body-sm font-medium text-off-black bg-white border border-border-gray rounded px-2 py-1 w-24 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="2000"
                            max="2030"
                          />
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Year</span>
                          <div className="flex items-center gap-2">
                            {(selectedOrder.effectiveRaceYear || selectedOrder.raceYear) ? (
                              <span className="text-body-sm font-medium text-off-black">
                                {selectedOrder.effectiveRaceYear || selectedOrder.raceYear}
                              </span>
                            ) : (
                              <span className="text-body-sm text-warning-amber font-medium">Missing</span>
                            )}
                            {selectedOrder.yearOverride && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] rounded">edited</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Race Info, Research, Notes */}
                  <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight">Race Data</h4>
                      {!isEditingWeather && selectedOrder.raceId && (
                        <button
                          onClick={() => startEditingWeather(selectedOrder)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                      {isEditingWeather && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveWeather(selectedOrder)}
                            disabled={isSavingWeather}
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                          >
                            {isSavingWeather ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Save
                          </button>
                          <button
                            onClick={cancelEditingWeather}
                            className="flex items-center gap-1 text-xs text-off-black/50 hover:text-off-black/70 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      {selectedOrder.eventType ? (
                        <StaticField label="Event" value={selectedOrder.eventType} />
                      ) : selectedOrder.hasScraperAvailable ? (
                        <PendingField label="Event" />
                      ) : (
                        <NotAvailableField label="Event" />
                      )}
                      {selectedOrder.raceDate ? (
                        <CopyableField label="Date" value={selectedOrder.raceDate} />
                      ) : selectedOrder.hasScraperAvailable ? (
                        <PendingField label="Date" />
                      ) : (
                        <NotAvailableField label="Date" />
                      )}
                      {isEditingWeather ? (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Weather</span>
                          <select
                            value={weatherEditValues.weatherCondition}
                            onChange={(e) => setWeatherEditValues(prev => ({ ...prev, weatherCondition: e.target.value }))}
                            className="w-40 px-2 py-1 text-sm text-right border border-border-gray rounded bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                          >
                            <option value="">--</option>
                            <option value="Sunny">Sunny</option>
                            <option value="Cloudy">Cloudy</option>
                            <option value="Rainy">Rainy</option>
                          </select>
                        </div>
                      ) : selectedOrder.weatherCondition ? (
                        <CopyableField label="Weather" value={selectedOrder.weatherCondition} />
                      ) : (
                        <PendingField label="Weather" />
                      )}
                      {isEditingWeather ? (
                        <div className="flex justify-between items-center">
                          <span className="text-body-sm text-off-black/60">Temp</span>
                          <input
                            type="text"
                            value={weatherEditValues.weatherTemp}
                            onChange={(e) => setWeatherEditValues(prev => ({ ...prev, weatherTemp: e.target.value }))}
                            placeholder="e.g. 65°F"
                            className="w-40 px-2 py-1 text-sm text-right border border-border-gray rounded focus:outline-none focus:ring-1 focus:ring-off-black/20"
                          />
                        </div>
                      ) : selectedOrder.weatherTemp ? (
                        <CopyableField label="Temp" value={selectedOrder.weatherTemp} />
                      ) : (
                        <PendingField label="Temp" />
                      )}
                    </div>
                  </div>

                  {/* Runner Research Results */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight">Research Results</h4>
                      {selectedOrder.resultsUrl && (
                        <a
                          href={selectedOrder.resultsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          View Results ↗
                        </a>
                      )}
                    </div>
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      {(selectedOrder.effectiveRunnerName || selectedOrder.runnerName) ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <CopyableField label="Name" value={selectedOrder.effectiveRunnerName || selectedOrder.runnerName} />
                          </div>
                          {selectedOrder.hadNoTime && (
                            <span className="text-xs px-2 py-1 bg-warning-yellow/10 text-warning-yellow border border-warning-yellow/20 rounded" title='Customer entered "no time"'>
                              ⚠️ No Time
                            </span>
                          )}
                        </div>
                      ) : (
                        <PendingField label="Name" />
                      )}
                      {selectedOrder.bibNumber ? (
                        <CopyableField label="Bib" value={selectedOrder.bibNumber} />
                      ) : selectedOrder.hasScraperAvailable ? (
                        <PendingField label="Bib" />
                      ) : (
                        <NotAvailableField label="Bib" />
                      )}
                      {selectedOrder.officialTime ? (
                        <CopyableField label="Time" value={selectedOrder.officialTime} />
                      ) : selectedOrder.hasScraperAvailable ? (
                        <PendingField label="Time" />
                      ) : (
                        <NotAvailableField label="Time" />
                      )}
                      {selectedOrder.officialPace ? (
                        <CopyableField label="Pace" value={selectedOrder.officialPace} />
                      ) : selectedOrder.hasScraperAvailable ? (
                        <PendingField label="Pace" />
                      ) : (
                        <NotAvailableField label="Pace" />
                      )}
                    </div>
                  </div>

                  {/* Research Status */}
                  {selectedOrder.researchStatus && selectedOrder.researchStatus !== 'found' && (
                    <div>
                      <h4 className="text-xs font-semibold text-warning-amber uppercase tracking-tight mb-2">Research Status</h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                        <p className="text-body-sm text-amber-800">
                          {selectedOrder.researchStatus === 'not_found' && 'Runner not found in race results. Please verify the name and year.'}
                          {selectedOrder.researchStatus === 'ambiguous' && (possibleMatchesMap[selectedOrder.orderNumber]?.length
                            ? 'Possible matches found. Is this the right runner?'
                            : 'Multiple runners found with this name. Manual verification needed.'
                          )}
                        </p>
                        {selectedOrder.researchNotes && !possibleMatchesMap[selectedOrder.orderNumber]?.length && (
                          <p className="text-body-sm text-amber-700 mt-2">{selectedOrder.researchNotes}</p>
                        )}
                      </div>

                      {/* Suggested matches with Accept buttons */}
                      {possibleMatchesMap[selectedOrder.orderNumber]?.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {possibleMatchesMap[selectedOrder.orderNumber].map((match, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white border border-amber-200 rounded-md p-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-body-sm font-medium text-off-black">{match.name}</p>
                                <p className="text-xs text-off-black/60">
                                  {[
                                    match.bib && `Bib: ${match.bib}`,
                                    match.time && `Time: ${match.time}`,
                                    match.pace && `Pace: ${match.pace}`,
                                    match.city && match.state && `${match.city}, ${match.state}`
                                  ].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <button
                                onClick={() => acceptMatch(selectedOrder.orderNumber, match)}
                                className="ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-success-green/10 text-success-green border border-success-green/30 rounded-md hover:bg-success-green/20 transition-colors text-xs font-medium"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Accept
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes - only show if there are notes */}
                  {selectedOrder.notes && (
                    <div>
                      <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Notes</h4>
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <p className="text-body-sm text-blue-800 whitespace-pre-wrap">{selectedOrder.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Flag Reason - only for flagged orders */}
                  {selectedOrder.status === 'flagged' && selectedOrder.flagReason && (
                    <div>
                      <h4 className="text-xs font-semibold text-warning-amber uppercase tracking-tight mb-2">Flag Reason</h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                        <p className="text-body-sm text-amber-800">{selectedOrder.flagReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Missing Year Warning */}
                  {selectedOrder.status === 'missing_year' && (
                    <div>
                      <h4 className="text-xs font-semibold text-warning-amber uppercase tracking-tight mb-2">Action Required</h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
                        <p className="text-body-sm text-amber-800">This order is missing the race year. Please contact the customer to confirm which year they ran the race.</p>
                      </div>
                    </div>
                  )}
                  </>

                  {/* Scraper Not Available Warning */}
                  {!selectedOrder.hasScraperAvailable && selectedOrder.status !== 'completed' && (
                    <div>
                      <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Manual Research Required</h4>
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                        <p className="text-body-sm text-gray-600">
                          Auto-research is not yet available for {selectedOrder.effectiveRaceName || selectedOrder.raceName}.
                          Please manually look up the runner's bib number, time, and pace.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-3">
                    {/* Research button - show if scraper available and not already researched */}
                    {selectedOrder.hasScraperAvailable &&
                     (selectedOrder.effectiveRaceYear || selectedOrder.raceYear) &&
                     selectedOrder.researchStatus !== 'found' &&
                     selectedOrder.status !== 'completed' &&
                     !isEditing && (
                      <button
                        onClick={() => researchOrder(selectedOrder.orderNumber)}
                        disabled={isResearching}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isResearching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FlaskConical className="w-4 h-4" />
                        )}
                        {isResearching ? 'Researching...' : 'Research Runner'}
                      </button>
                    )}
                    {(selectedOrder.status === 'ready' || selectedOrder.researchStatus === 'found') &&
                     selectedOrder.status !== 'completed' &&
                     !isEditing && (
                      <button
                        onClick={() => markAsCompleted(selectedOrder.orderNumber)}
                        className="flex-1 px-5 py-3 bg-off-black text-white rounded-md hover:opacity-90 transition-opacity font-medium"
                      >
                        Mark as Completed
                      </button>
                    )}
                    {selectedOrder.status === 'flagged' && !isEditing && (
                      <>
                        <button className="flex-1 px-5 py-3 bg-off-black text-white rounded-md hover:opacity-90 transition-opacity font-medium">
                          Resolve Flag
                        </button>
                        <button
                          onClick={() => handleCopyEmail(selectedOrder)}
                          className="flex items-center gap-2 px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copy Email
                        </button>
                      </>
                    )}
                    {!isEditing && (
                      <button
                        onClick={closeModal}
                        className="px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors"
                      >
                        Close
                      </button>
                    )}
                  </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  )
}
