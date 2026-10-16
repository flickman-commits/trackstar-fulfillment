import { useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { btnGhost, btnPrimary, btnSecondary, inputBase } from '@/lib/ui'
import { supportApi } from '@/lib/supportApi'
import { useEscape } from '@/lib/useEscape'
import type { Macro } from '@/types/support'

/**
 * Macros, managed: the saved replies the composer offers. Seeded from the
 * playbook; edited here. {{first_name}} and {{rep}} fill in on insert;
 * [brackets] are for the rep to fill. The greeting and sign-off are not
 * part of a macro, the composer adds them.
 */
export default function MacrosModal({ macros, onChanged, onClose }: { macros: Macro[]; onChanged: () => void; onClose: () => void }) {
  const [editing, setEditing] = useState<Partial<Macro> | null>(null)
  const [saving, setSaving] = useState(false)
  useEscape(onClose)

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await supportApi.saveMacro({ id: editing.id, name: editing.name || '', body: editing.body || '' })
      toast.success(editing.id ? 'Macro saved' : 'Macro added')
      setEditing(null); onChanged()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  const remove = async (m: Macro) => {
    if (!window.confirm(`Delete "${m.name}"?`)) return
    try { await supportApi.deleteMacro(m.id); toast.success('Macro deleted'); onChanged() }
    catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-border-gray flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-off-black">Macros</div>
            <div className="text-xs text-off-black/50">Saved replies. {'{{first_name}}'} and {'{{rep}}'} fill in; [brackets] are yours to fill.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing({ name: '', body: '' })} className={btnPrimary}><Plus className="w-3.5 h-3.5" /> New macro</button>
            <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className={`${editing ? 'hidden md:block md:w-[280px]' : 'w-full'} shrink-0 overflow-y-auto border-r border-border-gray`}>
            {macros.map(m => (
              <button key={m.id} onClick={() => setEditing(m)} className={`w-full text-left px-4 py-2.5 border-b border-border-gray/70 hover:bg-subtle-gray ${editing?.id === m.id ? 'bg-subtle-gray' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-off-black truncate">{m.name}</span>
                  <span className="text-[10px] text-off-black/40 tabular-nums shrink-0">{m.uses ? `${m.uses}×` : ''}</span>
                </div>
                {!editing && <div className="text-[11px] text-off-black/50 truncate">{m.body.replace(/\s+/g, ' ')}</div>}
              </button>
            ))}
            {macros.length === 0 && <div className="px-4 py-8 text-sm text-off-black/50 text-center">No macros yet.</div>}
          </div>
          {editing && (
            <div className="flex-1 min-w-0 p-5 flex flex-col gap-3 overflow-y-auto">
              <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Name, e.g. Order shipped" className={`${inputBase} w-full`} autoFocus />
              <textarea value={editing.body || ''} onChange={e => setEditing({ ...editing, body: e.target.value })} rows={12} placeholder="The reply, without the greeting or the sign-off." className={`${inputBase} w-full resize-y leading-relaxed`} />
              <div className="flex items-center gap-2">
                {editing.id && <button onClick={() => remove(editing as Macro)} className={`${btnGhost} text-red-600 hover:text-red-700`}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
                <span className="flex-1" />
                <button onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
                <button onClick={save} disabled={saving || !(editing.name || '').trim() || !(editing.body || '').trim()} className={btnPrimary}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
