import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Search, Upload, Copy, Loader2, FlaskConical, Pencil, Check, X, Settings, ChevronRight, ChevronDown as ChevronDownIcon, ImagePlus, MessageSquareText, Send, Star } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import ProofManager from '@/components/ProofManager'
import PostApprovalChecklist from '@/components/PostApprovalChecklist'

/** Collapsible section with header + chevron toggle */
function CollapsibleSection({ title, defaultOpen = true, children, badge }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight flex items-center gap-2">
          {title}
          {badge}
        </h4>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-off-black/30 group-hover:text-off-black/50 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && children}
    </div>
  )
}
// API calls now go to /api/* serverless functions (same origin)

type DesignStatus = 'not_started' | 'in_progress' | 'awaiting_review' | 'in_revision' | 'approved_by_customer' | 'final_pdf_uploaded' | 'sent_to_production'

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
  timeFromName?: string | null // Time extracted from runner name (customer-provided)
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
  commentCount?: number
  proofCount?: number
  proofSentAt?: string | null
  shopifyCreatedAt?: string | null
  orderPlacedAt?: string | null
}

interface OrderComment {
  id: string
  orderId: string
  text: string | null
  imageUrl: string | null
  createdAt: string
}

// Design status display config
const DESIGN_STATUS_CONFIG: Record<DesignStatus, { icon: string; label: string; color: string; bgColor: string }> = {
  not_started: { icon: '⚪', label: 'Not Started', color: 'text-off-black/50', bgColor: 'bg-off-black/5' },
  in_progress: { icon: '🔵', label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  awaiting_review: { icon: '🔶', label: 'Awaiting Review', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  in_revision: { icon: '🟠', label: 'In Revision', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  approved_by_customer: { icon: '🟣', label: 'Approved by Customer', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  final_pdf_uploaded: { icon: '🟤', label: 'Final PDF Uploaded', color: 'text-amber-800', bgColor: 'bg-amber-50' },
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

// Yotpo review request links per product
const REVIEW_PRODUCTS: { name: string; link: string }[] = [
  { name: 'Air Force Marathon', link: 'https://yotpo.com/go/eLj6ln1g' },
  { name: 'Austin Marathon', link: 'https://yotpo.com/go/eLj6ln1g' },
  { name: 'Baltimore Marathon', link: 'https://yotpo.com/go/eLj6ln1g' },
  { name: 'Berlin Marathon', link: 'https://yotpo.com/go/llWZcm1S' },
  { name: 'Chicago Marathon', link: 'https://yotpo.com/go/mgtsCHbm' },
  { name: 'CIM (California International Marathon)', link: 'https://yotpo.com/go/llWZcm1S' },
  { name: 'Cowtown Marathon', link: 'https://yotpo.com/go/llWZcm1S' },
  { name: 'Custom', link: 'https://yotpo.com/go/nHef7FVS' },
  { name: 'Dallas Marathon', link: 'https://yotpo.com/go/ajHf1AG9' },
  { name: "Grandma's Marathon", link: 'https://yotpo.com/go/naDPT01J' },
  { name: 'Illinois Marathon', link: 'https://yotpo.com/go/cXM5yNtH' },
  { name: 'Jersey City Marathon', link: 'https://yotpo.com/go/eDoEWm89' },
  { name: 'Los Angeles Marathon', link: 'https://yotpo.com/go/iBKm90pS' },
  { name: 'Marine Corps Marathon', link: 'https://yotpo.com/go/y3xVMKmD' },
  { name: 'New York City Marathon', link: 'https://yotpo.com/go/oRVzQUez' },
  { name: 'Oakland Marathon', link: 'https://yotpo.com/go/8IZybQzV' },
  { name: 'Orange County Marathon', link: 'https://yotpo.com/go/7lr2btIj' },
  { name: 'Philadelphia Marathon', link: 'https://yotpo.com/go/luOGA59H' },
  { name: 'San Francisco Marathon', link: 'https://yotpo.com/go/9Yq2KlYT' },
  { name: 'Sydney Marathon', link: 'https://yotpo.com/go/g2IWTHnl' },
  { name: 'Tokyo Marathon', link: 'https://yotpo.com/go/aj2ABnX7' },
  { name: 'Twin Cities Marathon', link: 'https://yotpo.com/go/A3v2ZhPB' },
]

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isResearching, setIsResearching] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsAction, setSettingsAction] = useState<string | null>(null)
  const [healthResults, setHealthResults] = useState<any>(null)
  const [isRunningHealth, setIsRunningHealth] = useState(false)
  const [showReviewRequest, setShowReviewRequest] = useState(false)
  const [reviewCopied, setReviewCopied] = useState<string | null>(null)
  const [customersServedCount, setCustomersServedCount] = useState<number | null>(null)
  const [customersServedInput, setCustomersServedInput] = useState('')
  const [isLoadingCounter, setIsLoadingCounter] = useState(false)
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
  // Comments state for custom orders
  const [orderComments, setOrderComments] = useState<OrderComment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [newCommentText, setNewCommentText] = useState('')
  const [commentImageFile, setCommentImageFile] = useState<File | null>(null)
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [latestFeedback, setLatestFeedback] = useState<string | null>(null)
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  const [raceShorthands, setRaceShorthands] = useState<Record<string, string>>({})

  // Fetch orders from database (filtered by activeView type)
  const fetchOrders = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/orders?type=${activeView}`)
      if (!response.ok) throw new Error('Failed to fetch orders')
      const data = await response.json()

      // Transform database orders to match our Order interface
      const transformedOrders: Order[] = (data.orders || []).map((order: Record<string, unknown>) => {
        return {
          id: order.id as string,
          orderNumber: order.orderNumber as string,
          parentOrderNumber: order.parentOrderNumber as string,
          lineItemIndex: order.lineItemIndex as number,
          displayOrderNumber: (order.displayOrderNumber as string) || (order.parentOrderNumber as string),
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
          isGift: order.isGift as boolean | undefined,
          // Alert flags
          hadNoTime: order.hadNoTime as boolean | undefined,
          timeFromName: order.timeFromName as string | null | undefined,
          // Marketplace order date for sorting
          shopifyCreatedAt: order.shopifyCreatedAt as string | null | undefined,
          orderPlacedAt: order.orderPlacedAt as string | null | undefined
        }
      })

      setOrders(transformedOrders)
      setLastUpdated(new Date())

      // Sync selectedOrder with fresh data if the detail panel is open
      setSelectedOrder(prev => {
        if (!prev) return null
        const fresh = transformedOrders.find(o => o.id === prev.id)
        if (!fresh) return prev
        // Only update if something changed to avoid unnecessary re-renders
        if (fresh.designStatus !== prev.designStatus || fresh.status !== prev.status) {
          return { ...prev, ...fresh }
        }
        return prev
      })
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
      const response = await apiFetch(`/api/orders/import`, {
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
      const response = await apiFetch(url, {
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

  // Fetch current customers served count
  const fetchCustomersServedCount = async () => {
    try {
      const response = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'customers-served-info' })
      })
      if (!response.ok) throw new Error('Failed to fetch count')
      const data = await response.json()
      setCustomersServedCount(data.count)
      setCustomersServedInput(String(data.count))
    } catch (error) {
      console.error('Failed to fetch customers served count:', error)
    }
  }

  // Save customers served count and sync to Shopify
  const saveCustomersServedCount = async () => {
    const parsed = parseInt(customersServedInput, 10)
    if (isNaN(parsed) || parsed < 0) {
      setToast({ message: 'Enter a valid number', type: 'error' })
      return
    }
    setIsLoadingCounter(true)
    try {
      const response = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'customers-served-set', count: parsed })
      })
      if (!response.ok) throw new Error('Failed to update count')
      const data = await response.json()
      setCustomersServedCount(data.count)
      setCustomersServedInput(String(data.count))
      setToast({ message: `Counter updated to ${data.formatted} and synced to Shopify`, type: 'success' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Failed to update', type: 'error' })
    } finally {
      setIsLoadingCounter(false)
    }
  }

  // Fetch supported races when settings modal opens
  const fetchRaces = async () => {
    setIsLoadingRaces(true)
    try {
      const response = await apiFetch('/api/orders?list=races')
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
      const response = await apiFetch('/api/orders/update', {
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
          await apiFetch('/api/orders/refresh-weather', {
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
      const response = await apiFetch('/api/orders/update', {
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
          await apiFetch('/api/orders/refresh-weather', {
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
    apiFetch('/api/orders/test-scrapers')
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
      const response = await apiFetch('/api/orders/test-scrapers', {
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

      const response = await apiFetch(`/api/orders/research-runner`, {
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
        // Optimistically update the selected order so the modal shows results immediately
        setSelectedOrder(prev => prev ? {
          ...prev,
          bibNumber: data.results.bibNumber,
          officialTime: data.results.officialTime,
          officialPace: data.results.officialPace,
          eventType: data.results.eventType,
          researchStatus: 'found' as const,
          hadNoTime: !data.results.officialTime,
        } : prev)
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
      const freshResponse = await apiFetch(`/api/orders`)
      if (freshResponse.ok) {
        const freshData = await freshResponse.json()
        const freshOrders: Order[] = (freshData.orders || []).map((order: Record<string, unknown>) => {
          return {
            id: order.id as string,
            orderNumber: order.orderNumber as string,
            parentOrderNumber: order.parentOrderNumber as string,
            lineItemIndex: order.lineItemIndex as number,
            displayOrderNumber: (order.displayOrderNumber as string) || (order.parentOrderNumber as string),
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
            isGift: order.isGift as boolean | undefined,
            hadNoTime: order.hadNoTime as boolean | undefined,
            timeFromName: order.timeFromName as string | null | undefined
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

      const response = await apiFetch(`/api/orders/actions`, {
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
      const freshResponse = await apiFetch(`/api/orders`)
      if (freshResponse.ok) {
        const freshData = await freshResponse.json()
        const freshOrders: Order[] = (freshData.orders || []).map((order: Record<string, unknown>) => {
          return {
            id: order.id as string,
            orderNumber: order.orderNumber as string,
            parentOrderNumber: order.parentOrderNumber as string,
            lineItemIndex: order.lineItemIndex as number,
            displayOrderNumber: (order.displayOrderNumber as string) || (order.parentOrderNumber as string),
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
            isGift: order.isGift as boolean | undefined,
            hadNoTime: order.hadNoTime as boolean | undefined,
            timeFromName: order.timeFromName as string | null | undefined
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
      const response = await apiFetch(`/api/orders/actions`, {
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
      const response = await apiFetch(`/api/orders/update`, {
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
      const updatedOrders = await apiFetch(`/api/orders?type=${activeView}`).then(r => r.json())
      const updated = updatedOrders.orders?.find((o: { orderNumber: string }) => o.orderNumber === order.orderNumber)
      if (updated) {
        setSelectedOrder({
          ...selectedOrder!,
          ...updated,
          displayOrderNumber: updated.displayOrderNumber || updated.orderNumber
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

      const response = await apiFetch(`/api/orders/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, ...updates })
      })

      if (!response.ok) throw new Error('Failed to save changes')

      setToast({ message: 'Changes saved!', type: 'success' })
      setIsEditing(false)
      await fetchOrders()

      // Update selected order with new data
      const updatedOrders = await apiFetch(`/api/orders`).then(r => r.json())
      const updated = updatedOrders.orders?.find((o: { orderNumber: string }) => o.orderNumber === orderNumber)
      if (updated) {
        setSelectedOrder({
          ...selectedOrder!,
          ...updated,
          displayOrderNumber: updated.displayOrderNumber || updated.orderNumber
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
  // Only show full loading spinner on initial load; show subtle refresh indicator on view switch
  useEffect(() => {
    if (orders.length === 0) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    fetchOrders().finally(() => setIsRefreshing(false))

    // Auto-poll every 30s to pick up external changes (customer approvals, etc.)
    const poll = setInterval(() => {
      fetchOrders()
    }, 30_000)
    return () => clearInterval(poll)
  }, [fetchOrders])

  // Fetch race shorthands from scraper configs (once on mount)
  useEffect(() => {
    apiFetch('/api/orders/actions?action=race-shorthands')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.shorthands) setRaceShorthands(data.shorthands) })
      .catch(() => {})
  }, [])

  // Update design status for custom orders
  const updateDesignStatus = async (orderNumber: string, designStatus: DesignStatus) => {
    // Optimistically update UI immediately before the API call
    const previousStatus = selectedOrder?.designStatus
    if (selectedOrder?.orderNumber === orderNumber) {
      setSelectedOrder(prev => prev ? { ...prev, designStatus } : null)
    }
    setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, designStatus } : o))

    try {
      const response = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'design-status', orderNumber, designStatus })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update design status')
      }

      setToast({ message: `Design status updated to ${(DESIGN_STATUS_CONFIG[designStatus] || DESIGN_STATUS_CONFIG.not_started).label}`, type: 'success' })
      fetchOrders() // Refresh in background
    } catch (error) {
      console.error('Error updating design status:', error)
      // Roll back optimistic update on failure
      if (selectedOrder?.orderNumber === orderNumber && previousStatus) {
        setSelectedOrder(prev => prev ? { ...prev, designStatus: previousStatus } : null)
      }
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, designStatus: previousStatus || o.designStatus } : o))
      const message = error instanceof Error ? error.message : 'Failed to update design status'
      setToast({ message, type: 'error' })
    }
  }

  // ====== COMMENTS FUNCTIONS ======

  const fetchComments = useCallback(async (orderId: string) => {
    setIsLoadingComments(true)
    try {
      const response = await apiFetch(`/api/orders/comments?orderId=${orderId}`)
      if (!response.ok) throw new Error('Failed to fetch comments')
      const data = await response.json()
      setOrderComments(data.comments || [])
    } catch (error) {
      console.error('Error fetching comments:', error)
      setOrderComments([])
    } finally {
      setIsLoadingComments(false)
    }
  }, [])

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip the data:image/xxx;base64, prefix
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const submitComment = async () => {
    if (!selectedOrder || (!newCommentText.trim() && !commentImageFile)) return
    setIsSubmittingComment(true)
    try {
      let imageData: string | null = null
      let imageName: string | null = null
      if (commentImageFile) {
        imageData = await fileToBase64(commentImageFile)
        imageName = commentImageFile.name
      }

      const response = await apiFetch('/api/orders/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          text: newCommentText.trim() || null,
          imageData,
          imageName
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to add comment')
      }
      const data = await response.json()
      setOrderComments(prev => [data.comment, ...prev])
      setNewCommentText('')
      setCommentImageFile(null)
      if (commentImagePreview) URL.revokeObjectURL(commentImagePreview)
      setCommentImagePreview(null)
      // Update commentCount on the order in the list so the icon shows
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, commentCount: (o.commentCount || 0) + 1 } : o))
      setSelectedOrder(prev => prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev)
      setToast({ message: 'Comment added', type: 'success' })
    } catch (error) {
      console.error('Error adding comment:', error)
      setToast({ message: error instanceof Error ? error.message : 'Failed to add comment', type: 'error' })
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const deleteComment = async (commentId: string) => {
    try {
      const response = await apiFetch('/api/orders/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId })
      })
      if (!response.ok) throw new Error('Failed to delete comment')
      setOrderComments(prev => prev.filter(c => c.id !== commentId))
      // Update commentCount on the order in the list
      if (selectedOrder) {
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, commentCount: Math.max((o.commentCount || 0) - 1, 0) } : o))
        setSelectedOrder(prev => prev ? { ...prev, commentCount: Math.max((prev.commentCount || 0) - 1, 0) } : prev)
      }
      setToast({ message: 'Comment deleted', type: 'success' })
    } catch (error) {
      console.error('Error deleting comment:', error)
      setToast({ message: 'Failed to delete comment', type: 'error' })
    }
  }

  const sendFollowUp = async (orderId: string) => {
    setIsSendingFollowUp(true)
    try {
      const res = await apiFetch(`/api/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-to-customer', orderId })
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({ message: data.error || 'Failed to send follow-up', type: 'error' })
        return
      }
      setToast({ message: 'Follow-up email sent', type: 'success' })
      // Update proofSentAt locally
      setSelectedOrder(prev => prev ? { ...prev, proofSentAt: new Date().toISOString() } : prev)
    } catch {
      setToast({ message: 'Failed to send follow-up', type: 'error' })
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  const handleCommentPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setCommentImageFile(file)
          setCommentImagePreview(URL.createObjectURL(file))
        }
        break
      }
    }
  }

  const handleCommentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCommentImageFile(file)
      setCommentImagePreview(URL.createObjectURL(file))
    }
  }

  const clearCommentImage = () => {
    setCommentImageFile(null)
    if (commentImagePreview) URL.revokeObjectURL(commentImagePreview)
    setCommentImagePreview(null)
    if (commentFileInputRef.current) commentFileInputRef.current.value = ''
  }

  // Load comments when custom order modal opens
  useEffect(() => {
    if (selectedOrder?.trackstarOrderType === 'custom' && selectedOrder.id) {
      fetchComments(selectedOrder.id)
      setNewCommentText('')
      setCommentImageFile(null)
      setCommentImagePreview(null)
    } else {
      setOrderComments([])
    }
  }, [selectedOrder?.id, selectedOrder?.trackstarOrderType, fetchComments])

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
    // Standard view: filter by status, newest Shopify order first
    const fulfillOrders = typeFiltered.filter(o =>
      o.status === 'flagged' || o.status === 'ready' || o.status === 'pending' || o.status === 'missing_year'
    )
    return fulfillOrders.sort((a, b) => {
      const dateA = new Date(a.orderPlacedAt || a.shopifyCreatedAt || a.createdAt).getTime()
      const dateB = new Date(b.orderPlacedAt || b.shopifyCreatedAt || b.createdAt).getTime()
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

  const matchesSearch = useCallback((o: Order, query: string) =>
    o.orderNumber.toLowerCase().includes(query) ||
    o.displayOrderNumber.toLowerCase().includes(query) ||
    o.parentOrderNumber.toLowerCase().includes(query) ||
    (o.raceName || '').toLowerCase().includes(query) ||
    (o.effectiveRaceName || '').toLowerCase().includes(query) ||
    (o.runnerName || '').toLowerCase().includes(query) ||
    (o.effectiveRunnerName || '').toLowerCase().includes(query)
  , [])

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return ordersToFulfill
    const query = searchQuery.toLowerCase()
    return ordersToFulfill.filter(o => matchesSearch(o, query))
  }, [ordersToFulfill, searchQuery, matchesSearch])

  const filteredCompletedOrders = useMemo(() => {
    if (!searchQuery) return completedOrders
    const query = searchQuery.toLowerCase()
    return completedOrders.filter(o => matchesSearch(o, query))
  }, [completedOrders, searchQuery, matchesSearch])

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

    // 1. Check API-sourced shorthands from scraper configs (auto-updated)
    if (raceShorthands[raceName]) {
      return raceShorthands[raceName]
    }

    // 2. Fallback: hardcoded map for races without scrapers
    const shorthandMap: { [key: string]: string } = {
      'Surf City Marathon': 'Surf City',
      'Berlin Marathon': 'Berlin',
      'Denver Colfax Marathon': 'Colfax',
      'Miami Marathon': 'Miami',
      'Army Ten Miler': 'ATM',
      'Detroit Marathon': 'Detroit',
      'Columbus Marathon': 'Columbus',
      'Pittsburgh Marathon': 'Pittsburgh',
      'Grandma\'s Marathon': 'Grandma\'s',
      'Houston Marathon': 'Houston',
      'Dallas Marathon': 'Dallas',
      'Palm Beaches Marathon': 'Palm Beaches',
      'Baltimore Marathon': 'Baltimore',
      'San Antonio Marathon': 'San Antonio',
      'Honolulu Marathon': 'Honolulu',
      'Air Force Marathon': 'Air Force',
      'San Francisco Marathon': 'SF',
      'Jackson Hole Marathon': 'Jackson Hole',
      'Sydney Marathon': 'Sydney',
      'Tokyo Marathon': 'Tokyo',
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
      <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-12 w-full flex flex-col h-full">
        {/* Header - Compact bar on mobile, full greeting on desktop */}
        <div className="pt-4 md:pt-8 lg:pt-10 pb-3 md:pb-6 flex items-center md:items-end justify-between gap-3 md:gap-6 flex-shrink-0">
          {/* Left side: logo, greeting, and summary */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/trackstar-logo.png"
                alt="Trackstar"
                className="h-8 md:h-11"
              />
              <span className="md:hidden px-2 py-0.5 bg-off-black/10 text-off-black/60 text-xs font-medium rounded">
                {ordersToFulfill.length} orders
              </span>
            </div>
            <div className="hidden md:block">
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
                className="inline-flex items-center gap-2 px-3 md:px-6 py-2 md:py-2.5 bg-off-black text-white rounded-md hover:opacity-90 transition-opacity font-medium text-xs md:text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span className="md:hidden">{isImporting ? 'Importing…' : 'Import'}</span>
                <span className="hidden md:inline">{isImporting ? 'Importing…' : 'Import New Orders'}</span>
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
          <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-base md:text-lg font-semibold text-off-black uppercase tracking-tight">
                <span className="md:hidden">{activeView === 'standard' ? 'Personalization' : 'Custom Designs'}</span>
                <span className="hidden md:inline">{activeView === 'standard' ? 'Designs to be Personalized' : 'Custom Designs'}</span>
              </h2>
              <span className="hidden md:inline px-2.5 py-1 bg-off-black/10 text-off-black/60 text-sm font-medium rounded">
                {ordersToFulfill.length}
              </span>
              {isRefreshing && <Loader2 className="w-4 h-4 animate-spin text-off-black/30" />}
            </div>
            {/* View Switcher - Mobile (compact) */}
            <div className="flex gap-1.5 md:hidden">
              <button
                onClick={() => { setActiveView('standard'); setSearchQuery('') }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                  activeView === 'standard'
                    ? 'bg-off-black text-white border-off-black'
                    : 'bg-white text-off-black border-border-gray'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => { setActiveView('custom'); setSearchQuery('') }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                  activeView === 'custom'
                    ? 'bg-off-black text-white border-off-black'
                    : 'bg-white text-off-black border-border-gray'
                }`}
              >
                Custom
              </button>
            </div>
            {/* View Switcher - Desktop */}
            <div className="hidden md:flex gap-2">
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
            <div className="p-3 md:p-4 border-b border-border-gray flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-off-black/40" />
                <input
                  type="text"
                  placeholder={activeView === 'standard' ? "Search orders..." : "Search designs..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 md:pl-11 pr-4 py-2.5 md:py-3 bg-subtle-gray border border-border-gray rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-off-black/10 focus:border-off-black/30 transition-colors"
                />
              </div>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* ===== MOBILE CARD LIST ===== */}
              <div className="md:hidden divide-y divide-border-gray">
                {activeView === 'standard' ? (
                  <>
                    {filteredOrders.map((order) => {
                      const statusDisplay = getStatusDisplay(order)
                      const itemCount = getOrderItemCount(order.parentOrderNumber)
                      return (
                        <div
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className="px-4 py-3 active:bg-subtle-gray cursor-pointer"
                        >
                          {/* Row 1: Source + Order# + Badges ... Status */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                                alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                className="w-4 h-4 flex-shrink-0"
                              />
                              <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                              {itemCount > 1 && (
                                <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                  {order.lineItemIndex + 1}/{itemCount}
                                </span>
                              )}
                              {order.hadNoTime && (
                                <span className="px-1 py-0.5 bg-warning-amber/10 text-warning-amber text-[9px] rounded border border-warning-amber/20">NO TIME</span>
                              )}
                              {order.timeFromName && (
                                <span className="px-1 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] rounded border border-blue-500/20">⏱ {order.timeFromName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-base" title={statusDisplay.label}>{statusDisplay.icon}</span>
                              {(order.notes || (order.commentCount ?? 0) > 0) && (
                                <span title="Has notes/comments"><MessageSquareText className="w-3.5 h-3.5 text-amber-500" /></span>
                              )}
                            </div>
                          </div>
                          {/* Row 2: Runner name */}
                          <div className="mt-1">
                            <span className="text-sm text-off-black">
                              {order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}
                            </span>
                            {order.hasOverrides && (
                              <span className="ml-1.5 px-1 py-0.5 bg-blue-100 text-blue-600 text-[9px] rounded">edited</span>
                            )}
                          </div>
                          {/* Row 3: Status subtitle + Race */}
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="text-xs text-off-black/40">
                              {order.status === 'flagged' && order.flagReason ? order.flagReason
                                : order.status === 'missing_year' && !order.yearOverride ? 'Year Missing'
                                : order.status === 'ready' && order.bibNumber ? `Bib: ${order.bibNumber} · ${order.officialTime}`
                                : order.status === 'pending' && order.hasScraperAvailable && (order.effectiveRaceYear || order.raceYear) ? 'Ready to research'
                                : order.status === 'pending' && !order.hasScraperAvailable ? 'Manual research needed'
                                : statusDisplay.label}
                            </span>
                            <span className="text-xs text-off-black/40 truncate text-right max-w-[50%]">
                              {order.effectiveRaceName || order.raceName}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Completed orders in search (mobile) */}
                    {searchQuery && filteredCompletedOrders.length > 0 && (
                      <>
                        <div className="px-4 py-2.5 bg-subtle-gray/50">
                          <span className="text-xs font-semibold text-off-black/40 uppercase tracking-wider">Completed Orders</span>
                        </div>
                        {filteredCompletedOrders.map((order) => {
                          const itemCount = getOrderItemCount(order.parentOrderNumber)
                          return (
                            <div
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className="px-4 py-3 active:bg-subtle-gray cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <img
                                    src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                                    alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                                    className="w-4 h-4 flex-shrink-0"
                                  />
                                  <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                                  {itemCount > 1 && (
                                    <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                      {order.lineItemIndex + 1}/{itemCount}
                                    </span>
                                  )}
                                </div>
                                <span className="text-base flex-shrink-0">✅</span>
                              </div>
                              <div className="mt-1">
                                <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2">
                                <span className="text-xs text-off-black/40">Completed</span>
                                <span className="text-xs text-off-black/40 truncate text-right max-w-[50%]">
                                  {order.effectiveRaceName || order.raceName}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </>
                ) : (
                  /* Custom Designs - Mobile Cards */
                  <>
                    {filteredOrders.map((order) => {
                      const designConfig = DESIGN_STATUS_CONFIG[order.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.not_started
                      const itemCount = getOrderItemCount(order.parentOrderNumber)
                      return (
                        <div
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className="px-4 py-3 active:bg-subtle-gray cursor-pointer"
                        >
                          {/* Row 1: Design status + Order# + badges */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${designConfig.bgColor} ${designConfig.color}`}>
                                <span>{designConfig.icon}</span>
                                {designConfig.label}
                              </span>
                              <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                              {itemCount > 1 && (
                                <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                  {order.lineItemIndex + 1}/{itemCount}
                                </span>
                              )}
                              {order.isGift && (
                                <span className="text-xs">🎁</span>
                              )}
                              {(order.notes || (order.commentCount ?? 0) > 0) && (
                                <span title="Has notes/comments"><MessageSquareText className="w-3.5 h-3.5 text-amber-500" /></span>
                              )}
                            </div>
                          </div>
                          {/* Row 2: Runner name */}
                          <div className="mt-1">
                            <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                          </div>
                          {/* Row 3: Due date + Race */}
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={`text-xs ${isDueDateUrgent(order.dueDate) ? 'text-red-600 font-medium' : 'text-off-black/40'}`}>
                              Due: {formatDueDate(order.dueDate)}
                            </span>
                            <span className="text-xs text-off-black/40 truncate text-right max-w-[50%]">
                              {order.effectiveRaceName || order.raceName || '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Completed orders in search (custom mobile) */}
                    {searchQuery && filteredCompletedOrders.length > 0 && (
                      <>
                        <div className="px-4 py-2.5 bg-subtle-gray/50">
                          <span className="text-xs font-semibold text-off-black/40 uppercase tracking-wider">Completed Orders</span>
                        </div>
                        {filteredCompletedOrders.map((order) => {
                          const designConfig = DESIGN_STATUS_CONFIG[order.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.sent_to_production
                          const itemCount = getOrderItemCount(order.parentOrderNumber)
                          return (
                            <div
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className="px-4 py-3 active:bg-subtle-gray cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${designConfig.bgColor} ${designConfig.color}`}>
                                    <span>{designConfig.icon}</span>
                                    {designConfig.label}
                                  </span>
                                  <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                                  {itemCount > 1 && (
                                    <span className="px-1.5 py-0.5 bg-off-black/5 text-off-black/60 text-[10px] font-medium rounded whitespace-nowrap">
                                      {order.lineItemIndex + 1}/{itemCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-1">
                                <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2">
                                <span className="text-xs text-off-black/40">Completed</span>
                                <span className="text-xs text-off-black/40 truncate text-right max-w-[50%]">
                                  {order.effectiveRaceName || order.raceName || '—'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </>
                )}

                {filteredOrders.length === 0 && !searchQuery && (
                  <div className="text-center py-12 text-off-black/40 text-sm">
                    {activeView === 'standard' ? 'No orders to personalize' : 'No custom designs'}
                  </div>
                )}
                {searchQuery && filteredOrders.length === 0 && filteredCompletedOrders.length === 0 && (
                  <div className="text-center py-12 text-off-black/40 text-sm">
                    No matching orders found
                  </div>
                )}
              </div>

              {/* ===== DESKTOP TABLE ===== */}
              <table className="w-full hidden md:table">
                {activeView === 'standard' ? (
                  <>
                    {/* Standard Orders Table */}
                    <thead className="bg-subtle-gray border-b border-border-gray sticky top-0 z-10">
                      <tr>
                        <th className="text-center pl-6 pr-2 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-12">Src</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-40">Order #</th>
                        <th className="text-center px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-20">Status</th>
                        <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-1/4">Runner</th>
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
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-lg" title={statusDisplay.label}>
                                  {statusDisplay.icon}
                                </span>
                                {(order.notes || (order.commentCount ?? 0) > 0) && (
                                  <span title="Has notes/comments"><MessageSquareText className="w-3.5 h-3.5 text-amber-500" /></span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                                {order.hasOverrides && (
                                  <span className="px-1 py-0.5 bg-blue-100 text-blue-600 text-[9px] rounded">edited</span>
                                )}
                                {order.hadNoTime && (
                                  <span className="px-1 py-0.5 bg-warning-amber/10 text-warning-amber text-[9px] rounded border border-warning-amber/20" title='Customer entered "no time"'>NO TIME</span>
                                )}
                                {order.timeFromName && (
                                  <span className="px-1 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] rounded border border-blue-500/20" title={`Customer time: ${order.timeFromName}`}>⏱ {order.timeFromName}</span>
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
                      {/* Completed orders inline when searching (standard view) */}
                      {searchQuery && filteredCompletedOrders.length > 0 && (
                        <>
                          <tr className="bg-subtle-gray/50">
                            <td colSpan={5} className="px-6 py-3">
                              <span className="text-xs font-semibold text-off-black/40 uppercase tracking-wider">Completed Orders</span>
                            </td>
                          </tr>
                          {filteredCompletedOrders.map((order, index) => {
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
                                  <span className="text-lg">✅</span>
                                </td>
                                <td className="px-3 py-5">
                                  <span className="text-sm text-off-black">{order.effectiveRunnerName || order.runnerName || 'Unknown Runner'}</span>
                                </td>
                                <td className="px-3 pr-6 py-5 text-sm text-off-black/60 hidden md:table-cell">
                                  {order.effectiveRaceName || order.raceName} {order.effectiveRaceYear || order.raceYear}
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )}
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
                                {(order.notes || (order.commentCount ?? 0) > 0) && (
                                  <span title="Has notes/comments"><MessageSquareText className="w-3.5 h-3.5 text-amber-500" /></span>
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
                      {/* Completed orders inline when searching (custom view) */}
                      {searchQuery && filteredCompletedOrders.length > 0 && (
                        <>
                          <tr className="bg-subtle-gray/50">
                            <td colSpan={6} className="px-6 py-3">
                              <span className="text-xs font-semibold text-off-black/40 uppercase tracking-wider">Completed Orders</span>
                            </td>
                          </tr>
                          {filteredCompletedOrders.map((order, index) => {
                            const designConfig = DESIGN_STATUS_CONFIG[order.designStatus as DesignStatus] || DESIGN_STATUS_CONFIG.sent_to_production
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
                                  </div>
                                </td>
                                <td className="px-3 py-5">
                                  <span className="text-sm text-off-black/40">—</span>
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
                        </>
                      )}
                    </tbody>
                  </>
                )}
              </table>

              {filteredOrders.length === 0 && !searchQuery && (
                <div className="hidden md:block text-center py-16 text-off-black/40 text-sm">
                  {activeView === 'standard' ? 'No orders to personalize' : 'No custom designs'}
                </div>
              )}

              {searchQuery && filteredOrders.length === 0 && filteredCompletedOrders.length === 0 && (
                <div className="hidden md:block text-center py-16 text-off-black/40 text-sm">
                  No matching orders found
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* Bottom bar: Completed Orders Toggle + Settings */}
        {!isLoading && (
          <div className="flex-shrink-0 py-3 md:py-4 mt-2 mb-4 md:mb-8 border-t border-border-gray/50">
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
                onClick={() => { setShowSettings(true); fetchCustomersServedCount() }}
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
            <div className="bg-white rounded-none md:rounded-lg max-w-4xl w-full h-[90vh] md:h-auto md:max-h-[80vh] overflow-hidden shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border-gray">
                <h2 className="text-base md:text-lg font-semibold text-off-black">Completed Orders</h2>
                <button
                  onClick={() => setShowCompleted(false)}
                  className="text-off-black/40 hover:text-off-black text-2xl leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {/* Mobile cards for completed orders modal */}
                <div className="md:hidden divide-y divide-border-gray">
                  {filteredCompletedOrders.map((order) => (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="px-4 py-3 active:bg-subtle-gray cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={order.source === 'shopify' ? '/shopify-icon.png' : '/etsy-icon.png'}
                            alt={order.source === 'shopify' ? 'Shopify' : 'Etsy'}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium text-off-black">{order.displayOrderNumber}</span>
                        </div>
                        <span className="text-base">✅</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-sm text-off-black">{order.runnerName}</span>
                      </div>
                      <div className="mt-0.5">
                        <span className="text-xs text-off-black/40">{order.raceName} {order.raceYear}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table for completed orders modal */}
                <table className="w-full hidden md:table">
                  <thead className="bg-subtle-gray border-b border-border-gray sticky top-0">
                    <tr>
                      <th className="text-center pl-6 pr-2 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-12">Src</th>
                      <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Order #</th>
                      <th className="text-center px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider w-20">Status</th>
                      <th className="text-left px-3 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Runner</th>
                      <th className="text-left px-3 pr-6 py-4 text-xs font-semibold text-off-black/60 uppercase tracking-wider">Race</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-gray">
                    {filteredCompletedOrders.map((order, index) => (
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
                        <td className="px-3 pr-6 py-5 text-sm text-off-black/60">
                          {order.raceName} {order.raceYear}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredCompletedOrders.length === 0 && (
                  <div className="text-center py-16 text-off-black/40 text-sm">
                    {searchQuery ? 'No matching completed orders' : 'No completed orders yet'}
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
            onClick={(e) => { if (e.target === e.currentTarget) { setShowSettings(false); setShowReviewRequest(false); setReviewCopied(null) } }}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden">
              {showReviewRequest ? (
                /* Review Request panel */
                <div className="flex flex-col h-full max-h-[85vh]" style={{ animation: 'slideInRight 200ms ease-out' }}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border-gray flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowReviewRequest(false); setReviewCopied(null) }}
                        className="text-off-black/40 hover:text-off-black/70 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                      </button>
                      <h2 className="text-base font-semibold text-off-black">Which product?</h2>
                    </div>
                    <button onClick={() => { setShowSettings(false); setShowReviewRequest(false); setReviewCopied(null) }} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none">×</button>
                  </div>
                  <div className="p-3 flex-1 overflow-y-auto">
                    {REVIEW_PRODUCTS.map((product) => (
                      <button
                        key={product.name}
                        onClick={() => {
                          const msg = `If you have 2-seconds would you mind leaving us a review? It really helps us as a young brand. Link here: ${product.link}`
                          const ta = document.createElement('textarea')
                          ta.value = msg
                          ta.style.position = 'fixed'
                          ta.style.opacity = '0'
                          document.body.appendChild(ta)
                          ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                          setReviewCopied(product.name)
                          setTimeout(() => setReviewCopied(null), 2000)
                        }}
                        className="w-full text-left px-4 py-3 rounded-lg hover:bg-subtle-gray transition-colors flex items-center justify-between group"
                      >
                        <span className="text-sm text-off-black">{product.name}</span>
                        <span className="text-xs text-off-black/30 group-hover:text-off-black/50 flex items-center gap-1">
                          {reviewCopied === product.name ? (
                            <><Check className="w-3.5 h-3.5 text-green-600" /><span className="text-green-600">Copied!</span></>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" /> Copy</>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Settings main content */
                <div className="overflow-y-auto">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border-gray">
                    <h2 className="text-base font-semibold text-off-black">Settings</h2>
                    <button onClick={() => { setShowSettings(false); setShowReviewRequest(false); setReviewCopied(null) }} className="text-off-black/40 hover:text-off-black/70 text-xl leading-none">×</button>
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

                    <button
                      onClick={() => setShowReviewRequest(true)}
                      className="w-full rounded-lg border border-border-gray bg-subtle-gray p-4 hover:bg-off-black/[0.06] transition-colors text-left group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-off-black">Request Reviews</p>
                          <p className="text-xs mt-0.5 text-off-black/50">Copy a review request message for any product</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Star className="w-4 h-4 text-off-black/30 group-hover:text-off-black/50 transition-colors" />
                          <ChevronRight className="w-4 h-4 text-off-black/30 group-hover:text-off-black/50 transition-colors" />
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Customers Served Counter */}
                  <div className="border-t border-border-gray p-6">
                    <div className="rounded-lg border border-border-gray bg-subtle-gray p-4">
                      <p className="text-sm font-medium text-off-black">Customers Served Counter</p>
                      <p className="text-xs mt-0.5 text-off-black/50 mb-3">Adjust the counter displayed on the Shopify storefront. Saves to DB and syncs to Shopify.</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={customersServedInput}
                          onChange={(e) => setCustomersServedInput(e.target.value)}
                          placeholder={customersServedCount !== null ? String(customersServedCount) : 'Loading...'}
                          className="flex-1 min-w-0 rounded-md border border-border-gray px-3 py-1.5 text-sm text-off-black bg-white focus:outline-none focus:ring-1 focus:ring-off-black/20"
                        />
                        <button
                          onClick={saveCustomersServedCount}
                          disabled={isLoadingCounter || customersServedInput === String(customersServedCount)}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-off-black text-white hover:bg-off-black/80"
                        >
                          {isLoadingCounter && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isLoadingCounter ? 'Saving…' : 'Update & Sync'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* System Health Check */}
                  <div className="border-t border-border-gray p-6">
                    <div className="rounded-lg border border-border-gray bg-subtle-gray p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-off-black">System Health Check</p>
                          <p className="text-xs mt-0.5 text-off-black/50">Tests database, Etsy, Shopify, Resend, and Slack connections. Runs automatically every Monday at 12pm.</p>
                        </div>
                        <button
                          onClick={async () => {
                            setIsRunningHealth(true)
                            setHealthResults(null)
                            try {
                              const response = await apiFetch('/api/orders/actions?action=health-check')
                              const data = await response.json()
                              if (!response.ok && !data.checks) {
                                setHealthResults({ overall: 'error', checks: {}, error: data.error || `HTTP ${response.status}` })
                              } else {
                                setHealthResults(data)
                              }
                            } catch (err: any) {
                              setHealthResults({ overall: 'error', checks: {}, error: err?.message || 'Failed to run health check' })
                            } finally {
                              setIsRunningHealth(false)
                            }
                          }}
                          disabled={isRunningHealth}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-off-black text-white hover:bg-off-black/80"
                        >
                          {isRunningHealth && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isRunningHealth ? 'Checking…' : 'Run Health Check'}
                        </button>
                      </div>

                      {healthResults && (
                        <div className="mt-3 space-y-1.5">
                          <div className={`text-xs font-medium ${healthResults.overall === 'healthy' ? 'text-green-600' : healthResults.overall === 'degraded' ? 'text-amber-600' : 'text-red-600'}`}>
                            {healthResults.overall === 'healthy' ? '✅ All systems healthy' : healthResults.overall === 'degraded' ? '⚠️ Some systems degraded' : '🚨 Critical issues detected'}
                          </div>
                          {healthResults.error && (
                            <div className="text-xs text-red-500 mt-1">{healthResults.error}</div>
                          )}
                          {healthResults.checks && Object.entries(healthResults.checks).map(([name, check]: [string, any]) => (
                            <div key={name} className="flex items-start gap-2 text-xs">
                              <span className="flex-shrink-0 mt-0.5">{check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'}</span>
                              <div className="min-w-0">
                                <span className="font-medium text-off-black capitalize">{name}</span>
                                <span className="text-off-black/50 ml-1.5">{check.detail}</span>
                                {check.latency && <span className="text-off-black/30 ml-1">({check.latency})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
              )}
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
            <div className="bg-white rounded-none md:rounded-md max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 md:p-6">
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
                    {(selectedOrder.notes || (selectedOrder.commentCount ?? 0) > 0) && (
                      <span title="Has notes/comments"><MessageSquareText className="w-4 h-4 text-amber-500" /></span>
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
                      {/* === MOBILE COMPACT SUMMARY (Custom) === */}
                      <div className="md:hidden space-y-3">
                        {/* Stage Progress Indicator (Mobile) */}
                        {(() => {
                          const mds = selectedOrder.designStatus as DesignStatus
                          const mDesigning = ['not_started', 'in_progress'].includes(mds)
                          const mProof = ['awaiting_review', 'in_revision', 'approved_by_customer'].includes(mds)
                          const mProd = ['final_pdf_uploaded', 'sent_to_production'].includes(mds)
                          const mSteps = [
                            { label: 'Design', active: mDesigning || mProof || mProd },
                            { label: 'Review', active: ['awaiting_review', 'in_revision', 'approved_by_customer'].includes(mds) || mProd },
                            { label: 'Approved', active: mds === 'approved_by_customer' || mProd },
                            { label: 'Production', active: mProd },
                          ]
                          return (
                            <div className="flex items-center gap-1 px-1">
                              {mSteps.map((step, i) => (
                                <div key={step.label} className="flex items-center gap-1 flex-1">
                                  <div className={`flex items-center gap-1.5 ${i < mSteps.length - 1 ? 'flex-1' : ''}`}>
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${step.active ? 'bg-off-black' : 'bg-off-black/15'}`} />
                                    <span className={`text-[10px] font-medium whitespace-nowrap ${step.active ? 'text-off-black' : 'text-off-black/30'}`}>
                                      {step.label}
                                    </span>
                                  </div>
                                  {i < mSteps.length - 1 && (
                                    <div className={`flex-1 h-px ${step.active && mSteps[i + 1].active ? 'bg-off-black/30' : 'bg-off-black/10'}`} />
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        {/* Design Status Dropdown */}
                        <div className="relative">
                          <select
                            value={DESIGN_STATUS_CONFIG[selectedOrder.designStatus as DesignStatus] ? selectedOrder.designStatus : 'not_started'}
                            onChange={(e) => updateDesignStatus(selectedOrder.orderNumber, e.target.value as DesignStatus)}
                            className={`w-full appearance-none px-4 py-3 pr-8 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
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
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="h-4 w-4 text-off-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>

                        {/* Order details card */}
                        <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Runner</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRunnerName || selectedOrder.runnerName || 'Unknown'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Race</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRaceName || selectedOrder.raceName || 'Custom'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Year</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRaceYear || selectedOrder.raceYear || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Due Date</span>
                            <span className={`text-body-sm font-medium ${isDueDateUrgent(selectedOrder.dueDate) ? 'text-red-600' : 'text-off-black'}`}>
                              {formatDueDate(selectedOrder.dueDate)}
                            </span>
                          </div>
                          {selectedOrder.bibNumberCustomer && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-off-black/60">Bib</span>
                              <span className="text-body-sm font-medium text-off-black">{selectedOrder.bibNumberCustomer}</span>
                            </div>
                          )}
                          {selectedOrder.timeCustomer && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-off-black/60">Time</span>
                              <span className="text-body-sm font-medium text-off-black">{selectedOrder.timeCustomer}</span>
                            </div>
                          )}
                          {selectedOrder.isGift && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-off-black/60">Gift Order</span>
                              <span className="text-body-sm font-medium text-pink-600">🎁 Yes</span>
                            </div>
                          )}
                        </div>
                        {selectedOrder.creativeDirection && (
                          <div>
                            <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Creative Direction</h4>
                            <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
                              <p className="text-body-sm text-purple-800 whitespace-pre-wrap">{selectedOrder.creativeDirection}</p>
                            </div>
                          </div>
                        )}

                        {/* Customer Feedback Banner (Mobile) */}
                        {selectedOrder.designStatus === 'in_revision' && latestFeedback && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                            <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-1">Customer Feedback</p>
                            <p className="text-body-sm text-orange-800 whitespace-pre-wrap">{latestFeedback}</p>
                          </div>
                        )}

                        {selectedOrder.designStatus === 'awaiting_review' && (() => {
                          const daysSinceSent = selectedOrder.proofSentAt
                            ? Math.floor((Date.now() - new Date(selectedOrder.proofSentAt).getTime()) / (1000 * 60 * 60 * 24))
                            : null
                          const needsFollowUp = daysSinceSent !== null && daysSinceSent >= 3
                          const daysText = daysSinceSent !== null
                            ? `${daysSinceSent} day${daysSinceSent !== 1 ? 's' : ''} ago`
                            : ''
                          return needsFollowUp ? (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">🔔</span>
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-red-800">No response in {daysSinceSent} day{daysSinceSent !== 1 ? 's' : ''}</p>
                                  <p className="text-[10px] text-red-600">Proofs were sent {daysText}.</p>
                                </div>
                              </div>
                              <button
                                onClick={() => sendFollowUp(selectedOrder.id)}
                                disabled={isSendingFollowUp}
                                className="w-full mt-2 px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {isSendingFollowUp ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</>
                                ) : (
                                  <><Send className="w-3 h-3" /> Send Follow Up</>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2">
                              <span className="text-lg">⏳</span>
                              <div>
                                <p className="text-xs font-medium text-amber-800">Waiting for customer response</p>
                                <p className="text-[10px] text-amber-600">Proofs sent {daysText || 'today'}. You'll get a Slack notification when they respond.</p>
                              </div>
                            </div>
                          )
                        })()}

                        {/* Post-Approval Checklist (Mobile) */}
                        {(selectedOrder.designStatus === 'approved_by_customer' || selectedOrder.designStatus === 'final_pdf_uploaded') && (
                          <PostApprovalChecklist
                            orderId={selectedOrder.id}
                            orderNumber={selectedOrder.orderNumber}
                            displayOrderNumber={selectedOrder.displayOrderNumber}
                            designStatus={selectedOrder.designStatus}
                            onDesignStatusChange={(s) => updateDesignStatus(selectedOrder.orderNumber, s as DesignStatus)}
                          />
                        )}

                        {/* Proofs & Approval (Mobile) */}
                        <div>
                          <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Proofs & Approval</h4>
                          <ProofManager
                            orderId={selectedOrder.id}
                            orderNumber={selectedOrder.orderNumber}
                            displayOrderNumber={selectedOrder.displayOrderNumber}
                            designStatus={selectedOrder.designStatus}
                            customerEmail={selectedOrder.customerEmail}
                            onDesignStatusChange={(s) => updateDesignStatus(selectedOrder.orderNumber, s as DesignStatus)}
                            onLatestFeedback={setLatestFeedback}
                          />
                        </div>

                        {/* Comments (Mobile) */}
                        <div>
                          <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">
                            Comments {orderComments.length > 0 && `(${orderComments.length})`}
                          </h4>
                          <div className="bg-subtle-gray border border-border-gray rounded-md p-3 space-y-2 mb-2">
                            <textarea
                              value={newCommentText}
                              onChange={(e) => setNewCommentText(e.target.value)}
                              onPaste={handleCommentPaste}
                              placeholder="Add a comment or paste an image..."
                              className="w-full px-3 py-2 border border-border-gray rounded-md text-body-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none bg-white"
                              rows={2}
                            />
                            {commentImagePreview && (
                              <div className="relative inline-block">
                                <img src={commentImagePreview} alt="Preview" className="max-h-24 rounded-md border border-border-gray" />
                                <button onClick={clearCommentImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer px-3 py-1.5 text-xs border border-border-gray rounded-md hover:bg-white transition-colors text-off-black/60">
                                <ImagePlus className="w-3 h-3 inline mr-1" />
                                Image
                                <input ref={commentFileInputRef} type="file" accept="image/*" onChange={handleCommentFileSelect} className="hidden" />
                              </label>
                              <span className="text-xs text-off-black/40 flex-1">or paste</span>
                              <button
                                onClick={submitComment}
                                disabled={isSubmittingComment || (!newCommentText.trim() && !commentImageFile)}
                                className="px-4 py-1.5 text-xs bg-off-black text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 font-medium"
                              >
                                {isSubmittingComment ? 'Adding...' : 'Add'}
                              </button>
                            </div>
                          </div>
                          {isLoadingComments ? (
                            <div className="text-center py-3"><Loader2 className="w-4 h-4 animate-spin inline text-off-black/40" /></div>
                          ) : orderComments.length === 0 ? (
                            <p className="text-xs text-off-black/40 text-center py-2">No comments yet</p>
                          ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {orderComments.map(comment => (
                                <div key={comment.id} className="bg-white border border-border-gray rounded-md p-2.5">
                                  {comment.imageUrl && (
                                    <a href={comment.imageUrl} target="_blank" rel="noopener noreferrer">
                                      <img src={comment.imageUrl} alt="Attachment" className="max-h-32 rounded-md mb-1.5 border border-border-gray hover:opacity-90" />
                                    </a>
                                  )}
                                  {comment.text && <p className="text-body-sm text-off-black whitespace-pre-wrap">{comment.text}</p>}
                                  <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-xs text-off-black/40">
                                      {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                    <button onClick={() => deleteComment(comment.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="pt-1">
                          <button
                            onClick={closeModal}
                            className="w-full px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors font-medium"
                          >
                            Close
                          </button>
                        </div>
                      </div>

                      {/* === DESKTOP FULL DETAIL VIEW (Custom) === */}
                      {(() => {
                        // Stage-based collapse logic
                        const ds = selectedOrder.designStatus as DesignStatus
                        const isDesigning = ['not_started', 'in_progress'].includes(ds)
                        const isProofStage = ['awaiting_review', 'in_revision', 'approved_by_customer'].includes(ds)
                        const isProductionStage = ['final_pdf_uploaded', 'sent_to_production'].includes(ds)

                        // Progress indicator step
                        const progressSteps = [
                          { label: 'Design', active: isDesigning || isProofStage || isProductionStage },
                          { label: 'Review', active: ['awaiting_review', 'in_revision', 'approved_by_customer'].includes(ds) || isProductionStage },
                          { label: 'Approved', active: ds === 'approved_by_customer' || isProductionStage },
                          { label: 'Production', active: isProductionStage },
                        ]

                        return (
                      <div className="hidden md:block space-y-4">
                      {/* Stage Progress Indicator */}
                      <div className="flex items-center gap-1 px-1">
                        {progressSteps.map((step, i) => (
                          <div key={step.label} className="flex items-center gap-1 flex-1">
                            <div className={`flex items-center gap-1.5 ${i < progressSteps.length - 1 ? 'flex-1' : ''}`}>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${step.active ? 'bg-off-black' : 'bg-off-black/15'}`} />
                              <span className={`text-[10px] font-medium whitespace-nowrap ${step.active ? 'text-off-black' : 'text-off-black/30'}`}>
                                {step.label}
                              </span>
                            </div>
                            {i < progressSteps.length - 1 && (
                              <div className={`flex-1 h-px ${step.active && progressSteps[i + 1].active ? 'bg-off-black/30' : 'bg-off-black/10'}`} />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Design Status Dropdown — always visible */}
                      <div>
                        <div className="relative">
                          <select
                            value={DESIGN_STATUS_CONFIG[ds] ? ds : 'not_started'}
                            onChange={(e) => updateDesignStatus(selectedOrder.orderNumber, e.target.value as DesignStatus)}
                            className={`w-full appearance-none px-3 py-2.5 pr-8 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                              (DESIGN_STATUS_CONFIG[ds] || DESIGN_STATUS_CONFIG.not_started).bgColor
                            } ${
                              (DESIGN_STATUS_CONFIG[ds] || DESIGN_STATUS_CONFIG.not_started).color
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

                      {/* Due date — compact inline, always visible */}
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="text-off-black/40">Due {formatDueDate(selectedOrder.dueDate)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-off-black/40">{selectedOrder.productSize}</span>
                          {selectedOrder.isGift && <span className="text-pink-600">🎁 Gift</span>}
                        </div>
                      </div>

                      {/* ═══ STAGE-SPECIFIC PRIMARY ACTION — always at the top ═══ */}

                      {/* Customer approved → upload PDF & notify Eli */}
                      {(ds === 'approved_by_customer' || ds === 'final_pdf_uploaded') && (
                        <PostApprovalChecklist
                          orderId={selectedOrder.id}
                          orderNumber={selectedOrder.orderNumber}
                          displayOrderNumber={selectedOrder.displayOrderNumber}
                          designStatus={ds}
                          onDesignStatusChange={(s) => updateDesignStatus(selectedOrder.orderNumber, s as DesignStatus)}
                        />
                      )}

                      {/* Customer Feedback Banner — when in revision */}
                      {ds === 'in_revision' && latestFeedback && (
                        <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-1">Customer Feedback</p>
                          <p className="text-body-sm text-orange-800 whitespace-pre-wrap">{latestFeedback}</p>
                        </div>
                      )}

                      {/* Awaiting Review Info */}
                      {ds === 'awaiting_review' && (() => {
                        const daysSinceSent = selectedOrder.proofSentAt
                          ? Math.floor((Date.now() - new Date(selectedOrder.proofSentAt).getTime()) / (1000 * 60 * 60 * 24))
                          : null
                        const needsFollowUp = daysSinceSent !== null && daysSinceSent >= 3
                        const daysText = daysSinceSent !== null
                          ? `${daysSinceSent} day${daysSinceSent !== 1 ? 's' : ''} ago`
                          : ''
                        return needsFollowUp ? (
                          <div className="bg-red-50 border border-red-200 rounded-md p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🔔</span>
                              <div className="flex-1">
                                <p className="text-xs font-medium text-red-800">No response in {daysSinceSent} day{daysSinceSent !== 1 ? 's' : ''}</p>
                                <p className="text-[10px] text-red-600">Proofs were sent {daysText}.</p>
                              </div>
                            </div>
                            <button
                              onClick={() => sendFollowUp(selectedOrder.id)}
                              disabled={isSendingFollowUp}
                              className="w-full mt-2 px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isSendingFollowUp ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</>
                              ) : (
                                <><Send className="w-3 h-3" /> Send Follow Up</>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2">
                            <span className="text-lg">⏳</span>
                            <div>
                              <p className="text-xs font-medium text-amber-800">Waiting for customer response</p>
                              <p className="text-[10px] text-amber-600">Proofs sent {daysText || 'today'}. You'll get a Slack notification when they respond.</p>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Sent to production — done state */}
                      {ds === 'sent_to_production' && (
                        <PostApprovalChecklist
                          orderId={selectedOrder.id}
                          orderNumber={selectedOrder.orderNumber}
                          displayOrderNumber={selectedOrder.displayOrderNumber}
                          designStatus={ds}
                          onDesignStatusChange={(s) => updateDesignStatus(selectedOrder.orderNumber, s as DesignStatus)}
                        />
                      )}

                      {/* ═══ DETAIL SECTIONS ═══ */}

                      {/* Proofs & Approval — always at top (except sent_to_production) */}
                      {ds !== 'sent_to_production' && (
                        <CollapsibleSection
                          title="Proofs & Approval"
                          defaultOpen={true}
                          badge={selectedOrder.proofCount ? <span className="text-[10px] font-medium text-off-black/30">({selectedOrder.proofCount})</span> : undefined}
                        >
                          <ProofManager
                            orderId={selectedOrder.id}
                            orderNumber={selectedOrder.orderNumber}
                            displayOrderNumber={selectedOrder.displayOrderNumber}
                            designStatus={selectedOrder.designStatus}
                            customerEmail={selectedOrder.customerEmail}
                            onDesignStatusChange={(s) => updateDesignStatus(selectedOrder.orderNumber, s as DesignStatus)}
                            onLatestFeedback={setLatestFeedback}
                          />
                        </CollapsibleSection>
                      )}

                      {/* Design Info — always visible, Dan needs filename at every stage */}
                        <CollapsibleSection title="Design Info" defaultOpen={ds === 'not_started' || ds === 'in_progress'}>
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
                            <CopyableField label="Filename" value={generateFilename(selectedOrder)} />
                            {selectedOrder.customerEmail && (
                              <div className="flex justify-between items-center">
                                <span className="text-body-sm text-off-black/60">Email</span>
                                <span className="text-body-sm font-medium text-off-black">{selectedOrder.customerEmail}</span>
                              </div>
                            )}
                          </div>
                          {selectedOrder.creativeDirection && (
                            <div className="bg-purple-50 border border-purple-200 rounded-md p-4 mt-2">
                              <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1">Creative Direction</p>
                              <p className="text-body-sm text-purple-800 whitespace-pre-wrap">{selectedOrder.creativeDirection}</p>
                            </div>
                          )}
                        </CollapsibleSection>

                      {/* Notes — only if present, hide at production */}
                      {selectedOrder.notes && !isProductionStage && (
                        <CollapsibleSection title="Notes" defaultOpen={false}>
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                            <p className="text-body-sm text-blue-800 whitespace-pre-wrap">{selectedOrder.notes}</p>
                          </div>
                        </CollapsibleSection>
                      )}

                      {/* Comments — hide at production */}
                      {!isProductionStage && (
                        <CollapsibleSection
                          title="Comments"
                          defaultOpen={false}
                          badge={orderComments.length > 0 ? <span className="text-[10px] font-medium text-off-black/30">({orderComments.length})</span> : undefined}
                        >
                          <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3 mb-3">
                            <textarea
                              value={newCommentText}
                              onChange={(e) => setNewCommentText(e.target.value)}
                              onPaste={handleCommentPaste}
                              placeholder="Add a comment or paste an image..."
                              className="w-full px-3 py-2 border border-border-gray rounded-md text-body-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none bg-white"
                              rows={2}
                            />
                            {commentImagePreview && (
                              <div className="relative inline-block">
                                <img src={commentImagePreview} alt="Upload preview" className="max-h-32 rounded-md border border-border-gray" />
                                <button
                                  onClick={clearCommentImage}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer px-3 py-1.5 text-xs border border-border-gray rounded-md hover:bg-white transition-colors text-off-black/60">
                                <ImagePlus className="w-3 h-3 inline mr-1" />
                                Image
                                <input ref={commentFileInputRef} type="file" accept="image/*" onChange={handleCommentFileSelect} className="hidden" />
                              </label>
                              <span className="text-xs text-off-black/40 flex-1">or paste</span>
                              <button
                                onClick={submitComment}
                                disabled={isSubmittingComment || (!newCommentText.trim() && !commentImageFile)}
                                className="px-4 py-1.5 text-xs bg-off-black text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 font-medium"
                              >
                                {isSubmittingComment ? 'Adding...' : 'Add'}
                              </button>
                            </div>
                          </div>
                          {isLoadingComments ? (
                            <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin inline text-off-black/40" /></div>
                          ) : orderComments.length === 0 ? (
                            <p className="text-xs text-off-black/40 text-center py-3">No comments yet</p>
                          ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                              {orderComments.map(comment => (
                                <div key={comment.id} className="bg-white border border-border-gray rounded-md p-3 group">
                                  {comment.imageUrl && (
                                    <a href={comment.imageUrl} target="_blank" rel="noopener noreferrer">
                                      <img src={comment.imageUrl} alt="Attachment" className="max-h-48 rounded-md mb-2 border border-border-gray hover:opacity-90 cursor-pointer" />
                                    </a>
                                  )}
                                  {comment.text && <p className="text-body-sm text-off-black whitespace-pre-wrap">{comment.text}</p>}
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-xs text-off-black/40">
                                      {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                    <button
                                      onClick={() => deleteComment(comment.id)}
                                      className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CollapsibleSection>
                      )}

                      {/* Bottom actions */}
                      <div className="flex gap-3 pt-2">
                        {ds === 'sent_to_production' && (
                          <button
                            onClick={() => updateDesignStatus(selectedOrder.orderNumber, 'not_started')}
                            className="flex-1 px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors font-medium"
                          >
                            Reopen Order
                          </button>
                        )}
                        <button
                          onClick={closeModal}
                          className="flex-1 px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors font-medium"
                        >
                          Close
                        </button>
                      </div>
                      </div>
                        )
                      })()}{/* end hidden md:block wrapper (Custom) */}
                    </>
                  ) : (
                    <>
                  {/* ========== STANDARD ORDER DETAIL VIEW ========== */}

                  {/* === MOBILE COMPACT SUMMARY === */}
                  <div className="md:hidden space-y-3">
                    {/* Key details card */}
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-off-black/60">Runner</span>
                        <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRunnerName || selectedOrder.runnerName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-off-black/60">Race</span>
                        <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRaceName || selectedOrder.raceName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-off-black/60">Year</span>
                        <span className="text-body-sm font-medium text-off-black">{selectedOrder.effectiveRaceYear || selectedOrder.raceYear || <span className="text-warning-amber">Missing</span>}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-body-sm text-off-black/60">Size</span>
                        <span className="text-body-sm font-medium text-off-black">{selectedOrder.productSize}</span>
                      </div>
                    </div>

                    {/* Research section — button, loading state, or results */}
                    {selectedOrder.hasScraperAvailable &&
                     (selectedOrder.effectiveRaceYear || selectedOrder.raceYear) &&
                     selectedOrder.status !== 'completed' ? (
                      selectedOrder.researchStatus === 'found' || selectedOrder.bibNumber || selectedOrder.officialTime || selectedOrder.officialPace ? (
                        /* Results found — show with success styling */
                        <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-3 animate-[fadeIn_0.4s_ease-out]">
                          <div className="flex items-center gap-2">
                            <span className="text-green-600 text-sm">✓</span>
                            <h4 className="text-xs font-semibold text-green-700 uppercase tracking-tight">Research Results</h4>
                          </div>
                          {selectedOrder.bibNumber && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-green-800/60">Bib</span>
                              <span className="text-body-sm font-medium text-green-900">{selectedOrder.bibNumber}</span>
                            </div>
                          )}
                          {selectedOrder.officialTime ? (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-green-800/60">Time</span>
                              <span className="text-body-sm font-medium text-green-900">{selectedOrder.officialTime}</span>
                            </div>
                          ) : selectedOrder.hadNoTime ? (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-green-800/60">Time</span>
                              <span className="text-xs px-2 py-0.5 bg-warning-amber/10 text-warning-amber border border-warning-amber/20 rounded">No Time</span>
                            </div>
                          ) : selectedOrder.timeFromName ? (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-green-800/60">Time</span>
                              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">⏱ {selectedOrder.timeFromName}</span>
                            </div>
                          ) : null}
                          {selectedOrder.officialPace && (
                            <div className="flex justify-between items-center">
                              <span className="text-body-sm text-green-800/60">Pace</span>
                              <span className="text-body-sm font-medium text-green-900">{selectedOrder.officialPace}</span>
                            </div>
                          )}
                        </div>
                      ) : isResearching ? (
                        /* Researching — inline loading state */
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                          <div className="flex items-center justify-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">Researching runner...</span>
                          </div>
                          <div className="mt-3 space-y-2">
                            <div className="h-3 bg-blue-100 rounded animate-pulse" />
                            <div className="h-3 bg-blue-100 rounded animate-pulse w-2/3" />
                          </div>
                        </div>
                      ) : (
                        /* Ready to research — show button */
                        <button
                          onClick={() => researchOrder(selectedOrder.orderNumber)}
                          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                        >
                          <FlaskConical className="w-4 h-4" />
                          Research Runner
                        </button>
                      )
                    ) : (selectedOrder.bibNumber || selectedOrder.officialTime || selectedOrder.officialPace) ? (
                      /* Results exist but no scraper (e.g. manually entered) */
                      <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                        <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight">Race Results</h4>
                        {selectedOrder.bibNumber && (
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Bib</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.bibNumber}</span>
                          </div>
                        )}
                        {selectedOrder.officialTime && (
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Time</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.officialTime}</span>
                          </div>
                        )}
                        {selectedOrder.officialPace && (
                          <div className="flex justify-between items-center">
                            <span className="text-body-sm text-off-black/60">Pace</span>
                            <span className="text-body-sm font-medium text-off-black">{selectedOrder.officialPace}</span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Flag reason */}
                    {selectedOrder.status === 'flagged' && selectedOrder.flagReason && (
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                        <p className="text-xs text-amber-800">{selectedOrder.flagReason}</p>
                      </div>
                    )}

                    {/* Close button */}
                    <button
                      onClick={closeModal}
                      className="w-full px-5 py-3 bg-white border border-border-gray text-off-black rounded-md hover:bg-subtle-gray transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>

                  {/* === DESKTOP FULL DETAIL VIEW === */}
                  {/* Product Info */}
                  <div className="hidden md:block">
                    <h4 className="text-xs font-semibold text-off-black/50 uppercase tracking-tight mb-2">Product Info</h4>
                    <div className="bg-subtle-gray border border-border-gray rounded-md p-4 space-y-3">
                      <StaticField label="Size" value={selectedOrder.productSize} />
                      <CopyableField label="Filename" value={generateFilename(selectedOrder)} />
                    </div>
                  </div>

                  {/* Editable Order Info */}
                  <div className="hidden md:block">
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

                  {/* Race Info, Research, Notes — desktop only */}
                  <div className="hidden md:block space-y-5">
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
                        <CopyableField label="Name" value={selectedOrder.effectiveRunnerName || selectedOrder.runnerName} />
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
                      ) : selectedOrder.hadNoTime ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-off-black/40 w-16">Time</span>
                          <span className="text-xs px-2 py-1 bg-warning-amber/10 text-warning-amber border border-warning-amber/20 rounded">
                            ⚠️ No Time
                          </span>
                        </div>
                      ) : selectedOrder.timeFromName ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-off-black/40 w-16">Time</span>
                          <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                            ⏱ {selectedOrder.timeFromName}
                          </span>
                        </div>
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
                  </div>{/* end hidden md:block wrapper */}

                  {/* Scraper Not Available Warning — desktop only */}
                  <div className="hidden md:block">
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
                  </div>{/* end hidden md:block wrapper */}
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
