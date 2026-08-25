/**
 * Settings workspaces for people and accountability.
 *
 *   <PeoplePanel />   who can sign in, what they may do   (admin only)
 *   <ActivityPanel /> the audit log of consequential actions (admin only)
 *   <AccountPanel />  your own account                    (everyone)
 *
 * People and Activity are part of the admin view: staff do not see them in the
 * settings nav at all, and the endpoints behind them refuse a staff session, so
 * the roster and the log are not reachable by typing a URL either.
 *
 * AccountPanel exists so that hiding the admin view does not also take away a
 * staff member's ability to change their own password. It is the one piece of
 * the old People panel everyone still needs.
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, UserPlus, Copy, Check, LogOut } from 'lucide-react'
import { useAuth, fullName } from '@/lib/auth'
import { btnPrimary, btnSecondary, btnDanger, btnGhost, inputBase, fieldLabel } from '@/lib/ui'

const API_BASE = import.meta.env.VITE_API_URL || ''

interface TeamMember {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Composed server-side so the table and the toasts agree on one spelling. */
  name: string
  role: 'admin' | 'staff'
  isActive: boolean
  hasPassword: boolean
  lastLoginAt: string | null
  createdAt: string
  inviteExpiresAt: string | null
}

function api(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** "3 days ago", "never". Rough on purpose: exact timestamps are noise here. */
function ago(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** A generated invite link, shown once with a copy button. */
function InviteLink({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="text-xs font-medium text-blue-800">
        Send this link to them. It works once and expires in 7 days.
      </p>
      <div className="flex items-center gap-2 mt-2">
        <input readOnly value={url} className={`${inputBase} flex-1 font-mono text-[11px]`} />
        <button onClick={copy} className={btnSecondary}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onDismiss} className={btnGhost}>Done</button>
      </div>
    </div>
  )
}

export function PeoplePanel() {
  const { user } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'staff' as 'admin' | 'staff' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api('/api/admin/users')
      const data = await res.json()
      if (res.ok) setMembers(data.users || [])
      else toast.error(data.error || 'Could not load the team')
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const post = async (body: Record<string, unknown>, okMessage: string) => {
    setBusyId(String(body.id || 'new'))
    try {
      const res = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'That did not work'); return null }
      toast.success(okMessage)
      await load()
      return data
    } catch {
      toast.error('Could not reach the server')
      return null
    } finally {
      setBusyId(null)
    }
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = await post({ action: 'invite', ...form }, `Invited ${form.email}`)
    if (data?.inviteUrl) {
      setInviteUrl(data.inviteUrl)
      setShowInvite(false)
      setForm({ firstName: '', lastName: '', email: '', role: 'staff' })
    }
  }

  const remove = async (m: TeamMember) => {
    if (!confirm(`Delete the account for ${m.email}? Their comments and edit history stay, attributed to their name.`)) return
    setBusyId(m.id)
    try {
      const res = await api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ id: m.id }) })
      const data = await res.json()
      if (!res.ok) toast.error(data.error || 'That did not work')
      else { toast.success(`Deleted ${m.email}`); await load() }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-off-black/50">
          {members.filter(m => m.isActive).length} active
          {members.some(m => !m.isActive) && `, ${members.filter(m => !m.isActive).length} deactivated`}
          . Admins can run destructive actions and manage this list.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} className={btnGhost} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {(
            <button onClick={() => setShowInvite(v => !v)} className={btnPrimary}>
              <UserPlus className="w-3 h-3" /> Invite someone
            </button>
          )}
        </div>
      </div>

      {inviteUrl && <InviteLink url={inviteUrl} onDismiss={() => setInviteUrl('')} />}

      {showInvite && (
        <form onSubmit={invite} className="rounded-lg border border-border-gray bg-subtle-gray/40 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className={fieldLabel}>First name</label>
              <input
                className={inputBase}
                value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })}
                placeholder="First"
              />
            </div>
            <div>
              <label className={fieldLabel}>Last name</label>
              <input
                className={inputBase}
                value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })}
                placeholder="Last"
              />
            </div>
            <div>
              <label className={fieldLabel}>Email</label>
              <input
                className={inputBase}
                type="email"
                required
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="fast@trackstar.art"
              />
            </div>
            <div>
              <label className={fieldLabel}>Role</label>
              <select
                className={inputBase}
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as 'admin' | 'staff' })}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className={btnPrimary} disabled={busyId === 'new'}>
              {busyId === 'new' && <Loader2 className="w-3 h-3 animate-spin" />} Create invite link
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className={btnSecondary}>Cancel</button>
          </div>
          <p className="text-[11px] text-off-black/45">
            They choose their own password from the link, and can correct their
            name from My Account. You never type a password for them.
          </p>
        </form>
      )}

      {loading && !members.length ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-off-black/40" />
        </div>
      ) : (
        <div className="rounded-lg border border-border-gray overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-subtle-gray text-off-black/50">
              <tr>
                <th className="text-left font-medium px-3 py-2">Person</th>
                <th className="text-left font-medium px-3 py-2">Role</th>
                <th className="text-left font-medium px-3 py-2">Last seen</th>
                <th className="text-right font-medium px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className={`border-t border-border-gray ${m.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-off-black">
                      {m.name}
                      {m.id === user?.id && <span className="text-off-black/40 font-normal"> (you)</span>}
                    </div>
                    <div className="text-off-black/45">{m.email}</div>
                    {!m.hasPassword && (
                      <div className="text-warning-amber mt-0.5">
                        Invite {m.inviteExpiresAt && new Date(m.inviteExpiresAt) < new Date()
                          ? 'expired' : 'not accepted yet'}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.isActive ? (
                      <select
                        className="text-xs bg-white border border-border-gray rounded px-2 py-1"
                        value={m.role}
                        disabled={busyId === m.id}
                        onChange={e => post({ action: 'role', id: m.id, role: e.target.value }, `${m.name} is now ${e.target.value}`)}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="capitalize text-off-black/70">{m.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-off-black/55">
                    {m.isActive ? ago(m.lastLoginAt) : 'Deactivated'}
                  </td>
                  {(
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {busyId === m.id && <Loader2 className="w-3 h-3 animate-spin text-off-black/40" />}
                        {m.isActive && (
                          <button
                            className={btnGhost}
                            disabled={busyId === m.id}
                            onClick={async () => {
                              const data = await post({ action: 'reset', id: m.id }, `Reset ${m.name}'s password`)
                              if (data?.inviteUrl) setInviteUrl(data.inviteUrl)
                            }}
                          >
                            Reset password
                          </button>
                        )}
                        <button
                          className={btnSecondary}
                          disabled={busyId === m.id}
                          onClick={() => post(
                            { action: 'active', id: m.id, isActive: !m.isActive },
                            `${m.isActive ? 'Deactivated' : 'Reactivated'} ${m.name}`
                          )}
                        >
                          {m.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button className={btnDanger} disabled={busyId === m.id} onClick={() => remove(m)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}

export function AccountPanel() {
  const { user, signOut, refresh } = useAuth()

  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Seed the inputs from the session, and re-seed when it refreshes after a
  // save so the fields reflect what was actually stored.
  useEffect(() => {
    setFirst(user?.firstName || '')
    setLast(user?.lastName || '')
  }, [user?.firstName, user?.lastName])

  const [changingPassword, setChangingPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const nameChanged =
    first.trim() !== (user?.firstName || '') || last.trim() !== (user?.lastName || '')

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!first.trim()) { toast.error('First name is required'); return }
    setSavingName(true)
    try {
      const res = await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ action: 'set-name', firstName: first, lastName: last }),
      })
      const data = await res.json()
      if (!res.ok) toast.error(data.error || 'That did not work')
      else {
        toast.success('Name updated')
        // Pull the session fresh so the greeting on the dashboard changes too,
        // rather than staying stale until the next reload.
        await refresh()
      }
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { toast.error('Those two passwords do not match'); return }
    setSavingPassword(true)
    try {
      const res = await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ action: 'set-password', password }),
      })
      const data = await res.json()
      if (!res.ok) toast.error(data.error || 'That did not work')
      else {
        toast.success('Password changed')
        setChangingPassword(false); setPassword(''); setConfirm('')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <p className="text-sm font-medium text-off-black">
          {fullName(user)}
          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-off-black/5 text-off-black/50 align-middle">
            {user?.role === 'admin' ? 'admin' : 'staff'}
          </span>
        </p>
        <p className="text-xs text-off-black/50">{user?.email}</p>
        <p className="text-xs text-off-black/45 mt-2">
          {user?.role === 'admin'
            ? 'Admins can manage people and run the destructive actions.'
            : 'Ask an admin if you need to run something that is limited to admins.'}
        </p>
      </div>

      <form onSubmit={saveName} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>First name</label>
            <input
              className={inputBase}
              value={first}
              onChange={e => setFirst(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className={fieldLabel}>Last name</label>
            <input
              className={inputBase}
              value={last}
              onChange={e => setLast(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className={btnPrimary} disabled={savingName || !nameChanged}>
            {savingName && <Loader2 className="w-3 h-3 animate-spin" />} Save name
          </button>
          <span className="text-[11px] text-off-black/40">
            Your first name is what the dashboard greets you by.
          </span>
        </div>
      </form>

      {changingPassword ? (
        <form onSubmit={savePassword} className="rounded-lg border border-border-gray bg-subtle-gray/40 p-4 space-y-3">
          <div>
            <label className={fieldLabel}>New password</label>
            <input
              className={inputBase}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="10 characters or more"
            />
          </div>
          <div>
            <label className={fieldLabel}>Confirm</label>
            <input
              className={inputBase}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className={btnPrimary} disabled={savingPassword}>
              {savingPassword && <Loader2 className="w-3 h-3 animate-spin" />} Save password
            </button>
            <button type="button" className={btnSecondary} onClick={() => setChangingPassword(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2 pt-1 border-t border-border-gray/60">
          <button onClick={() => setChangingPassword(true)} className={`${btnSecondary} mt-4`}>
            Change my password
          </button>
          <button onClick={signOut} className={`${btnSecondary} mt-4`}>
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

interface AuditEntry {
  id: string
  action: string
  summary: string
  createdAt: string
  actor: string
}

export function ActivityPanel() {
  const [events, setEvents] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api('/api/admin/audit?limit=200')
      const data = await res.json()
      if (res.ok) setEvents(data.events || [])
      else toast.error(data.error || 'Could not load the log')
    } catch {
      toast.error('Could not reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-off-black/50">
          Every destructive action, newest first. Append only, so nothing here can be edited or removed.
        </p>
        <button onClick={load} className={btnGhost} disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && !events.length ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-off-black/40" />
        </div>
      ) : !events.length ? (
        <div className="rounded-lg border border-border-gray bg-subtle-gray/40 p-6 text-center">
          <p className="text-xs text-off-black/50">Nothing logged yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border-gray divide-y divide-border-gray">
          {events.map(e => (
            <div key={e.id} className="flex items-start justify-between gap-4 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-off-black">{e.summary}</p>
                <p className="text-[11px] text-off-black/45 mt-0.5">
                  {e.actor} · <span className="font-mono">{e.action}</span>
                </p>
              </div>
              <span className="text-[11px] text-off-black/40 whitespace-nowrap tabular-nums">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
