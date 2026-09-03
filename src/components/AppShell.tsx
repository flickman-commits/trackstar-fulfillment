import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import AppSidebar from '@/components/AppSidebar'
import CustomTools from '@/components/CustomTools'
import StandardTools from '@/components/StandardTools'

/**
 * Everything that has to outlive a page change.
 *
 * The rail started life inside Dashboard, which meant it vanished the moment
 * you clicked Creators - the whole point of a rail is that it is still there
 * when you arrive. It lives here now, wrapping every signed-in route, so the
 * tools and the current-page marker survive navigation.
 *
 * The two tool panels come along for the ride. They are self-contained popups,
 * so Discounts and Pace now work on the Creators page too.
 *
 * Settings is the exception and it is worth being honest about why. That modal
 * is several hundred lines of Dashboard - pricing, stats, people, the race
 * database - and lifting it out is a much bigger change than making the rail
 * persist. So from anywhere else, Settings routes home and asks Dashboard to
 * open it. The user lands on the dashboard with the panel already up, which is
 * where all of those settings act anyway.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [railPanel, setRailPanel] = useState<null | 'discounts' | 'pace'>(null)

  const path = location.pathname
  const settingsOpen = new URLSearchParams(location.search).get('settings') === '1'
  const activeId =
    settingsOpen ? 'settings'
    : railPanel === 'discounts' ? 'discounts'
    : railPanel === 'pace' ? 'pace'
    : path.startsWith('/creators') ? 'creators'
    : 'fulfillment'

  return (
    <div className="md:pl-[92px]">
      <AppSidebar
        isAdmin={isAdmin}
        activeId={activeId}
        onOpenDiscounts={() => setRailPanel(p => (p === 'discounts' ? null : 'discounts'))}
        onOpenPaceConverter={() => setRailPanel(p => (p === 'pace' ? null : 'pace'))}
        onOpenSettings={() => {
          // Close whatever panel is open first. Without this the old tile keeps
          // its white card while the settings modal is up, and its popup sits
          // behind the modal where it cannot be closed.
          setRailPanel(null)
          // `replace` so Settings does not stack history entries you have to
          // click back through.
          navigate('/?settings=1', { replace: path === '/' })
        }}
      />
      <CustomTools open={railPanel === 'pace'} onClose={() => setRailPanel(null)} />
      <StandardTools open={railPanel === 'discounts'} onClose={() => setRailPanel(null)} />
      {children}
    </div>
  )
}
