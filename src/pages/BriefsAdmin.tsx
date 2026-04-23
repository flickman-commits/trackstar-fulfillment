import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plus, X, FileText, Archive, Users } from 'lucide-react'
import { apiFetch } from '@/lib/api'

type BriefStatus = 'active' | 'archived'

interface Brief {
  id: string
  title: string
  description: string | null
  styleOfVideo: string | null
  angle: string | null
  targetLength: string | null
  hooks: string | null
  persona: string | null
  examplesNotes: string | null
  status: BriefStatus
  createdAt: string
  updatedAt: string
  _count?: { assignments: number }
}

const EMPTY_BRIEF: Omit<Brief, 'id' | 'createdAt' | 'updatedAt' | '_count'> = {
  title: '',
  description: '',
  styleOfVideo: '',
  angle: '',
  targetLength: '',
  hooks: '',
  persona: '',
  examplesNotes: '',
  status: 'active',
}

export default function BriefsAdmin() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Brief | 'new' | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders/actions?action=list-briefs')
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const { briefs } = await res.json()
      setBriefs(briefs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load briefs')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const activeBriefs = briefs.filter(b => b.status === 'active')
  const archivedBriefs = briefs.filter(b => b.status === 'archived')

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/trackstar-logo.png" alt="Trackstar" className="h-8 md:h-10" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-off-black">Briefs</h1>
              <p className="text-sm text-off-black/50">Content direction Matt assigns to creators</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/creators"
              className="px-3 py-2 text-xs md:text-sm text-off-black/60 hover:text-off-black hover:bg-off-black/5 rounded transition-colors"
            >
              ← Creators
            </Link>
            <button
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              New Brief
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-off-black/40" />
          </div>
        )}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 text-sm">{error}</div>
        )}

        {!isLoading && !error && briefs.length === 0 && (
          <div className="bg-white border border-dashed border-off-black/20 rounded-md p-10 text-center">
            <FileText className="w-8 h-8 text-off-black/30 mx-auto mb-3" />
            <p className="text-sm text-off-black/60 mb-1">No briefs yet.</p>
            <p className="text-xs text-off-black/40">Click "New Brief" to create your first.</p>
          </div>
        )}

        {!isLoading && activeBriefs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-off-black/50 uppercase tracking-wider">Active</h2>
            {activeBriefs.map(b => <BriefCard key={b.id} brief={b} onClick={() => setEditing(b)} />)}
          </div>
        )}

        {!isLoading && archivedBriefs.length > 0 && (
          <div className="space-y-3 mt-10">
            <h2 className="text-xs font-semibold text-off-black/50 uppercase tracking-wider inline-flex items-center gap-1">
              <Archive className="w-3 h-3" /> Archived
            </h2>
            {archivedBriefs.map(b => <BriefCard key={b.id} brief={b} onClick={() => setEditing(b)} muted />)}
          </div>
        )}
      </div>

      {editing && (
        <BriefEditor
          brief={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function BriefCard({ brief, onClick, muted = false }: { brief: Brief; onClick: () => void; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-md p-4 md:p-5 hover:shadow-sm transition-all ${
        muted ? 'border-off-black/10 opacity-70' : 'border-border-gray shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`text-base font-semibold ${muted ? 'text-off-black/50' : 'text-off-black'}`}>{brief.title}</h3>
            {(brief._count?.assignments ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-off-black/50 bg-off-black/5 px-1.5 py-0.5 rounded">
                <Users className="w-3 h-3" />
                {brief._count?.assignments}
              </span>
            )}
          </div>
          {brief.description && (
            <p className={`text-sm line-clamp-2 ${muted ? 'text-off-black/40' : 'text-off-black/60'}`}>
              {brief.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {brief.styleOfVideo && <Chip label={brief.styleOfVideo} />}
            {brief.targetLength && <Chip label={brief.targetLength} />}
            {brief.angle && <Chip label={brief.angle} />}
          </div>
        </div>
      </div>
    </button>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-medium text-off-black/60 bg-off-black/5 rounded">
      {label}
    </span>
  )
}

function BriefEditor({ brief, onClose, onSaved }: {
  brief: Brief | null
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = brief === null
  const [draft, setDraft] = useState(brief || { ...EMPTY_BRIEF, id: '', createdAt: '', updatedAt: '' } as Brief)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!draft.title.trim()) {
      alert('Title is required')
      return
    }
    setIsSaving(true)
    try {
      const body = isNew
        ? {
            action: 'create-brief',
            title: draft.title,
            description: draft.description,
            styleOfVideo: draft.styleOfVideo,
            angle: draft.angle,
            targetLength: draft.targetLength,
            hooks: draft.hooks,
            persona: draft.persona,
            examplesNotes: draft.examplesNotes,
            status: draft.status,
          }
        : {
            action: 'update-brief',
            briefId: draft.id,
            updates: {
              title: draft.title,
              description: draft.description,
              styleOfVideo: draft.styleOfVideo,
              angle: draft.angle,
              targetLength: draft.targetLength,
              hooks: draft.hooks,
              persona: draft.persona,
              examplesNotes: draft.examplesNotes,
              status: draft.status,
            }
          }

      const res = await apiFetch('/api/orders/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Save failed: ${res.status}`)
      }
      onSaved()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-off-black/60 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-md max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-off-black">
              {isNew ? 'New Brief' : 'Edit Brief'}
            </h3>
            <button onClick={onClose} className="text-off-black/40 hover:text-off-black">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <FieldText label="Title *" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} placeholder="e.g. Unboxing reveal, marathon finisher" autoFocus />
            <FieldText label="Description" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} multiline placeholder="Overall goal or context of this brief" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldText label="Style of Video" value={draft.styleOfVideo} onChange={(v) => setDraft({ ...draft, styleOfVideo: v })} placeholder="e.g. POV reveal, talking head" />
              <FieldText label="Target Length" value={draft.targetLength} onChange={(v) => setDraft({ ...draft, targetLength: v })} placeholder="e.g. 15-30s, 60-90s" />
              <FieldText label="Angle" value={draft.angle} onChange={(v) => setDraft({ ...draft, angle: v })} placeholder="e.g. emotional payoff, nostalgia" />
              <FieldText label="Persona" value={draft.persona} onChange={(v) => setDraft({ ...draft, persona: v })} placeholder="Who they're speaking to" />
            </div>

            <FieldText label="Hooks (one per line)" value={draft.hooks} onChange={(v) => setDraft({ ...draft, hooks: v })} multiline placeholder={`I trained for 6 months for this...\nThe moment I realized I actually did it`} />
            <FieldText label="Examples / Reference Notes" value={draft.examplesNotes} onChange={(v) => setDraft({ ...draft, examplesNotes: v })} multiline placeholder="Paste reference URLs, describe the vibe, etc." />

            <div>
              <Label>Status</Label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as BriefStatus })}
                className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
              >
                <option value="active">Active (visible to creators)</option>
                <option value="archived">Archived (hidden)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border-gray">
            <button onClick={onClose} className="px-4 py-2 text-sm text-off-black/60 hover:bg-off-black/5 rounded transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !draft.title.trim()}
              className="px-4 py-2 bg-off-black text-white text-sm font-medium rounded hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isSaving ? 'Saving…' : (isNew ? 'Create Brief' : 'Save Changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-off-black/60 mb-1">{children}</div>
}

function FieldText({ label, value, onChange, multiline, placeholder, autoFocus }: {
  label: string
  value: string | null
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full px-3 py-2 border border-border-gray rounded text-sm focus:outline-none focus:ring-2 focus:ring-off-black/20"
        />
      )}
    </div>
  )
}
