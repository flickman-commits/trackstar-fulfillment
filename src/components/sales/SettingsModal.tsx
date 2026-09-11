import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { btnPrimary, btnSecondary, btnGhost, fieldLabel, inputBase } from '@/lib/ui'
import { salesApi } from '@/lib/salesApi'
import type { SalesSettings } from '@/types/sales'

/**
 * The knobs a business decision turns. Saved values reach the overnight
 * routine on its next run, no deploy.
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SalesSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    salesApi.settings().then(r => setS(r.settings)).catch(e => toast.error((e as Error).message))
  }, [])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const r = await salesApi.saveSettings({
        dailyCap: s.dailyCap,
        sender: s.sender,
        socialProof: s.socialProof,
        priorityRaces: s.priorityRaces,
      })
      setS(r.settings)
      toast.success('Saved. The next overnight run uses these.')
      onClose()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <div>
            <h2 className="text-base font-semibold text-off-black">Sales settings</h2>
            <p className="text-xs text-off-black/55 mt-0.5">What the overnight routine and the composer use. Changes apply on the next run.</p>
          </div>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>

        {!s ? (
          <div className="flex items-center justify-center h-32 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="px-5 py-4 overflow-y-auto space-y-4 text-sm">
            <div>
              <label className={fieldLabel}>Emails prepared per night</label>
              <input type="number" min={1} max={50} value={s.dailyCap} onChange={e => setS({ ...s, dailyCap: Number(e.target.value) })} className={`${inputBase} w-24`} />
              <p className="text-xs text-off-black/50 mt-1">The runbook says ten. These go from the same domain as order confirmations, so a spike costs more than a campaign earns.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>Sender name</label>
                <input value={s.sender.name} onChange={e => setS({ ...s, sender: { ...s.sender, name: e.target.value } })} className={`${inputBase} w-full`} />
              </div>
              <div>
                <label className={fieldLabel}>Role</label>
                <input value={s.sender.role} onChange={e => setS({ ...s, sender: { ...s.sender, role: e.target.value } })} className={`${inputBase} w-full`} />
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Founder story (one sentence, first person)</label>
              <textarea rows={2} value={s.sender.story} onChange={e => setS({ ...s, sender: { ...s.sender, story: e.target.value } })} className={`${inputBase} w-full resize-y`} />
            </div>
            <div>
              <label className={fieldLabel}>Race partners to cite</label>
              <input type="number" min={0} value={s.sender.partnerCount} onChange={e => setS({ ...s, sender: { ...s.sender, partnerCount: Number(e.target.value) } })} className={`${inputBase} w-24`} />
            </div>

            <div>
              <label className={fieldLabel}>Social proof line</label>
              <textarea rows={2} value={s.socialProof} onChange={e => setS({ ...s, socialProof: e.target.value })} className={`${inputBase} w-full resize-y`} />
              <p className="text-xs text-off-black/50 mt-1">Leads the fourth race touch. Update the numbers as the season moves.</p>
            </div>

            <div>
              <label className={fieldLabel}>Races to source charity teams from, in priority order</label>
              <textarea
                rows={7}
                value={s.priorityRaces.join('\n')}
                onChange={e => setS({ ...s, priorityRaces: e.target.value.split('\n') })}
                className={`${inputBase} w-full resize-y font-mono text-xs`}
              />
              <p className="text-xs text-off-black/50 mt-1">One per line. The routine works down this list only when the queue has room.</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-gray">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={save} disabled={!s || saving} className={btnPrimary}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}
