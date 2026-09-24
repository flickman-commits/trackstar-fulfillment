import { useEffect, useState } from 'react'
import { X, Loader2, Plug, Mail, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { btnPrimary, btnSecondary, btnGhost, fieldLabel, inputBase, segment, segmentGroup } from '@/lib/ui'
import { useEscape } from '@/lib/useEscape'
import { salesApi, type LibraryTemplate, type TemplateMotion } from '@/lib/salesApi'
import type { AttioCheck, Pipeline, SalesSettings, SalesStatus, Sender, TemplateStep, TemplateTable } from '@/types/sales'

/**
 * Everything that is not today's work.
 *
 * Me: your name and signature, which every email you send carries.
 * Templates: the saved templates the composer's menu offers (add, change,
 * delete), and the sequence copy each touch's draft starts from. Sending:
 * the workspace's cap, undo window and business day (admins). Connections:
 * your Gmail, and whether Attio has the fields the tool reads. Automation:
 * the AI switch and the last overnight run.
 */
type Tab = 'me' | 'templates' | 'sending' | 'connections' | 'automation'

export default function SettingsModal({ status, aiOn, onAiChange, onClose }: {
  status: SalesStatus | null
  aiOn: boolean
  onAiChange: (on: boolean) => void
  onClose: () => void
}) {
  useEscape(onClose)
  const isAdmin = status?.me.role === 'admin'
  const [tab, setTab] = useState<Tab>('me')
  const [s, setS] = useState<SalesSettings | null>(null)
  const [me, setMe] = useState<Sender | null>(null)
  const [saving, setSaving] = useState(false)
  const [check, setCheck] = useState<AttioCheck | null>(null)
  const [templates, setTemplates] = useState<TemplateTable | null>(null)
  const [templateDefaults, setTemplateDefaults] = useState<TemplateTable | null>(null)
  const [steps, setSteps] = useState<Record<Pipeline, TemplateStep[]> | null>(null)
  const [placeholders, setPlaceholders] = useState<[string, string][]>([])
  const [tPipeline, setTPipeline] = useState<Pipeline>('CHARITY')
  const [tAngle, setTAngle] = useState<string>('first-touch')
  const [tDraft, setTDraft] = useState<{ subject: string; body: string } | null>(null)
  const [tSaving, setTSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [tView, setTView] = useState<'library' | 'sequence'>('library')
  const [library, setLibrary] = useState<LibraryTemplate[] | null>(null)
  const [libId, setLibId] = useState<string | null>(null)
  const [libDraft, setLibDraft] = useState<Partial<LibraryTemplate> | null>(null)
  const [libSaving, setLibSaving] = useState(false)

  useEffect(() => { salesApi.settings().then(r => { setS(r.settings); setMe(r.sender); setTemplates(r.templates); setTemplateDefaults(r.templateDefaults); setSteps(r.templateSteps); setPlaceholders(r.placeholders) }).catch(e => toast.error((e as Error).message)) }, [])
  // The editor shows one touch at a time; switching touches loads its copy.
  useEffect(() => { const t = templates?.[tPipeline]?.[tAngle]; setTDraft(t ? { subject: t.subject, body: t.body } : null) }, [templates, tPipeline, tAngle])
  useEffect(() => {
    if (tab !== 'templates' || library) return
    salesApi.library().then(r => { setLibrary(r.templates); const first = r.templates[0]; setLibId(first?.id || null); setLibDraft(first ? { ...first } : null) })
      .catch(e => toast.error((e as Error).message))
  }, [tab, library])
  const pickLib = (t: LibraryTemplate | null) => {
    setLibId(t?.id || null)
    setLibDraft(t ? { ...t } : { name: '', motion: 'Charity', useFor: '', subject: '', body: 'Hey [First Name],\n\n' })
  }
  const libSaved = library?.find(t => t.id === libId)
  const libDirty = Boolean(libDraft) && (!libSaved || (['name', 'motion', 'useFor', 'subject', 'body'] as const).some(k => (libDraft?.[k] || '') !== (libSaved[k] || '')))
  const saveLib = async () => {
    if (!libDraft) return
    setLibSaving(true)
    try {
      const r = await salesApi.saveLibraryTemplate({ ...libDraft, id: libId || undefined })
      setLibrary(r.templates)
      const saved = libId ? r.templates.find(t => t.id === libId) : r.templates[r.templates.length - 1]
      if (saved) { setLibId(saved.id); setLibDraft({ ...saved }) }
      toast.success('Template saved')
    } catch (e) { toast.error((e as Error).message) }
    finally { setLibSaving(false) }
  }
  const deleteLib = async () => {
    if (!libId || !libSaved || !window.confirm(`Delete "${libSaved.name}"? This cannot be undone.`)) return
    try {
      const r = await salesApi.deleteLibraryTemplate(libId)
      setLibrary(r.templates); pickLib(r.templates[0] || null); if (!r.templates.length) { setLibId(null); setLibDraft(null) }
      toast.message('Template deleted')
    } catch (e) { toast.error((e as Error).message) }
  }

  const saveTemplate = async (reset = false) => {
    if (!tDraft) return
    setTSaving(true)
    try {
      const r = await salesApi.saveTemplate(reset ? { pipeline: tPipeline, angle: tAngle, subject: '', body: '' } : { pipeline: tPipeline, angle: tAngle, subject: tDraft.subject, body: tDraft.body })
      setTemplates(r.templates); toast.success(reset ? 'Back to the default' : 'Template saved')
    } catch (e) { toast.error((e as Error).message) }
    finally { setTSaving(false) }
  }

  const save = async () => {
    if (!s || !me) return
    setSaving(true)
    try {
      await salesApi.saveSender({ name: me.name, role: me.role, story: me.story, signature: me.signature })
      if (isAdmin) await salesApi.saveSettings({ dailyCap: s.dailyCap, socialProof: s.socialProof, timezone: s.timezone, undoSeconds: s.undoSeconds })
      toast.success('Saved'); onClose()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  const runCheck = async () => {
    setChecking(true)
    try { setCheck((await salesApi.checkAttio()).attio) } catch (e) { toast.error((e as Error).message) } finally { setChecking(false) }
  }

  const TZ = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC']
  const tabs: Tab[] = isAdmin ? ['me', 'templates', 'sending', 'connections', 'automation'] : ['me', 'templates', 'connections', 'automation']
  const label: Record<Tab, string> = { me: 'Me', templates: 'Templates', sending: 'Sending', connections: 'Connections', automation: 'Automation' }

  return (
    <div className="fixed inset-0 z-50 bg-off-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray">
          <h2 className="text-base font-semibold text-off-black">Sales settings</h2>
          <button onClick={onClose} className={btnGhost}><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pt-3">
          <div className={segmentGroup}>
            {tabs.map(t => <button key={t} onClick={() => setTab(t)} className={segment(tab === t)}>{label[t]}</button>)}
          </div>
        </div>

        {!s || !me ? (
          <div className="flex items-center justify-center h-40 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="px-5 py-4 overflow-y-auto space-y-4 text-sm">
            {tab === 'me' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={fieldLabel}>First name, as the emails say it</label><input value={me.name} onChange={e => setMe({ ...me, name: e.target.value })} className={`${inputBase} w-full`} /></div>
                  <div><label className={fieldLabel}>Role</label><input value={me.role} onChange={e => setMe({ ...me, role: e.target.value })} placeholder="founder at Trackstar" className={`${inputBase} w-full`} /></div>
                </div>
                <div>
                  <label className={fieldLabel}>Your one-line story (optional, first person)</label>
                  <textarea rows={2} value={me.story} onChange={e => setMe({ ...me, story: e.target.value })} placeholder="Why you are the one writing. Goes in the who-I-am line of a first touch." className={`${inputBase} w-full resize-y`} />
                </div>
                <div>
                  <label className={fieldLabel}>Signature</label>
                  <textarea rows={6} value={me.signature} onChange={e => setMe({ ...me, signature: e.target.value })} className={`${inputBase} w-full resize-y font-mono text-[11.5px]`} spellCheck={false} />
                  <p className="text-xs text-off-black/50 mt-1">
                    HTML, not rich text: pasting from Mail or Gmail drops the formatting, so paste the HTML itself. An image has to live at a public URL, not be pasted in. Added after the body of every email you send, before any P.S.{me.isDefault ? ' This is the workspace default until you save your own.' : ''}
                  </p>
                  <div className="mt-2 rounded-lg border border-border-gray bg-subtle-gray px-4 py-3">
                    <div className="font-mono text-[10px] tracking-wider uppercase text-off-black/40 mb-1">Preview</div>
                    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 14, color: '#333', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: me.signature }} />
                  </div>
                </div>
              </>
            )}

            {tab === 'templates' && (
              <div className={segmentGroup}>
                <button onClick={() => setTView('library')} className={segment(tView === 'library')}>Saved templates</button>
                <button onClick={() => setTView('sequence')} className={segment(tView === 'sequence')}>Sequence</button>
              </div>
            )}
            {tab === 'templates' && tView === 'library' && (
              !library ? <div className="flex items-center justify-center h-32 text-off-black/40"><Loader2 className="w-4 h-4 animate-spin" /></div> : (
                <div className="grid grid-cols-[200px_1fr] gap-4 min-h-[380px]">
                  <div className="flex flex-col border-r border-border-gray pr-3">
                    <p className="text-xs text-off-black/55 mb-2">What the Templates button in the composer offers.</p>
                    <div className="flex-1 space-y-0.5">
                      {library.map(t => (
                        <button key={t.id} onClick={() => pickLib(t)} className={`w-full text-left px-2.5 py-2 rounded-md ${t.id === libId ? 'bg-off-black/[0.06]' : 'hover:bg-subtle-gray'}`}>
                          <span className="block text-[13px] font-medium text-off-black leading-tight">{t.name}</span>
                          <span className="block text-[11px] text-off-black/45 mt-0.5">{t.motion === 'Any' ? 'Any deal' : t.motion}</span>
                        </button>
                      ))}
                      {library.length === 0 && <p className="text-xs text-off-black/45 px-2.5 py-2">No templates yet.</p>}
                    </div>
                    {isAdmin && <button onClick={() => pickLib(null)} className={`${btnSecondary} mt-3`}><Plus className="w-3.5 h-3.5" /> New template</button>}
                  </div>
                  {libDraft ? (
                    <div className="space-y-3 min-w-0">
                      <div className="grid grid-cols-[1fr_130px] gap-3">
                        <div><label className={fieldLabel}>Name</label><input value={libDraft.name || ''} onChange={e => setLibDraft({ ...libDraft, name: e.target.value })} disabled={!isAdmin} placeholder="First Touch (Loom)" className={`${inputBase} w-full`} /></div>
                        <div><label className={fieldLabel}>For</label>
                          <select value={libDraft.motion || 'Any'} onChange={e => setLibDraft({ ...libDraft, motion: e.target.value as TemplateMotion })} disabled={!isAdmin} className={`${inputBase} w-full`}>
                            <option value="Charity">Charity</option><option value="Race">Race</option><option value="Any">Any deal</option>
                          </select>
                        </div>
                      </div>
                      <div><label className={fieldLabel}>When to use it</label><input value={libDraft.useFor || ''} onChange={e => setLibDraft({ ...libDraft, useFor: e.target.value })} disabled={!isAdmin} placeholder="Follow-up where the first touch went out without the video" className={`${inputBase} w-full`} /></div>
                      <div><label className={fieldLabel}>Subject</label><input value={libDraft.subject || ''} onChange={e => setLibDraft({ ...libDraft, subject: e.target.value })} disabled={!isAdmin} placeholder="Leave empty to reply on the thread" className={`${inputBase} w-full`} /></div>
                      <div><label className={fieldLabel}>Body</label><textarea rows={13} value={libDraft.body || ''} onChange={e => setLibDraft({ ...libDraft, body: e.target.value })} disabled={!isAdmin} className={`${inputBase} w-full resize-y text-[13px] leading-relaxed`} /></div>
                      <details className="text-xs text-off-black/55">
                        <summary className="cursor-pointer">Placeholders</summary>
                        <dl className="mt-1 grid grid-cols-[130px_1fr] gap-x-2 gap-y-0.5">
                          {[...placeholders, ['[Your name]', 'your first name, from Me'] as [string, string]].map(([k, v]) => [<dt key={`${k}k`} className="font-medium text-off-black/70">{k}</dt>, <dd key={`${k}v`}>{v}</dd>])}
                        </dl>
                        <p className="mt-1">Leave out the sign-off; your signature is added on send. A P.S. goes last. No em or en dashes.</p>
                      </details>
                      {isAdmin ? (
                        <div className="flex items-center justify-between gap-2">
                          {libSaved ? <button onClick={deleteLib} className={`${btnGhost} text-red-700 hover:text-red-800`}><Trash2 className="w-3.5 h-3.5" /> Delete</button> : <button onClick={() => pickLib(library[0] || null)} className={btnGhost}>Cancel</button>}
                          <button onClick={saveLib} disabled={libSaving || !libDirty} className={btnPrimary}>{libSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {libSaved ? 'Save changes' : 'Add template'}</button>
                        </div>
                      ) : <p className="text-xs text-off-black/45">Templates are edited by an admin. You can still change any draft before it goes.</p>}
                    </div>
                  ) : <div className="text-sm text-off-black/45 flex items-center justify-center">Pick a template, or add one.</div>}
                </div>
              )
            )}

            {tab === 'templates' && tView === 'sequence' && templates && steps && (
              <>
                <p className="text-xs text-off-black/55">What each touch's draft starts from, before anyone picks a template. Changes reach the next draft and the overnight run.</p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className={segmentGroup}>
                    {(['CHARITY', 'RACE'] as Pipeline[]).map(p => <button key={p} onClick={() => { setTPipeline(p); setTAngle(steps[p][0].angle) }} className={segment(tPipeline === p)}>{p === 'CHARITY' ? 'Charity' : 'Race'}</button>)}
                  </div>
                  <select value={tAngle} onChange={e => setTAngle(e.target.value)} className={`${inputBase} text-xs`}>
                    {steps[tPipeline].map(st => <option key={st.angle} value={st.angle}>Touch {st.touch} · {st.angle}{templates[tPipeline][st.angle]?.edited ? ' · edited' : ''}</option>)}
                  </select>
                </div>
                <p className="text-xs text-off-black/55">{steps[tPipeline].find(st => st.angle === tAngle)?.purpose}</p>
                {tDraft && (
                  <>
                    <div><label className={fieldLabel}>Subject</label><input value={tDraft.subject} onChange={e => setTDraft({ ...tDraft, subject: e.target.value })} disabled={!isAdmin} className={`${inputBase} w-full`} /></div>
                    <div><label className={fieldLabel}>Body</label><textarea rows={12} value={tDraft.body} onChange={e => setTDraft({ ...tDraft, body: e.target.value })} disabled={!isAdmin} className={`${inputBase} w-full resize-y text-[13px] leading-relaxed`} /></div>
                    <details className="text-xs text-off-black/55">
                      <summary className="cursor-pointer">Placeholders the template can use</summary>
                      <dl className="mt-1 grid grid-cols-[130px_1fr] gap-x-2 gap-y-0.5">
                        {placeholders.map(([k, v]) => [<dt key={`${k}k`} className="font-mono text-[11px]">{k}</dt>, <dd key={`${k}v`}>{v}</dd>])}
                      </dl>
                      <p className="mt-1">No em or en dashes; the server refuses them. The signature is added on send, so end on the ask. A P.S. goes last and starts with "P.S.".</p>
                    </details>
                    {isAdmin && (
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => saveTemplate(true)} disabled={tSaving || !templates[tPipeline][tAngle]?.edited} className={btnGhost}>Reset to default</button>
                        <button onClick={() => saveTemplate(false)} disabled={tSaving || (templateDefaults != null && tDraft.subject === templates[tPipeline][tAngle].subject && tDraft.body === templates[tPipeline][tAngle].body)} className={btnSecondary}>{tSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save this touch</button>
                      </div>
                    )}
                    {!isAdmin && <p className="text-xs text-off-black/45">Templates are edited by an admin. You can still change any draft before it goes.</p>}
                  </>
                )}
              </>
            )}

            {tab === 'sending' && isAdmin && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={fieldLabel}>Emails per day, per rep</label>
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
                <p className="text-xs text-off-black/50">The cap is how much new outreach the overnight run prepares per rep and what the page counts toward. Follow-ups are never capped; they are owed.</p>
                <div>
                  <label className={fieldLabel}>Social proof line</label>
                  <textarea rows={2} value={s.socialProof} onChange={e => setS({ ...s, socialProof: e.target.value })} className={`${inputBase} w-full resize-y`} />
                  <p className="text-xs text-off-black/50 mt-1">Leads the fourth race touch. Update the numbers as the season moves.</p>
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
                          : status.gmail.connected ? `Sending as ${status.gmail.email}.`
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
                    <div className="font-medium">Attio</div>
                    <button onClick={runCheck} disabled={checking} className={btnSecondary}>{checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />} Check</button>
                  </div>
                  <p className="text-xs text-off-black/50 mt-1">
                    Attio is the source of truth: the queue is read from it and every send writes back touch count, next action, Reached Out and a note with the email.
                    {status?.attio.member ? ` You are ${status.attio.member.email} on the workspace.` : ' Your email is not on the workspace, so Mine shows unowned deals only.'}
                  </p>
                  {check && (
                    <ul className="mt-2 space-y-1 text-xs">
                      <li className={check.ok ? 'text-success-green' : check.configured ? 'text-red-600' : 'text-off-black/50'}>
                        {!check.configured ? 'Not configured: set ATTIO_API_KEY in Vercel.' : check.error ? check.error : check.ok ? `Connected${check.workspace ? ` to ${check.workspace}` : ''}, every field the tool needs is there.` : `Connected${check.workspace ? ` to ${check.workspace}` : ''}, with gaps:`}
                      </li>
                      {check.missing && check.missing.length > 0 && <li className="text-amber-700">Missing deal attributes: {check.missing.join(', ')}. Add them in Attio settings with these exact API slugs.</li>}
                      {check.unknownStages && check.unknownStages.length > 0 && <li className="text-amber-700">Stages the tool expects but the workspace lacks: {check.unknownStages.join(', ')}.</li>}
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
                    <div className="text-xs text-off-black/55 mt-0.5">Rewrite and Change it call the model. Off means Rewrite resets to the cadence template. The overnight run is unaffected.</div>
                  </div>
                  <button onClick={() => onAiChange(!aiOn)} disabled={!status?.llm.configured} className={`${aiOn && status?.llm.configured ? btnPrimary : btnSecondary} shrink-0`}>
                    {status?.llm.configured ? (aiOn ? 'On' : 'Off') : 'No model'}
                  </button>
                </div>
                <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-off-black/50">Model</dt><dd>{status?.llm.configured ? `${status.llm.provider} · ${status.llm.model}` : 'not configured'}</dd>
                  <dt className="text-off-black/50">Enrichment</dt><dd>Attio's, on the company and the person. Nothing is researched here.</dd>
                  <dt className="text-off-black/50">Overnight run</dt>
                  <dd>
                    {status?.lastRun ? (
                      <>
                        {new Date(status.lastRun.finishedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {status.lastRun.prepared} written ({status.lastRun.followUps} follow-ups, {status.lastRun.fresh} first touches)
                        {status.lastRun.notes && <p className="text-off-black/60 mt-1 leading-snug">{status.lastRun.notes}</p>}
                        {status.lastRun.skipped?.length > 0 && <p className="text-amber-700 mt-1">Skipped: {status.lastRun.skipped.join('; ')}</p>}
                      </>
                    ) : 'has not run yet. It is the last phase of the nightly CRM upkeep.'}
                  </dd>
                </dl>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-gray">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={save} disabled={!s || !me || saving} className={btnPrimary}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  )
}
