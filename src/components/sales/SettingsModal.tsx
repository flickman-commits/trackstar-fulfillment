import { useEffect, useState } from 'react'
import { X, Loader2, Plug, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { btnPrimary, btnSecondary, btnGhost, fieldLabel, inputBase, segment, segmentGroup } from '@/lib/ui'
import { useEscape } from '@/lib/useEscape'
import { salesApi } from '@/lib/salesApi'
import type { SalesSettings, SalesStatus } from '@/types/sales'

/**
 * Everything that is not today's work: the cap, who the emails are from and
 * how they are signed, Gmail, the mirrors, and the automation status that
 * used to crowd the page header.
 */
type Tab = 'sending' | 'voice' | 'connections' | 'automation'

export default function SettingsModal({ status, aiOn, onAiChange, onClose }: {
  status: SalesStatus | null
  aiOn: boolean
  onAiChange: (on: boolean) => void
  onClose: () => void
}) {
  useEscape(onClose)
  const [tab, setTab] = useState<Tab>('sending')
  const [s, setS] = useState<SalesSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [check, setCheck] = useState<{ notion: { configured: boolean; ok: boolean; error?: string; sample?: string }; clickup: { configured: boolean; ok: boolean; error?: string } } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => { salesApi.settings().then(r => setS(r.settings)).catch(e => toast.error((e as Error).message)) }, [])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const r = await salesApi.saveSettings({ dailyCap: s.dailyCap, sender: s.sender, socialProof: s.socialProof, priorityRaces: s.priorityRaces, signature: s.signature, timezone: s.timezone, undoSeconds: s.undoSeconds })
      setS(r.settings); toast.success('Saved'); onClose()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  const runCheck = async () => {
    setChecking(true)
    try { setCheck(await salesApi.checkMirrors()) } catch (e) { toast.error((e as Error).message) } finally { setChecking(false) }
  }

  const TZ = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC']

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <h2 className="text-base font-semibold text-off-black">Sales settings</h2>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pt-3">
          <div className={segmentGroup}>
            {(['sending', 'voice', 'connections', 'automation'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={segment(tab === t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>

        {!s ? (
          <div className="flex items-center justify-center h-40 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="px-5 py-4 overflow-y-auto space-y-4 text-sm">
            {tab === 'sending' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={fieldLabel}>Emails per day</label>
                    <input type="number" min={1} max={50} value={s.dailyCap} onChange={e => setS({ ...s, dailyCap: Number(e.target.value) })} className={`${inputBase} w-full`} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Undo window (s)</label>
                    <input type="number" min={0} max={60} value={s.undoSeconds} onChange={e => setS({ ...s, undoSeconds: Number(e.target.value) })} className={`${inputBase} w-full`} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Business day</label>
                    <select value={s.timezone} onChange={e => setS({ ...s, timezone: e.target.value })} className={`${inputBase} w-full`}>
                      {[...new Set([s.timezone, ...TZ])].map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-off-black/50">The cap is what the overnight routine prepares and what the page counts toward. These go from the same domain as order confirmations, so a spike costs more than a campaign earns.</p>
                <div>
                  <label className={fieldLabel}>Signature</label>
                  <textarea rows={6} value={s.signature} onChange={e => setS({ ...s, signature: e.target.value })} className={`${inputBase} w-full resize-y font-mono text-[11.5px]`} spellCheck={false} />
                  <p className="text-xs text-off-black/50 mt-1">HTML. Added after the body of every email you send, before any P.S. Drafts themselves carry no sign-off.</p>
                  <div className="mt-2 rounded-lg border border-border-gray bg-subtle-gray px-4 py-3">
                    <div className="font-mono text-[10px] tracking-wider uppercase text-off-black/40 mb-1">Preview</div>
                    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 14, color: '#333', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: s.signature }} />
                  </div>
                </div>
              </>
            )}

            {tab === 'voice' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={fieldLabel}>Sender name</label><input value={s.sender.name} onChange={e => setS({ ...s, sender: { ...s.sender, name: e.target.value } })} className={`${inputBase} w-full`} /></div>
                  <div><label className={fieldLabel}>Role</label><input value={s.sender.role} onChange={e => setS({ ...s, sender: { ...s.sender, role: e.target.value } })} className={`${inputBase} w-full`} /></div>
                </div>
                <div><label className={fieldLabel}>Founder story (one sentence, first person)</label><textarea rows={2} value={s.sender.story} onChange={e => setS({ ...s, sender: { ...s.sender, story: e.target.value } })} className={`${inputBase} w-full resize-y`} /></div>
                <div><label className={fieldLabel}>Race partners to cite</label><input type="number" min={0} value={s.sender.partnerCount} onChange={e => setS({ ...s, sender: { ...s.sender, partnerCount: Number(e.target.value) } })} className={`${inputBase} w-24`} /></div>
                <div>
                  <label className={fieldLabel}>Social proof line</label>
                  <textarea rows={2} value={s.socialProof} onChange={e => setS({ ...s, socialProof: e.target.value })} className={`${inputBase} w-full resize-y`} />
                  <p className="text-xs text-off-black/50 mt-1">Leads the fourth race touch. Update the numbers as the season moves.</p>
                </div>
                <div>
                  <label className={fieldLabel}>Races to source charity teams from, in priority order</label>
                  <textarea rows={6} value={s.priorityRaces.join('\n')} onChange={e => setS({ ...s, priorityRaces: e.target.value.split('\n') })} className={`${inputBase} w-full resize-y font-mono text-xs`} />
                  <p className="text-xs text-off-black/50 mt-1">One per line. The overnight routine works down this list only when the stack has room.</p>
                </div>
              </>
            )}

            {tab === 'connections' && (
              <>
                <div className="rounded-lg border border-border-gray p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Gmail</div>
                      <div className="text-xs text-off-black/55 mt-0.5">
                        {!status?.gmail.configured ? 'Not configured on the server (GOOGLE_OAUTH_CLIENT_ID / SECRET).'
                          : status.gmail.connected ? `Sending as ${status.gmail.email}.${status.gmail.canReadReplies ? ' Reply detection on.' : ' Reconnect once to allow reply detection.'}`
                          : 'Not connected. Emails cannot be sent until it is.'}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {status?.gmail.configured && <a href={salesApi.gmailConnectUrl} className={btnSecondary}>{status.gmail.connected ? 'Reconnect' : 'Connect'}</a>}
                      {status?.gmail.connected && <button onClick={async () => { await salesApi.gmailDisconnect(); toast.message('Gmail disconnected'); onClose() }} className={btnGhost}>Disconnect</button>}
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border-gray p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Mirrors</div>
                    <button onClick={runCheck} disabled={checking} className={btnSecondary}>{checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />} Check connections</button>
                  </div>
                  <p className="text-xs text-off-black/50 mt-1">Every send updates the Notion charity row and the ClickUp race task. This reads one row from each to confirm the app can reach them.</p>
                  {check && (
                    <ul className="mt-2 space-y-1 text-xs">
                      <li className={check.notion.ok ? 'text-success-green' : check.notion.configured ? 'text-red-600' : 'text-off-black/50'}>Notion: {check.notion.ok ? `connected (read "${check.notion.sample}")` : check.notion.configured ? check.notion.error : 'not configured'}</li>
                      <li className={check.clickup.ok ? 'text-success-green' : check.clickup.configured ? 'text-red-600' : 'text-off-black/50'}>ClickUp: {check.clickup.ok ? 'connected' : check.clickup.configured ? check.clickup.error : 'not configured (set CLICKUP_API_TOKEN to mirror race stages)'}</li>
                    </ul>
                  )}
                </div>
              </>
            )}

            {tab === 'automation' && (
              <>
                <div className="rounded-lg border border-border-gray p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Use AI on this page</div>
                    <div className="text-xs text-off-black/55 mt-0.5">Rewrite and Research call the model. Off means Rewrite uses the cadence template and Research is disabled. The overnight routine is unaffected.</div>
                  </div>
                  <button onClick={() => onAiChange(!aiOn)} disabled={!status?.llm.configured} className={`${aiOn && status?.llm.configured ? btnPrimary : btnSecondary} shrink-0`}>
                    {status?.llm.configured ? (aiOn ? 'On' : 'Off') : 'No model'}
                  </button>
                </div>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-off-black/50">Model</dt><dd>{status?.llm.configured ? `${status.llm.provider} · ${status.llm.model}` : 'not configured'}</dd>
                  <dt className="text-off-black/50">Research</dt><dd>{status?.research.configured ? status.research.provider : 'off'}</dd>
                  <dt className="text-off-black/50">Overnight run</dt>
                  <dd>
                    {status?.lastRun ? (
                      <>
                        {new Date(status.lastRun.finishedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {status.lastRun.prepared} prepared, {status.lastRun.researched} researched, {status.lastRun.leadsAdded} leads
                        {status.lastRun.notes && <p className="text-off-black/60 mt-1 leading-snug">{status.lastRun.notes}</p>}
                        {status.lastRun.skipped.length > 0 && <p className="text-amber-700 mt-1">Skipped: {status.lastRun.skipped.join('; ')}</p>}
                      </>
                    ) : 'has not run yet'}
                  </dd>
                </dl>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-gray">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={save} disabled={!s || saving} className={btnPrimary}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  )
}
