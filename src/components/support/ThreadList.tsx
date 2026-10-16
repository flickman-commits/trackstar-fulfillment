import { Clock, Loader2, Mail, UserRound } from 'lucide-react'
import { chip } from '@/lib/ui'
import { ago, waitingFor } from '@/lib/supportDates'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/supportStatus'
import { Avatar } from '@/components/AssigneePicker'
import type { ThreadRow, ThreadStatus } from '@/types/support'

/**
 * The left column: the inbox, one row per thread.
 *
 * Open threads come oldest first, because the customer who has waited
 * longest is next. Each row says who, what, how long they have waited, and
 * who here has it. Nothing is read from Gmail; the mirror is enough.
 */
export function StatusChip({ status, compact = false }: { status: ThreadStatus; compact?: boolean }) {
  return <span className={`${chip} ${STATUS_TONE[status]}`}>{compact && status === 'waiting' ? 'Waiting' : STATUS_LABEL[status]}</span>
}

function Row({ t, active, onClick, index }: { t: ThreadRow; active: boolean; onClick: () => void; index: number }) {
  const who = t.customerName || t.customerEmail || 'Unknown sender'
  const wait = t.status === 'open' ? waitingFor(t.lastInboundAt, t.lastOutboundAt) : null
  const snoozed = t.snoozedUntil && new Date(t.snoozedUntil) > new Date()
  return (
    <button
      onClick={onClick}
      className={`w-full text-left grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-5 py-3 border-b border-border-gray last:border-b-0 transition-colors ${
        active ? 'bg-off-black/[0.045] shadow-[inset_3px_0_0_0_#242424]' : `hover:bg-subtle-gray ${index % 2 === 1 ? 'bg-subtle-gray/30' : ''}`
      }`}
    >
      <span className="min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-off-black truncate">{who}</span>
        {t.messageCount > 1 && <span className="text-[11px] text-off-black/40 tabular-nums shrink-0">{t.messageCount}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0 text-[11px] text-off-black/45 tabular-nums">
        {wait && wait !== 'just now' && (
          <span className={`inline-flex items-center gap-1 ${/d$/.test(wait) ? 'text-red-600 font-medium' : ''}`} title="Waiting on us for this long">
            <Clock className="w-3 h-3" />{wait}
          </span>
        )}
        {snoozed && <span className="inline-flex items-center gap-1 text-off-black/40" title={`Snoozed until ${new Date(t.snoozedUntil as string).toLocaleString()}`}><Clock className="w-3 h-3" />zz</span>}
        <span>{ago(t.lastMessageAt)}</span>
      </span>
      <span className="col-span-2 min-w-0 flex items-center gap-2">
        <span className="text-[13px] text-off-black/80 truncate">{t.subject || '(no subject)'}</span>
      </span>
      <span className="col-span-2 min-w-0 flex items-center gap-2">
        <span className="text-xs text-off-black/50 truncate flex-1">{t.snippet || ' '}</span>
        {t.assignee
          ? <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-off-black/55"><Avatar user={t.assignee} size={16} />{t.assignee.firstName}</span>
          : <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-off-black/35"><UserRound className="w-3 h-3" />Nobody</span>}
      </span>
    </button>
  )
}

export default function ThreadList({ threads, selectedId, onSelect, loading, emptyLabel }: {
  threads: ThreadRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  emptyLabel: string
}) {
  return (
    <div className="w-full lg:w-[360px] xl:w-[400px] shrink-0 lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-border-gray min-h-0 max-h-[40vh] lg:max-h-none overflow-y-auto">
      {threads.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-off-black/50">
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-off-black/30" /> : <><Mail className="w-6 h-6 mx-auto mb-2 text-off-black/25" />{emptyLabel}</>}
        </div>
      ) : threads.map((t, i) => <Row key={t.id} t={t} active={t.id === selectedId} onClick={() => onSelect(t.id)} index={i} />)}
    </div>
  )
}
