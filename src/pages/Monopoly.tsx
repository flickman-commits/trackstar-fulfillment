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
import { OffsetCalculator } from '@/components/monopoly/OffsetCalculator'
import { STATUS_COLORS, legendFor } from '@/components/monopoly/boardView'
import { ExposureModel } from '@/components/monopoly/ExposureModel'
import { BrandLockup } from '@/components/monopoly/BrandLockup'
import { MONOPOLY, UI_RADIUS, guilloche } from '@/components/monopoly/monopolyTheme'
import { buildFixturePayload } from '@/lib/monopolyFixture'
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
const CTA_EMAIL = 'matt@trackstar.art'

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

  const requestSpace = useCallback((space: BoardSpace) => {
    const subject = encodeURIComponent(
      `Marathon Monopoly: reserving a space (${space.displayName}, space ${space.position})`,
    )
    window.location.href = `mailto:${CTA_EMAIL}?subject=${subject}`
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
          <SpacesRemaining remaining={counts.raceSpacesRemaining} total={counts.raceSpacesTotal} />

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
          Not everyone who opens this link knows what a custom Monopoly edition
          is. Explain the product before asking anyone to buy into it. */}
      <Section>
        <Tag>What it is</Tag>
        <H2>An official Monopoly edition, about running.</H2>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: MONOPOLY.ink }}>
              Marathon Monopoly is a fully licensed custom edition of Monopoly where the properties
              are not streets. They are the world's great marathons. Same game, same rules, same box
              on the shelf at Christmas, with the sport of running on every square.
            </p>
            <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.65, color: MONOPOLY.inkMuted }}>
              Custom editions like this already exist for football clubs, cities and national
              attractions. There has never been one for running.
            </p>
          </div>

          <div>
            <div
              className="mb-4"
              style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: MONOPOLY.inkMuted, fontWeight: 700 }}
            >
              Who buys it
            </div>
            <ul className="flex flex-col gap-3">
              {[
                'Runners who want the races they have run, and the ones they are chasing, on their own shelf.',
                'Parents who want to put the sport in front of their kids in a way that is not a lecture.',
                'Gift givers with a runner in their life and no idea what to buy them, every single December.',
                'Anyone who is simply obsessed with running.',
              ].map((line) => (
                <li key={line} className="flex gap-3" style={{ fontSize: 15, lineHeight: 1.6, color: MONOPOLY.ink }}>
                  <span style={{ color: MONOPOLY.red, fontWeight: 700, flexShrink: 0 }}>+</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ═══ HOW TO GET INVOLVED ═══ */}
      <Section dark>
        <Tag dark>How to get involved</Tag>
        <H2 dark>Take a space on the board.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, maxWidth: '46rem' }}>
          There are two ways a race joins Edition One, and both end the same way: your name printed
          on a square of the most recognisable board game ever made.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <Beat
            dark
            title="Buy your space outright"
            body="You take a property on the board under your own name. The tier decides the position, the position decides the fee, and that is the whole transaction."
          />
          <Beat
            dark
            title="Sponsor a space"
            body="Fund a space and put a partner, a charity or a cause on it instead of yourself. The same board position, pointed at whoever you want it pointed at."
          />
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <Beat
            dark
            title="This is the first print run"
            body="Edition One is the first Monopoly board the sport has ever had. Whoever is on it is on the original, and that is a thing you can only be once."
          />
          <Beat
            dark
            title="No renewal to miss"
            body="An expo banner is gone Sunday night. A board game sits on a shelf for twenty years. Once this edition is printed your race is on it for the life of the edition, with no campaign to renew and no impression that expires."
          />
        </div>
      </Section>

      {/* ═══ AD INVENTORY ═══
          Board spaces, tokens and card decks in one place: everything that can
          actually be bought, with the parts that cannot made explicit. */}
      <Section>
        <Tag>Ad inventory</Tag>
        <H2>Everything on the board that can be bought.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          Race spaces go to races. Railroads, utilities, tokens and the box lid go to brands. The
          four corners cannot be sold at all.
        </p>

        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-5" style={{ backgroundColor: MONOPOLY.black }}>
          <InventoryStat count={counts.raceSpacesTotal} label="Race spaces" note="The 22 coloured properties" />
          {data.brandSlots.map((slot) => (
            <InventoryStat key={slot.label} count={slot.total} label={slot.label} />
          ))}
        </div>

        <p className="mt-6" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          Board position is tiered. Boardwalk and Park Place carry the largest name treatment, down
          through Green, Yellow/Red, Orange/Pink and Light Blue/Brown. Spaces are assigned in order
          of commitment, and no footwear or apparel brand appears anywhere on the board or box.
        </p>

        <div
          className="mt-6 px-5 py-4"
          style={{ backgroundColor: MONOPOLY.mint, border: `2px solid ${MONOPOLY.black}`, borderRadius: UI_RADIUS }}
        >
          <p style={{ fontSize: 14, color: MONOPOLY.ink, lineHeight: 1.65 }}>
            <strong>What cannot be changed.</strong> GO, Jail, Free Parking and Go To Jail are fixed
            by the Monopoly licence. They keep their original names and artwork on every edition
            ever printed, so they are not for sale and cannot be renamed. Chance and Community Chest
            keep their names too, though the cards inside them are written for this edition.
          </p>
        </div>

        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            The playing pieces
          </h3>
          <p className="mb-8" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
            Custom-molded tokens, open to gear, nutrition, timing and wearable brands. Renders below
            are indicative. Final tooling is set during design.
          </p>
          <TokenGallery tokens={data.tokens} />
        </div>
      </Section>

      {/* ═══ WHAT'S AVAILABLE ═══ */}
      <Section muted>
        <Tag>What's open</Tag>
        <H2>
          {counts.raceSpacesRemaining} of {counts.raceSpacesTotal} race spaces are still available.
        </H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          {takenCount > 0
            ? `${takenCount} spoken for. Position is assigned in the order it is committed, so the tier you want is the tier that is still open when you sign.`
            : 'Every space is open. The first three races to commit take Founding Partner terms.'}
        </p>
        <InventoryTable spaces={data.spaces} tiers={data.tiers} onSelectSpace={handleSelect} />

        <div className="mt-10">
          <h3 className="mb-4" style={{ fontSize: 18, fontWeight: 700, color: MONOPOLY.ink }}>
            Brand inventory still open
          </h3>
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ backgroundColor: MONOPOLY.black }}>
            {data.brandSlots.map((slot) => (
              <div key={slot.label} className="px-5 py-5" style={{ backgroundColor: MONOPOLY.paper }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {slot.available}
                  <span style={{ fontSize: 16, color: MONOPOLY.inkMuted, fontWeight: 400 }}> of {slot.total}</span>
                </div>
                <div className="mt-2" style={{ fontSize: 14, color: MONOPOLY.inkMuted }}>
                  {slot.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ WHY RACES SAY YES ═══ */}
      <Section muted>
        <Tag>Why this makes sense</Tag>
        <H2>The objections, answered.</H2>
        <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
          <Beat
            title="You hold no inventory"
            body="If you take units they are yours outright, and nothing obligates you to move a single box. Sell them at your expo, gift them to VIPs, seed them to media, or take the all cash option and hold nothing at all."
          />
          <Beat
            title="It can cost a lot less than the fee"
            body="If you take the cash plus units structure, the allocation recovers most of the fee at expo pricing and additional units at wholesale narrow it further. If you would rather not touch product, take the all cash option instead and the fee is simply the fee. Both are on the table."
          />
          <Beat
            title="It won't compromise your sponsors"
            body="No competing footwear or apparel brand appears on the board or box. You hold approval rights over every brand partner, and we clear categories against your exclusivities before anything is sold."
          />
          <Beat
            title="You control how you appear"
            body="Full creative approval on your name, marks and course representation before design locks. Nothing goes to print that you haven't signed off."
          />
          <Beat
            title="We handle everything"
            body="Design, licensing, manufacturing, fulfilment. You approve your marks and promote once."
          />
          <Beat
            title="It's a seat at the table of the sport"
            body="Twenty-two races define this edition. Being one of them is a statement about where your race sits, permanently, in print."
          />
        </div>
      </Section>

      {/* ═══ HOW IT GETS SOLD ═══ */}
      <Section dark>
        <Tag dark>How we're going to sell it</Tag>
        <H2 dark>The sales and marketing plan.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: '44rem' }}>
          A partnership is only worth what the edition sells. Here's the plan behind the print run.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          {data.salesPlan.map((item) => (
            <Beat key={item.title} dark title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      {/* ═══ WHAT IT IS WORTH ═══ */}
      <Section>
        <Tag>Impressions</Tag>
        <H2>How many people actually see it.</H2>
        <div className="mb-10 mt-6 grid gap-8 md:grid-cols-2">
          <Beat
            title="It reaches people who aren't your runners yet"
            body="Every household that owns this board sees your race name a hundred times over. That is aspiration marketing you cannot buy anywhere else, in front of people who have never entered one of your races."
          />
          <Beat
            title="Runners find races through it"
            body="A marathoner who has run four of the twenty-two spends the game looking at the other eighteen. Your race gets discovered by people already committed to the sport."
          />
        </div>
        <p className="mb-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          A board game is not a nice gesture, it is media, and it should be priced like media. Here
          is the arithmetic, with every assumption set low enough that you can argue it down and
          still come out ahead.
        </p>
        <p className="mb-8" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          It runs at 2,000 boxes because that is the smallest run the manufacturer will print. A
          full board takes more than that before a single copy is sold to the public, so treat every
          figure below as a floor rather than a forecast.
        </p>
        <ExposureModel tiers={data.tiers} initialTierKey={personalizedTierKey} />
      </Section>

      {/* ═══ WHY TRACKSTAR ═══ */}
      <Section dark>
        <Tag dark>Why Trackstar</Tag>
        <H2 dark>We already do this. Just not in a box yet.</H2>
        <p className="mb-8 mt-3" style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, maxWidth: '46rem' }}>
          A licensed edition only works if whoever runs it can fill the board, produce it, and then
          actually sell it. That is the job Trackstar already does every day.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <Beat
            dark
            title="We are already inside the marathon world"
            body="Twenty race partnerships are live right now on our other products, among them the Marine Corps Marathon, the California International Marathon and the Eugene Marathon. Filling this board is not a cold start for us, it is a conversation with people we already work with."
          />
          <Beat
            dark
            title="Ecommerce and design are our operations"
            body="Producing, warehousing, selling and shipping a physical product is not a new capability we would be standing up for this. It is what the company already runs on."
          />
          <Beat
            dark
            title="Marketing is what we are best at"
            body="Paid social, partnership sales and a proven audience of running gift buyers. We do not need to learn how to sell this once it exists."
          />
          <Beat
            dark
            title="Customer service that partners can point at"
            body="Every unit that reaches a runner is backed by the same support operation our race partners already trust with their own runners."
          />
        </div>
      </Section>

      {/* ═══ HOW YOU LOCK IN ═══ */}
      {data.commitSteps.length > 0 && (
        <Section>
          <Tag>How you lock in</Tag>
          <H2>A $500 deposit holds your space.</H2>
          <p className="mb-10 mt-3" style={{ fontSize: 15, color: '#666666', lineHeight: 1.6, maxWidth: '44rem' }}>
            You are not writing a big cheque to find out whether this happens. $500 reserves your
            space, and it is fully refundable. You only commit real money once the board is full and
            you can see exactly who is on it.
          </p>

          <ol className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ backgroundColor: MONOPOLY.black }}>
            {data.commitSteps.map((step, i) => (
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
                <h3 className="mb-2" style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#666666' }}>{step.body}</p>
              </li>
            ))}
          </ol>

          {data.paymentOptions.length > 0 && (
            <div className="mt-14">
              <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.02em' }}>
                Two ways to pay for it
              </h3>
              <p className="mb-6" style={{ fontSize: 15, color: '#666666', lineHeight: 1.6, maxWidth: '44rem' }}>
                Some races want product to sell. Some want nothing to do with inventory. Pick the one
                that fits how you actually operate.
              </p>

              <div className="grid gap-5 md:grid-cols-2">
                {data.paymentOptions.map((option, i) => (
                  <div
                    key={option.label}
                    className="flex flex-col px-6 py-6"
                    style={{
                      backgroundColor: MONOPOLY.paper,
                      border: i === 0 ? `2px solid ${MONOPOLY.black}` : `2px solid ${MONOPOLY.red}`,
                      borderRadius: UI_RADIUS,
                    }}
                  >
                    <div
                      className="mb-3 inline-block self-start px-2.5 py-1"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: i === 0 ? '#666666' : '#ED1C24',
                        border: `1px solid ${i === 0 ? '#E0E0E0' : 'rgba(237,28,36,0.3)'}`,
                      }}
                    >
                      Option {i + 1}
                    </div>
                    <h4 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.02em' }}>
                      {option.label}
                    </h4>
                    <p className="mb-3 mt-1" style={{ fontSize: 15, fontWeight: 500, color: '#1A1A1A' }}>
                      {option.summary}
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: '#666666' }}>{option.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ═══ WHAT YOU INVEST ═══ */}
      <Section muted>
        <Tag>What you invest</Tag>
        <H2>Position is priced. Value is not.</H2>
        <p className="mb-3 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          The fee below buys the board position. What you do about product is a separate choice, and
          it changes what the partnership actually costs you.
        </p>
        <p className="mb-8" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          <strong style={{ color: MONOPOLY.ink }}>Taking the all cash option</strong>, your cost is
          the fee, full stop. No units, nothing to store or sell.{' '}
          <strong style={{ color: MONOPOLY.ink }}>Taking cash plus units</strong>, an allocation
          comes with the fee, and the resale and net cost columns below are what that is worth if
          you sell it. Those two columns only apply to the second structure.
        </p>
        <PackageTiers
          tiers={data.tiers}
          brandPricing={data.brandPricing}
          retailPrice={data.retailPrice ?? 65}
          highlightTierKey={personalizedTierKey}
        />
      </Section>

      {/* ═══ OFFSET CALCULATOR ═══ */}
      <Section>
        <Tag>Run your own numbers</Tag>
        <H2>What the units are actually worth.</H2>
        <p className="mb-3 mt-3" style={{ fontSize: 15, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          Add units at wholesale, resell at your price. Drag the sliders. This is your math, not
          ours, and depending on the tier and how many units you move it can land either side of
          zero.
        </p>
        <p className="mb-8" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
          This only applies to the cash plus units structure. On the all cash option there is no
          allocation to resell and your cost is the fee.
        </p>
        <OffsetCalculator
          tiers={data.tiers}
          wholesalePrice={data.wholesalePrice ?? 30}
          retailPrice={data.retailPrice ?? 65}
          initialTierKey={personalizedTierKey}
        />
      </Section>

      {/* ═══ TIMELINE ═══ */}
      <Section muted>
        <Tag>Timeline</Tag>
        <H2>Board composition locks when design begins.</H2>
        <div className="mt-8" style={{ borderTop: `2px solid ${MONOPOLY.black}` }}>
          {data.timeline.map((phase) => (
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

      {/* ═══ TERMS 🔒 ═══ */}
      {data.terms && data.terms.length > 0 && (
        <Section>
          <Tag>Terms</Tag>
          <H2>What you're actually signing.</H2>
          <ul className="mt-8 grid gap-x-10 gap-y-4 md:grid-cols-2">
            {data.terms.map((term) => (
              <li key={term} className="flex gap-3" style={{ fontSize: 15, color: '#1A1A1A', lineHeight: 1.6 }}>
                <span style={{ color: '#ED1C24', fontWeight: 700, flexShrink: 0 }}>+</span>
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ═══ FAQ ═══ */}
      <Section muted>
        <Tag>FAQ</Tag>
        <H2>The things people ask.</H2>
        <div className="mt-8 flex flex-col gap-px" style={{ backgroundColor: MONOPOLY.black }}>
          {data.faq.map((item) => (
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
            Spaces are assigned in the order they are committed, and the board locks when design
            begins in October.
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
        Marathon Monopoly puts the world's great races on the most recognisable board game ever
        made. Printed once. Your race is on it permanently.
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
          fontSize: 18,
          fontWeight: 700,
          color: MONOPOLY.red,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
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

/** One inventory line: how many of a thing exist to be bought. */
function InventoryStat({ count, label, note }: { count: number; label: string; note?: string }) {
  return (
    <div className="px-5 py-6" style={{ backgroundColor: MONOPOLY.paper }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {count}
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
      href={`mailto:${CTA_EMAIL}?subject=${encodeURIComponent('Marathon Monopoly: reserving a space')}`}
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
      Reserve a space
    </a>
  )
}

/**
 * Spaces remaining as a progress bar above the headline. A count in a sentence
 * is a fact; a bar that is visibly filling is scarcity.
 */
function SpacesRemaining({ remaining, total }: { remaining: number; total: number }) {
  const taken = total - remaining
  const pct = total > 0 ? (taken / total) * 100 : 0

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span style={{ fontSize: 15, fontWeight: 700, color: MONOPOLY.ink }}>
          {remaining} of {total} race spaces open
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          border: `1.5px solid ${MONOPOLY.black}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: MONOPOLY.red,
            transition: 'width 400ms ease',
          }}
        />
      </div>
      <div className="mt-1.5" style={{ fontSize: 12, color: '#8A857C' }}>
        {taken} spoken for
      </div>
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
