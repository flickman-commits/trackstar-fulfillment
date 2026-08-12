/**
 * /monopoly — the partner-facing Marathon Monopoly proposal.
 *
 * Public route (registered above the PasswordGate in App.tsx). The board is the
 * hero, live from the sheet, interactive on first paint — a race director should
 * be clicking their own space before they've read a sentence.
 *
 * Pricing and terms are gated behind an email capture, except when Matt sends a
 * personalised link (?p=boston), which arrives already unlocked. The gate is
 * enforced server-side: the ungated API response simply does not contain fees.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Board } from '@/components/monopoly/Board'
import { SpaceDetail } from '@/components/monopoly/SpaceDetail'
import { InventoryTable } from '@/components/monopoly/InventoryTable'
import { TokenGallery } from '@/components/monopoly/TokenGallery'
import { PackageTiers } from '@/components/monopoly/PackageTiers'
import { STATUS_COLORS, legendFor } from '@/components/monopoly/boardView'
import { ExposureModel } from '@/components/monopoly/ExposureModel'
import { BrandLockup } from '@/components/monopoly/BrandLockup'
import { MONOPOLY, UI_RADIUS, HAND_FONT, guilloche } from '@/components/monopoly/monopolyTheme'
import { buildFixturePayload } from '@/lib/monopolyFixture'
import {
  COMMIT_STEPS,
  LAUNCH_PLAN,
  PRODUCT_SHOTS,
  FAQ,
  SALES_PLAN,
  TIMELINE,
  UNIT_ALLOCATION,
} from '@/lib/monopolyCopy'
import { mergeSalesData } from '@/lib/monopolyMerge'
import type { BoardSpace, MonopolyPublicPayload, MonopolySalesResponse } from '@/lib/monopolyTypes'
import { useDocumentHead } from '@/lib/useDocumentHead'

const API_BASE = import.meta.env.VITE_API_URL || ''

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

/**
 * Fallback header height, used for the first paint before the real one is
 * measured. The hero subtracts the header so it fills exactly one screen.
 */
const HEADER_HEIGHT_FALLBACK = 72

/**
 * The row-by-row availability table, off for now.
 *
 * With most spaces unsold it read as an empty warehouse rather than as
 * scarcity, and the board already shows the same thing far better. Kept behind
 * a flag rather than deleted because it earns its place once the board fills up.
 */
const SHOW_AVAILABILITY_TABLE = false
/**
 * Stripe payment link for the $400 reservation deposit.
 *
 * A hosted link rather than a Checkout integration: no keys in the app, no card
 * data anywhere near our code, and Stripe collects race name and email on its
 * own page. At this volume an integration would buy nothing.
 */
const DEPOSIT_URL = 'https://buy.stripe.com/3cI8wP6J17Xd3Vg3nl7kc06'

export default function Monopoly() {
  const [params] = useSearchParams()
  const personalizeSlug = params.get('p')
  const accessKey = params.get('key')

  // Mount with the fixture so the board is on screen immediately. Live sheet
  // data upgrades it in place — there is never a spinner where the board goes.
  const [data, setData] = useState<MonopolyPublicPayload>(() => buildFixturePayload())
  // Measured rather than hardcoded: the header's height depends on the lockup
  // artwork's aspect ratio, so a magic number here would silently drift the
  // moment that image is swapped.
  const headerRef = useRef<HTMLElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT_FALLBACK)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    // getBoundingClientRect, not contentRect: the latter excludes the header's
    // padding and border, which would under-measure it by ~26px and leave the
    // hero taller than one screen.
    const observer = new ResizeObserver(() => {
      setHeaderHeight(Math.round(el.getBoundingClientRect().height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)

  useDocumentHead({
    title: 'Marathon Monopoly, Partnership Offer',
    description:
      'An officially licensed Monopoly edition for the sport of running. 22 race spaces, printed once, permanent.',
    noindex: true,
  })

  useEffect(() => {
    const qs = new URLSearchParams()
    if (personalizeSlug) qs.set('p', personalizeSlug)
    if (accessKey) qs.set('key', accessKey)
    const url = `${API_BASE}/api/public/monopoly${qs.toString() ? `?${qs}` : ''}`

    let cancelled = false
    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: MonopolySalesResponse | null) => {
        // The server sends only the sales layer; the board itself is merged on
        // here from the canonical layout.
        if (!cancelled && json?.spaceSales) setData(mergeSalesData(json))
      })
      .catch(() => {
        /* Fixture stays on screen. A sales page must never go blank. */
      })
    return () => {
      cancelled = true
    }
  }, [personalizeSlug, accessKey])

  const spaceByPosition = useMemo(
    () => new Map(data.spaces.map((s) => [s.position, s])),
    [data.spaces],
  )
  const tierByKey = useMemo(() => new Map(data.tiers.map((t) => [t.tierKey, t])), [data.tiers])

  const selectedSpace = selectedPosition != null ? (spaceByPosition.get(selectedPosition) ?? null) : null
  const highlightPosition = data.personalizedFor?.suggestedPosition ?? null
  // Drives the "your tier" badge in the pricing table and preselects the
  // calculator, so a personalised visitor lands on their own numbers.
  const personalizedTierKey =
    highlightPosition != null ? spaceByPosition.get(highlightPosition)?.tierKey : undefined

  const handleSelect = useCallback((position: number) => setSelectedPosition(position), [])

  // Every path ends at the same $400 deposit. The modal knows which space they
  // were looking at, but the hosted Stripe link cannot receive it, so which
  // space it was gets confirmed by email after the deposit lands.
  const requestSpace = useCallback(() => {
    window.open(DEPOSIT_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const { counts } = data
  const takenCount = counts.raceSpacesTotal - counts.raceSpacesRemaining

  return (
    <div style={{ backgroundColor: MONOPOLY.mintPale, fontFamily: FONT }} className="min-h-screen">
      {/* ═══ HEADER ═══ */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 px-5 py-3 lg:px-8"
        style={{
          backgroundColor: MONOPOLY.paper,
          borderBottom: `2px solid ${MONOPOLY.black}`,
        }}
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-center lg:justify-start">
          <BrandLockup height={51} />
        </div>
      </header>

      {/* ═══ HERO ═══
          On desktop this fills exactly one screen minus the sticky header, and
          the board is sized off the same height so the whole thing lands above
          the fold without scrolling. On mobile it stacks and grows naturally. */}
      <section
        className="mx-auto flex max-w-[1600px] flex-col justify-center gap-8 px-5 py-6 lg:h-[calc(100svh-var(--monopoly-header-h))] lg:flex-row lg:items-center lg:gap-16 lg:px-16 xl:gap-20 xl:px-24"
        style={{ ...guilloche('rgba(35,31,32,0.045)', 30), ['--monopoly-header-h' as string]: `${headerHeight}px` }}
      >
        <div className="order-2 lg:order-1 lg:max-w-[27rem] lg:shrink-0">
          <CommitmentDeadline remaining={counts.raceSpacesRemaining} total={counts.raceSpacesTotal} />

          <h1
            className="mt-4"
            style={{
              fontSize: 'clamp(30px, 4.2vw, 50px)',
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: MONOPOLY.ink,
            }}
          >
            {data.personalizedFor ? (
              <>
                {data.personalizedFor.displayName}
                <br />
                belongs on this board.
              </>
            ) : (
              <>
                Your race belongs
                <br />
                on this board.
              </>
            )}
          </h1>

          <HeroActions />
        </div>

        {/* The board is square, so capping its width by the leftover viewport
            height is what guarantees it fits. Slightly under half the screen
            area, which is the trade for never having to scroll to see it. */}
        <div className="order-1 flex flex-1 justify-center lg:order-2">
          <div
            className="w-full"
            style={{ maxWidth: `min(calc(100svh - ${headerHeight + 96}px), 780px)` }}
          >
            <Board
              spaces={data.spaces}
              selectedPosition={selectedPosition}
              highlightPosition={highlightPosition}
              onSelectSpace={handleSelect}
            />

            <BoardLegend spaces={data.spaces} />
            <ClickPrompt className="mt-5 flex justify-center lg:hidden" />
          </div>
        </div>
      </section>

      {/* ═══ WHAT IT IS ═══
          Lead with editions people already know exist, then the gap. Naming
          the absence is a stronger opening than describing the product. */}
      <Section>
        <Tag>What it is</Tag>
        <H2>There is a Monopoly for almost everything.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
          Over 300 officially licensed editions have been printed. Football clubs, cities, national
          parks, film franchises, theme parks, universities.
        </p>

        <div className="mb-10 flex flex-wrap gap-2">
          {['Star Wars', 'Premier League clubs', 'National Parks', 'Game of Thrones', 'Dollywood',
            'NFL teams', 'Cities and regions', 'Universities', 'The Beatles'].map((label) => (
            <span
              key={label}
              style={{
                fontSize: 14,
                padding: '8px 14px',
                backgroundColor: MONOPOLY.paper,
                border: `1.5px solid ${MONOPOLY.black}`,
                borderRadius: UI_RADIUS,
                color: MONOPOLY.ink,
                fontWeight: 500,
              }}
            >
              {label}
            </span>
          ))}
        </div>

        <div
          className="px-6 py-7 sm:px-9 sm:py-9"
          style={{ backgroundColor: MONOPOLY.red, border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS }}
        >
          <p style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            So why isn't there a Marathon Monopoly?
          </p>
          <p className="mt-4" style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, maxWidth: '44rem' }}>
            Running has the audience, the obsession, and the gift problem every December. It has
            never had the board. That changes now.
          </p>
        </div>
      </Section>

      {/* ═══ THE PRODUCT ═══
          The first thing a race asked to see before committing. Placeholder
          squares hold the exact slots the finished renders will fill. */}
      <Section muted>
        <Tag>The product</Tag>
        <H2>What you're actually getting.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          A full-size licensed Monopoly edition. Board, box, custom pieces, title deeds, money and
          cards, made to the same spec as any edition on a shelf.
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {PRODUCT_SHOTS.map((shot) => (
            <div key={shot.label}>
              <div
                className="flex aspect-square items-center justify-center"
                style={{
                  backgroundColor: MONOPOLY.paper,
                  border: `2px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                  ...guilloche('rgba(35,31,32,0.07)', 20),
                }}
              >
                <span style={{ fontSize: 12, color: '#8A857C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Image coming
                </span>
              </div>
              <div className="mt-3" style={{ fontSize: 15, fontWeight: 700, color: MONOPOLY.ink }}>
                {shot.label}
              </div>
              <div style={{ fontSize: 13, color: MONOPOLY.inkMuted }}>{shot.note}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ WHY YOU SHOULD CARE ═══ */}
      <Section dark>
        <Tag dark>Why you should care</Tag>
        <H2 dark>What a space does for your race.</H2>
        <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <Beat
            dark
            title="The company you keep"
            body="Twenty-two races define this edition, and they are the ones runners already care about. Being on the board is being named alongside them, in print, permanently."
          />
          <Beat
            dark
            title="A marathon-obsessed audience"
            body="3.2 million times your name is seen. And a runner who has done four of the twenty-two spends the whole game looking at the other eighteen."
          />
          <Beat
            dark
            title="Be part of history"
            body="There is only ever one first edition. This is it."
          />
          <Beat
            dark
            title="It gives something back"
            body="5% of all proceeds go to charity, chosen together with the partner races."
          />
        </div>
      </Section>

      {/* ═══ HOW IT GETS SOLD ═══ */}
      <Section>
        <Tag>How we're going to sell it</Tag>
        <H2>We already know who buys this.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          A partnership is only worth what the edition sells. Here's the plan behind the print run.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          {SALES_PLAN.map((item) => (
            <Beat key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      {/* ═══ WHERE THE BOXES GO ═══
          The specific thing a race asked for: not "we will sell them" but which
          boxes, to whom, through what. */}
      <Section muted>
        <Tag>Where the boxes go</Tag>
        <H2>Every box in the first run, accounted for.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          A 2,004 box first run, which is the manufacturer's minimum. If pre-orders justify more, the
          run goes up and every number below goes up with it.
        </p>

        <div style={{ border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS, overflow: 'hidden', backgroundColor: MONOPOLY.paper }}>
          {UNIT_ALLOCATION.map((row, i) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 px-5 py-4"
              style={{ borderTop: i === 0 ? 'none' : `1px solid rgba(35,31,32,0.15)` }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: MONOPOLY.ink }}>{row.label}</div>
                <div style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.5 }}>{row.note}</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                {row.units.toLocaleString()}
              </div>
            </div>
          ))}
          <div
            className="flex items-baseline justify-between gap-4 px-5 py-4"
            style={{ borderTop: `2px solid ${MONOPOLY.black}`, backgroundColor: MONOPOLY.mint }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: MONOPOLY.ink }}>Total printed</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
              {UNIT_ALLOCATION.reduce((sum, r) => sum + r.units, 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            How it launches
          </h3>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {LAUNCH_PLAN.map((item) => (
              <Beat key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ WAYS TO GET ON THE BOARD ═══
          One section for the whole commercial picture: what exists, what is
          still open, and what it costs. Splitting these made a reader hold
          three separate tables in their head to answer one question. */}
      <Section muted>
        <Tag>Ways to get on the board</Tag>
        <H2>What's available, and what it costs.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          Twenty-two race spaces, and nothing else for sale. Edition One carries no third-party
          brands. It is presented by Trackstar, and the only names on the board are the races.
        </p>

        <div className="mb-12 grid gap-px sm:grid-cols-3" style={{ backgroundColor: MONOPOLY.black }}>
          <InventoryStat
            count={counts.raceSpacesRemaining}
            total={counts.raceSpacesTotal}
            label="Race spaces open"
            note="The 22 coloured properties"
          />
          <InventoryStat count={5} total={5} label="Comp copies per race" note="Yours, whatever you pay" />
          <InventoryStat count={0} total={0} label="Brand sponsors" note="None, by design" />
        </div>

        <div className="mt-12">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            What a space costs
          </h3>
          <p className="mb-6" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
            Quoted in cash, and every space includes 5 comp copies. If you would rather put some of
            it into product, you can offset part of the fee by committing to boxes at $35 and sell
            them at your expo for $55.
          </p>
          <PackageTiers tiers={data.tiers} highlightTierKey={personalizedTierKey} />
        </div>

        {SHOW_AVAILABILITY_TABLE && (
        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            Which spaces are still open
          </h3>
          <p className="mb-6" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
            {takenCount > 0
              ? `${takenCount} of ${counts.raceSpacesTotal} spoken for. Position is assigned in the order it is committed.`
              : 'Every space is open. Position is assigned in the order it is committed.'}
          </p>
          <InventoryTable spaces={data.spaces} tiers={data.tiers} onSelectSpace={handleSelect} />
        </div>
        )}

        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            The playing pieces
          </h3>
          <p className="mb-6" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
            Custom-molded tokens, open to gear, nutrition, timing and wearable brands. Renders are
            indicative. Final tooling is set during design.
          </p>
          <TokenGallery tokens={data.tokens} />
        </div>

      </Section>

      {/* ═══ RETURN ON INVESTMENT ═══ */}
      <Section>
        <Tag>Return on investment</Tag>
        <H2>What that buys, in impressions.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          A board game is media. Price it like media.
        </p>
        <ExposureModel tiers={data.tiers} initialTierKey={personalizedTierKey} />
      </Section>

      {/* ═══ WHY TRACKSTAR ═══ */}
      <Section dark>
        <Tag dark>Why Trackstar</Tag>
        <H2 dark>We already do this. Just not in a box yet.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, maxWidth: '46rem' }}>
          This only works if whoever runs it can fill the board, produce it, and sell it.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <Beat
            dark
            title="We are already inside the marathon world"
            body="Twenty race partnerships are live today, among them the Marine Corps Marathon, California International and Eugene. Filling this board is not a cold start."
          />
          <Beat
            dark
            title="Ecommerce and design are our operations"
            body="Producing, warehousing, selling and shipping physical product is what the company already runs on."
          />
          <Beat
            dark
            title="Marketing is what we are best at"
            body="Paid social and partnership sales are the core of the business. We do not need to learn how to sell this."
          />
          <Beat
            dark
            title="Customer service that partners can point at"
            body="The same support operation our race partners already trust with their own runners."
          />
        </div>
      </Section>

      {/* ═══ HOW YOU LOCK IN ═══ */}
      {COMMIT_STEPS.length > 0 && (
        <Section muted>
          <Tag>How you lock in</Tag>
          <H2>A $500 deposit holds your space.</H2>
          <p className="mb-10 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
            $500 reserves your space, fully refundable. You commit real money only once the board is
            full and you can see exactly who is on it.
          </p>

          <ol className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ backgroundColor: MONOPOLY.black }}>
            {COMMIT_STEPS.map((step, i) => (
              <li key={step.title} className="px-5 py-6" style={{ backgroundColor: MONOPOLY.paper }}>
                <div
                  className="mb-3 flex items-center justify-center"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: MONOPOLY.red,
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: UI_RADIUS,
                  }}
                >
                  {i + 1}
                </div>
                <h3 className="mb-2" style={{ fontSize: 16, fontWeight: 700, color: MONOPOLY.ink }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: MONOPOLY.inkMuted }}>{step.body}</p>
              </li>
            ))}
          </ol>

        </Section>
      )}

      {/* ═══ TIMELINE ═══ */}
      <Section muted>
        <Tag>Timeline</Tag>
        <H2>Board composition locks when design begins.</H2>
        <div className="mt-8" style={{ borderTop: `2px solid ${MONOPOLY.black}` }}>
          {TIMELINE.map((phase) => (
            <div
              key={phase.phase}
              className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:gap-8"
              style={{ borderBottom: `1px solid ${MONOPOLY.black}` }}
            >
              <div className="sm:w-56 sm:shrink-0" style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>
                {phase.phase}
              </div>
              <div style={{ fontSize: 15, color: MONOPOLY.red, fontWeight: 700, minWidth: '11rem' }}>{phase.window}</div>
              {phase.note && <div style={{ fontSize: 14, color: '#666666' }}>{phase.note}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ OBJECTIONS ═══ */}
      <Section>
        <Tag>What you're probably thinking</Tag>
        <H2>The short answers.</H2>
        <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
          <Beat
            title="You never touch product"
            body="No inventory, no fulfilment, nothing to sell. We produce, store, ship and support every unit."
          />
          <Beat
            title="It won't compromise your sponsors"
            body="No footwear or apparel brand appears anywhere on the board or box. You approve every brand that does."
          />
          <Beat
            title="You control how you appear"
            body="Full creative approval on your name and marks. Nothing prints that you haven't signed off."
          />
          <Beat
            title="No risk if it doesn't fill"
            body="Every deposit is refundable if we don't hit minimum commitments. Nothing prints until the board is full and funded."
          />
        </div>
      </Section>

      {/* ═══ FAQ ═══ */}
      <Section muted>
        <Tag>FAQ</Tag>
        <H2>Everything else.</H2>
        <div className="mt-8 flex flex-col gap-px" style={{ backgroundColor: MONOPOLY.black }}>
          {FAQ.map((item) => (
            <details key={item.question} className="group px-5 py-4" style={{ backgroundColor: MONOPOLY.paper }}>
              <summary
                className="cursor-pointer list-none"
                style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}
              >
                {item.question}
              </summary>
              <p className="mt-3" style={{ fontSize: 15, color: '#666666', lineHeight: 1.65 }}>
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Section>

      {/* ═══ CTA ═══ */}
      <Section dark>
        <div className="mx-auto max-w-2xl text-center">
          <H2 dark>Twenty-two spaces. Printed once.</H2>
          <p className="mt-4" style={{ fontSize: 17, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            Commitments close September 30. The board locks when design begins, and it prints once.
          </p>
          <CtaButton large />
        </div>
      </Section>

      <footer
        className="px-5 py-10 text-center lg:px-8"
        style={{ borderTop: `2px solid ${MONOPOLY.black}`, backgroundColor: MONOPOLY.paper }}
      >
        <p style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
          Marathon Monopoly is an officially licensed edition. Board renderings are indicative and
          subject to design approval.
        </p>
      </footer>

      <SpaceDetail
        space={selectedSpace}
        tier={selectedSpace?.tierKey ? tierByKey.get(selectedSpace.tierKey) : undefined}
        onClose={() => setSelectedPosition(null)}
        onRequestSpace={requestSpace}
      />
    </div>
  )
}

/**
 * Sub-headline, CTA and the board view switcher. Rendered once in the left
 * column on desktop and once below the board on mobile — only one is ever
 * visible, and defining it here keeps the two placements from drifting.
 */
function HeroActions() {
  return (
    <div className="mt-6 flex flex-col">
      {/* Desktop only. On a phone this renders directly beneath the board
          instead, where its arrow has something to point at. */}
      <ClickPrompt className="order-3 mt-8 hidden lg:-mr-24 lg:flex" />

      <p className="order-2" style={{ fontSize: 17, lineHeight: 1.6, color: MONOPOLY.inkMuted }}>
        The world's great marathons, on the most famous board game ever made.
      </p>

      <div className="order-2 mt-6">
        <CtaButton />
      </div>
    </div>
  )
}

/**
 * "Click any space" plus its arrow. Rendered once per breakpoint: under the
 * board on a phone, in the copy column on a laptop. Only one is ever visible.
 */
function ClickPrompt({ className }: { className?: string }) {
  return (
    <div className={`items-center gap-3 ${className ?? ''}`}>
      <PointerArrowMobile />
      <span
        style={{
          fontFamily: HAND_FONT,
          // Caveat runs small for its point size, so it needs more than the
          // 18px the surrounding UI type uses to read at the same weight.
          fontSize: 27,
          fontWeight: 700,
          color: MONOPOLY.red,
          lineHeight: 1.05,
          letterSpacing: '0.01em',
        }}
      >
        Click any space to
        <br />
        see its title deed
      </span>
      <PointerArrow />
    </div>
  )
}

/** One inventory line: how many are left, out of how many exist. */
function InventoryStat({
  count,
  total,
  label,
  note,
}: {
  count: number
  total: number
  label: string
  note?: string
}) {
  return (
    <div className="px-5 py-6" style={{ backgroundColor: MONOPOLY.paper }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 17, color: MONOPOLY.inkMuted, fontWeight: 400 }}> of {total}</span>
      </div>
      <div className="mt-2" style={{ fontSize: 14, color: MONOPOLY.ink, fontWeight: 500 }}>
        {label}
      </div>
      {note && (
        <div className="mt-1" style={{ fontSize: 12, color: MONOPOLY.inkMuted, lineHeight: 1.4 }}>
          {note}
        </div>
      )}
    </div>
  )
}

/**
 * Availability key, sitting quietly under the board rather than in the copy
 * column. It annotates the board, so it belongs against the board.
 */
function BoardLegend({ spaces }: { spaces: BoardSpace[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {legendFor(spaces).map((status) => {
        const open = status === 'available'
        return (
          <span key={status} className="flex items-center gap-1.5" style={{ fontSize: 12, color: '#8A857C' }}>
            <span
              className="inline-block"
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: open ? 'transparent' : STATUS_COLORS[status].fill,
                border: `1.5px solid ${open ? 'rgba(35,31,32,0.4)' : STATUS_COLORS[status].fill}`,
              }}
            />
            {STATUS_COLORS[status].label}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Hand-drawn arrow running from the prompt toward the board.
 *
 * Points right on desktop, where the board sits to the right of this column.
 * On mobile the board is above, so the whole thing is rotated to point up. The
 * wobble is deliberate: a clean geometric arrow reads as an icon and gets
 * ignored, a sketched one reads as someone pointing.
 */
function PointerArrow() {
  return (
    <svg
      width="340"
      height="73"
      viewBox="0 0 250 54"
      fill="none"
      aria-hidden
      className="hidden shrink-0 lg:block"
    >
      {/* Long shallow sweep so the arrow actually spans the gap to the board
          rather than stopping in the margin. */}
      <path
        d="M4 34C70 50 150 46 246 16"
        stroke={MONOPOLY.red}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Barbs swept back from the tip at 246 16, along the shaft's tangent. */}
      <path d="M246 16 226 13.3" stroke={MONOPOLY.red} strokeWidth="3" strokeLinecap="round" />
      <path d="M246 16 231 29.5" stroke={MONOPOLY.red} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Mobile arrow. The board sits directly above this block, so it sweeps up and
 * to the right into the bottom edge of the board.
 */
function PointerArrowMobile() {
  return (
    <svg
      width="62"
      height="66"
      viewBox="0 0 62 66"
      fill="none"
      aria-hidden
      className="shrink-0 lg:hidden"
    >
      {/* Shaft rising from the copy up toward the board. */}
      <path
        d="M8 60C6 38 18 18 44 8"
        stroke={MONOPOLY.red}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Barbs swept back from the tip at 46 7, along the shaft's tangent. */}
      <path d="M46 7 29 8" stroke={MONOPOLY.red} strokeWidth="3" strokeLinecap="round" />
      <path d="M46 7 38 21" stroke={MONOPOLY.red} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/**
 * "Reserve a space", not "this space" — on a page where no space is selected,
 * "this" points at nothing and the reader has to stop and work it out.
 */
function CtaButton({ large }: { large?: boolean }) {
  return (
    <a
      href={DEPOSIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block transition-opacity hover:opacity-90"
      style={{
        backgroundColor: MONOPOLY.red,
        color: '#FFFFFF',
        borderRadius: UI_RADIUS,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        padding: large ? '16px 32px' : '14px 26px',
        fontSize: large ? 15 : 14,
      }}
    >
      Reserve a space, $400
    </a>
  )
}

/**
 * The deadline, above the headline.
 *
 * This replaced a "19 of 22 spaces open" progress bar. That is the wrong
 * scarcity to lead with while most of the board is unsold: a bar sitting at 14%
 * reads as "nobody is buying this". A date is a wall, and unlike a fill gauge it
 * does not get weaker the emptier the board is.
 */
function CommitmentDeadline({ remaining, total }: { remaining: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#FFFFFF',
          backgroundColor: MONOPOLY.red,
          border: `2px solid ${MONOPOLY.black}`,
          borderRadius: UI_RADIUS,
          padding: '6px 12px',
        }}
      >
        Commitments close September 30
      </span>
      <span style={{ fontSize: 14, color: MONOPOLY.inkMuted }}>
        {remaining} of {total} race spaces left
      </span>
    </div>
  )
}

// ── Local presentation helpers ──────────────────────────────────────────────
// Dark and light sections alternate to give the page rhythm, per the brand's
// landing-page rules.

function Section({
  children,
  dark,
  muted,
}: {
  children: React.ReactNode
  dark?: boolean
  muted?: boolean
}) {
  return (
    <section
      className="px-5 py-16 lg:px-8 lg:py-24"
      style={{
        backgroundColor: dark ? MONOPOLY.black : muted ? MONOPOLY.mint : MONOPOLY.paper,
        // The engraved banknote field runs under the mint panels, the way it
        // does across the Monopoly packaging system.
        ...(muted ? guilloche('rgba(35,31,32,0.055)', 24) : {}),
        ...(dark ? guilloche('rgba(255,255,255,0.045)', 24) : {}),
      }}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  )
}

/**
 * Section label as a tag rather than spaced-out uppercase text. Reads as a
 * chip you could click, which suits a page that is mostly interactive.
 */
function Tag({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="mb-4">
      <span
        className="inline-block"
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '6px 13px',
          lineHeight: 1.3,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#FFFFFF',
          backgroundColor: MONOPOLY.red,
          border: `2px solid ${dark ? MONOPOLY.red : MONOPOLY.black}`,
          borderRadius: UI_RADIUS,
        }}
      >
        {children}
      </span>
    </div>
  )
}

function H2({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <h2
      style={{
        fontSize: 'clamp(26px, 3.4vw, 40px)',
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: '-0.03em',
        color: dark ? '#FFFFFF' : MONOPOLY.ink,
      }}
    >
      {children}
    </h2>
  )
}

function Beat({ title, body, dark }: { title: string; body: string; dark?: boolean }) {
  return (
    <div>
      <h3 className="mb-2" style={{ fontSize: 17, fontWeight: 700, color: dark ? '#FFFFFF' : MONOPOLY.ink }}>
        {title}
      </h3>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: dark ? 'rgba(255,255,255,0.7)' : MONOPOLY.inkMuted }}>{body}</p>
    </div>
  )
}
