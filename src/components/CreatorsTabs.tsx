import { Link } from 'react-router-dom'
import { segment, segmentGroup } from '@/lib/ui'

/** Creators, Ads and Briefs: the creator program's three views, switched like the order views. */
export default function CreatorsTabs({ active }: { active: 'creators' | 'ads' | 'briefs' }) {
  const tabs = [
    ['creators', 'Creators', '/creators'],
    ['ads', 'Ads', '/creators?tab=ads'],
    ['briefs', 'Briefs', '/briefs'],
  ] as const
  return (
    <div className={`inline-flex ${segmentGroup}`}>
      {tabs.map(([key, label, to]) => (
        <Link key={key} to={to} className={`${segment(active === key, 'md')} inline-flex items-center`}>{label}</Link>
      ))}
    </div>
  )
}
