/**
 * /monopoly — the partner-facing Marathon Monopoly proposal.
 *
 * Public route (registered above the PasswordGate in App.tsx). The board is the
 * hero, live from the sheet, interactive on first paint — a race director should
 * be clicking their own space before they've read a sentence.
 *
 * Pricing and terms are gated behind an email capture, except when Matt sends a
 * personalized link (?p=boston), which arrives already unlocked. The gate is
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
import { EarnItBack } from '@/components/monopoly/EarnItBack'
import { QrGlyph, BOARD_GUIDE_QR_TARGET } from '@/components/monopoly/QrGlyph'
import { BrandLockup } from '@/components/monopoly/BrandLockup'
import { UnitFlow } from '@/components/monopoly/UnitFlow'
import { ProductImage } from '@/components/monopoly/ProductImage'
import { MONOPOLY, UI_RADIUS, CARD_OUTLINE, HAND_FONT, guilloche } from '@/components/monopoly/monopolyTheme'
import { buildFixturePayload } from '@/lib/monopolyFixture'
import {
  BOARD_GUIDE,
  COMMIT_STEPS,
  LAUNCH_PLAN,
  PRODUCT_SHOTS,
  FAQ,
  COMMUNITY_FEEDBACK,
  DEPOSIT_AMOUNT,
  SALES_PLAN,
  WHY_NOW,
  TIMELINE,
  SLOT_INCLUDES,
  SLOT_INCLUDES_NOTE,
  UNIT_ALLOCATION,
  WHATS_IN_IT,
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
 * The playing pieces are a real part of the product but not part of this ask,
 * and the section read as a second thing being sold. Parked rather than
 * deleted, since it goes back the moment tokens are on the table.
 */
const SHOW_TOKENS = false

/** Races that must be signed before the page starts counting spaces down. */
const SPACES_LEFT_THRESHOLD = 4
/**
 * Stripe payment link for the reservation deposit.
 *
 * A hosted link rather than a Checkout integration: no keys in the app, no card
 * data anywhere near our code, and Stripe collects race name and email on its
 * own page. At this volume an integration would buy nothing.
 */
const DEPOSIT_URL = 'https://buy.stripe.com/14A00jc3la5ldvQ5vt7kc07'

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

  // This is what a race director sees in a text message preview, so it reads
  // as the product rather than as a document about the product.
  useDocumentHead({
    title: 'Marathon Monopoly',
    description: "The world's greatest marathons, on the most famous board game ever made.",
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
  // calculator, so a personalized visitor lands on their own numbers.
  const personalizedTierKey =
    highlightPosition != null ? spaceByPosition.get(highlightPosition)?.tierKey : undefined

  const handleSelect = useCallback((position: number) => setSelectedPosition(position), [])

  // Every path ends at the same deposit. The modal knows which space they
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
          The product itself, first. A race director asked what they are being
          put on before they asked why it should exist, and the old order had
          them reading about Dollywood for a screen before seeing the box. */}
      <Section>
        <SectionHeading>What it is</SectionHeading>
        <p className="mb-4 mt-3" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          Marathon Monopoly is a limited-edition Monopoly board game created to celebrate the best
          marathons in the country.
        </p>
        <p className="mb-8" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          Every space is a world-class marathon. Land on one and you pay the registration fee. Travel
          the board, buy up marathons, add aid stations, and start charging fees of your own. It is a
          way for runners to connect over the sport they love and discover new races.
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {PRODUCT_SHOTS.map((shot) => (
            <div key={shot.label}>
              <ProductImage src={shot.src} label={shot.label} />
              <div className="mt-3" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
                {shot.label}
              </div>
            </div>
          ))}
        </div>

        {/* Said once, near the images, rather than left for a race director to
            work out from the misspelt words inside them. */}
        <p className="mt-6" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
          Concept renders. The races shown are illustrative rather than confirmed. Board design,
          artwork and game rules are all subject to change during the 12-week design and development
          period, which begins once every space is committed.
        </p>
      </Section>

      {/* ═══ WHY NOW ═══
          Every other section argues the product is good. This one argues the
          moment is, which is the question a race director asks second. The
          300-editions proof lives here now: it is evidence that the category
          works, which is a why-now argument rather than a what-is-it one. */}
      <Section muted>
        {/* This was a subheading, a row of five example chips and a big red
            panel asking the question, all stacked above two beats and a photo.
            Three pieces of furniture to make one point, and the point is the
            heading. It is now the heading, one paragraph, and three beats. */}
        <SectionHeading>Why now?</SectionHeading>

        {/* Beats left, picture right on a laptop; stacked on a phone. The image
            sat below them at half width before, which left a column of empty
            mint beside it and pushed the section over a screen tall. */}
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            {WHY_NOW.map((item) => (
              <Beat key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
          <ProductImage
            src="/monopoly/family.jpg"
            label="A family playing Marathon Monopoly around a kitchen table"
          />
        </div>
      </Section>

      {/* ═══ WHAT'S IN IT FOR YOU ═══
          Six deliverables, replacing three beats that were all sentiment and
          nothing you could hand over. Most of these already existed further
          down the page but nowhere together, so the reader who wanted to know
          what the fee buys had to assemble it from four sections. */}
      <Section dark>
        <SectionHeading>What's in it for you</SectionHeading>
        <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {WHATS_IN_IT.map((item) => (
            <Beat key={item.title} dark title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      {/* ═══ HOW IT GETS SOLD ═══ */}
      <Section>
        <SectionHeading>Sales and distribution plan</SectionHeading>
        <div className="mt-3">
          <UnitFlow allocation={UNIT_ALLOCATION} />
        </div>

        {/* The allocation says which box goes where. These say how the people
            who buy them find out, which is a different question and was
            unreadable when both lived in one list. */}
        {/* Visibility and launch were two grids of the same shape stacked on
            each other, which read as one list interrupted by a heading. They
            are the same argument: how anybody hears about it. */}
        <div className="mt-14">
          <SubHeading>Getting visibility on the product</SubHeading>
          <p className="mb-6 mt-2" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '46rem' }}>
            Here are a few of the strategies, amongst others, that we will use to get eyeballs on
            this product.
          </p>
          {/* Titles only, six across. These six are a list of things we are
              doing, not six arguments to read: each one explains itself in
              four words, and the paragraph under it was restating the title
              at greater length. Stripped back, the whole plan reads in one
              glance instead of one screen. */}
          <div className="grid gap-3 grid-cols-3 lg:grid-cols-5">
            {[...SALES_PLAN, ...LAUNCH_PLAN].map((item) => (
              <div
                key={item.title}
                className="flex items-center justify-center px-2 py-3.5 text-center sm:px-3 sm:py-4"
                style={{
                  border: `2px solid ${MONOPOLY.red}`,
                  borderRadius: UI_RADIUS,
                  backgroundColor: MONOPOLY.paper,
                }}
              >
                <h3
                  style={{
                    // Three tiles across a phone leaves about 80px of content
                    // width, and "Simultaneous" does not fit that at 16px. The
                    // clamp scales the type with the viewport instead of
                    // letting the longest word break its own card.
                    fontSize: 'clamp(12px, 3.1vw, 16px)',
                    fontWeight: 700,
                    letterSpacing: '-0.015em',
                    lineHeight: 1.25,
                    color: MONOPOLY.ink,
                    textWrap: 'balance',
                  }}
                >
                  {item.title}
                </h3>
              </div>
            ))}
          </div>
        </div>

        {/* Proof the audience is real, in their words rather than ours. Every
            claim above this is a plan; this is the only thing on the page that
            already happened. */}
        <div className="mt-14">
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: MONOPOLY.inkMuted,
            }}
          >
            Feedback from our community
          </h3>
          <p className="mt-2" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
            We teased the idea for Marathon Monopoly to our email list, and here were some of their
            responses.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {COMMUNITY_FEEDBACK.map((item) => (
              <figure
                key={item.name + item.quote.slice(0, 24)}
                className="flex flex-col justify-between gap-4 px-5 py-5"
                style={{
                  border: `2px solid ${MONOPOLY.black}`,
                  borderRadius: UI_RADIUS,
                  backgroundColor: MONOPOLY.paper,
                }}
              >
                <div>
                  {/* The mark does the work the inline quotes were doing, and
                      does it before the reader starts the sentence rather than
                      as punctuation they scan past. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      fontSize: 56,
                      lineHeight: 0.72,
                      fontWeight: 700,
                      color: MONOPOLY.red,
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    “
                  </span>
                  <blockquote className="mt-2" style={{ fontSize: 16, color: MONOPOLY.ink, lineHeight: 1.5 }}>
                    {item.quote}
                  </blockquote>
                </div>
                <figcaption style={{ fontSize: 26, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
                  {item.name}
                </figcaption>
              </figure>
            ))}
          </div>

        </div>
      </Section>

      {/* ═══ WAYS TO GET ON THE BOARD ═══
          One section for the whole commercial picture: what exists, what is
          still open, and what it costs. Splitting these made a reader hold
          three separate tables in their head to answer one question. */}
      <Section muted>
        <SectionHeading>Investment</SectionHeading>
        <p className="mb-6 mt-3" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          The investment needed for each space is listed below. The prices increase as you get to
          more valuable parts of the Monopoly board.
        </p>
        <PackageTiers tiers={data.tiers} highlightTierKey={personalizedTierKey} />

        {/* What the fee actually buys. This is the section that has to land,
            so it goes directly under the price and gets the room: a race
            director deciding on a number wants to see what the number is for,
            not a calculator for a secondary revenue line.

            Listed once here rather than repeated per tier. Nothing in it
            varies by tier, so a per-row copy was seven chances to disagree
            with itself. */}
        <div className="mt-12">
          <h3 className="mb-5" style={{ fontSize: 26, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.025em' }}>
            Purchasing a race slot includes
          </h3>
          <ul
            className="grid gap-x-10 gap-y-4 md:grid-cols-2"
            style={{ maxWidth: '62rem' }}
          >
            {SLOT_INCLUDES.map((item, i) => (
              <li
                key={item}
                className="flex gap-3"
                style={{ fontSize: 19, color: MONOPOLY.ink, lineHeight: 1.5 }}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ color: MONOPOLY.red, fontWeight: 700, fontSize: 22, lineHeight: 1.35 }}
                >
                  +
                </span>
                <span>
                  {item}
                  {i === SLOT_INCLUDES.length - 1 && '*'}
                </span>
              </li>
            ))}
          </ul>
          {/* Small, and said once. It is a scope note, not a sales point. */}
          <p className="mt-5" style={{ fontSize: 14, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '40rem' }}>
            *{SLOT_INCLUDES_NOTE}
          </p>
        </div>

        {/* Below the slot list on purpose, and deliberately quiet. It is a real
            offer but a secondary one, and at full size it was pulling attention
            off the thing a race is actually buying. */}
        <EarnItBack />

        <div className="mt-10">
          <CtaButton />
        </div>

        {SHOW_AVAILABILITY_TABLE && (
        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            Which spaces are still open
          </h3>
          <p className="mb-6" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
            {takenCount > 0
              ? `${takenCount} of ${counts.raceSpacesTotal} spoken for. Position is assigned in the order it is committed.`
              : 'Every space is open. Position is assigned in the order it is committed.'}
          </p>
          <InventoryTable spaces={data.spaces} tiers={data.tiers} onSelectSpace={handleSelect} />
        </div>
        )}

        {SHOW_TOKENS && (
        <div className="mt-14">
          <h3 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
            The playing pieces
          </h3>
          <p className="mb-6" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6, maxWidth: '44rem' }}>
            Custom-molded tokens, open to gear, nutrition, timing and wearable brands. Renders are
            indicative. Final tooling is set during design.
          </p>
          <TokenGallery tokens={data.tokens} />
        </div>
        )}

      </Section>

      {/* ═══ THE SECOND SURFACE ═══
          Directly after Investment, because the slot list ends by promising a
          page on the guide and this is that promise shown. Paper, so it does
          not run into the mint of the section above it. */}
      <Section>
        <SectionHeading>The Board Guide</SectionHeading>
        <p className="mb-8 mt-3" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.65, maxWidth: '46rem' }}>
          {BOARD_GUIDE.intro}
        </p>

        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start">
          {/* The physical half of the idea. A code on a box is the whole
              mechanism, so it gets drawn rather than described. */}
          <div
            className="flex flex-col items-center justify-center px-6 py-8"
            style={{ border: CARD_OUTLINE, borderRadius: UI_RADIUS, backgroundColor: MONOPOLY.paper }}
          >
            <QrGlyph />
            <div
              className="mt-4 text-center"
              style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MONOPOLY.inkMuted }}
            >
              Printed on every box
            </div>
            {/* Live, so it can be scanned off a laptop mid-pitch. */}
            <a
              href={BOARD_GUIDE_QR_TARGET}
              className="mt-2 text-center"
              style={{
                fontSize: 15,
                color: MONOPOLY.ink,
                fontWeight: 700,
                textDecoration: 'underline',
                textDecorationColor: MONOPOLY.red,
                textDecorationThickness: 2,
                textUnderlineOffset: 4,
              }}
            >
              Scan it, or tap here
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            {BOARD_GUIDE.beats.map((beat) => (
              <div
                key={beat.title}
                className="px-5 py-5"
                style={{ border: CARD_OUTLINE, borderRadius: UI_RADIUS, backgroundColor: MONOPOLY.paper }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
                  {beat.title}
                </h3>
                <p className="mt-2" style={{ fontSize: 16, color: MONOPOLY.inkMuted, lineHeight: 1.55 }}>
                  {beat.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ RETURN ON INVESTMENT ═══ */}
      <Section muted>
        <SectionHeading>Return on investment</SectionHeading>
        <div className="mb-8 mt-3 flex flex-col gap-4" style={{ maxWidth: '46rem' }}>
          <p style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.65 }}>
            Marathon Monopoly will live in the households of thousands of runners and their
            families, who will sit staring at this board for three hours at a time, every time they
            play, for the next decade. Below is the exposure a space earns from marathon-obsessed
            people, estimated conservatively on purpose so our race partners can see what it is
            actually worth.
          </p>
        </div>
        <ExposureModel tiers={data.tiers} initialTierKey={personalizedTierKey} />
      </Section>

      {/* ═══ WHY TRACKSTAR ═══ */}
      <Section dark>
        <SectionHeading>Our expertise</SectionHeading>
        <p className="mb-8 mt-3" style={{ fontSize: 17, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, maxWidth: '46rem' }}>
          Here's why Trackstar is the right company to bring this product to life.
        </p>
        {/* Three claims, each carrying its own number. The fourth used to be
            customer service, which is table stakes rather than a reason, and
            had nothing behind it to point at. */}
        <div className="grid gap-8 md:grid-cols-3">
          <Beat
            dark
            title="20 Race Partnerships"
            body="Live today, among them the Marine Corps Marathon, California International and Eugene. Filling this board is not a cold start."
          />
          <Beat
            dark
            title="Operational Alignment"
            body="Producing, warehousing, selling and shipping physical product is what the company already runs on. This is the same job we do every day."
          />
          <Beat
            dark
            title="Marketing Is Our Superpower"
            body="We sold nearly 3,000 products in our first year, almost entirely through partnership and social media marketing."
          />
        </div>
      </Section>

      {/* ═══ HOW YOU LOCK IN ═══ */}
      {COMMIT_STEPS.length > 0 && (
        <Section>
          <SectionHeading>How to commit</SectionHeading>
          <p className="mb-10 mt-3" style={{ fontSize: 17, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
            ${DEPOSIT_AMOUNT} reserves your space, fully refundable, and you commit real money only once the board is full.
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

          <div className="mt-10">
            <CtaButton />
          </div>
        </Section>
      )}

      {/* ═══ TIMELINE ═══ */}
      <Section muted>
        <SectionHeading>Timeline</SectionHeading>
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

        <div className="mt-10">
          <CtaButton />
        </div>
      </Section>

      {/* ═══ FAQ ═══ */}
      <Section>
        <SectionHeading>FAQs</SectionHeading>
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
          <H2 dark>Marathon Monopoly is happening. Are you in?</H2>
          <div className="mt-8">
            <CtaButton />
          </div>
        </div>
      </Section>

      <footer
        className="px-5 py-10 text-center lg:px-8"
        style={{ borderTop: `2px solid ${MONOPOLY.black}`, backgroundColor: MONOPOLY.paper }}
      >
        <p style={{ fontSize: 13, color: MONOPOLY.inkMuted, lineHeight: 1.6 }}>
          Marathon Monopoly is a proposed official Monopoly edition. The license is in negotiation
          and not yet executed. All imagery is a concept render, and board design, artwork and game
          rules are subject to change during the 12-week design and development period.
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
/**
 * The only call to action on the page, and deliberately one size.
 *
 * It appears five times: hero, Investment, How to commit, Timeline and the
 * close. A bigger variant at the end made the last one look like a different,
 * more final offer than the four above it, when it is the same click.
 */
function CtaButton() {
  return (
    <a
      href={DEPOSIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block transition-opacity hover:opacity-90"
      style={{
        backgroundColor: MONOPOLY.red,
        color: '#FFFFFF',
        border: `2px solid ${MONOPOLY.black}`,
        borderRadius: UI_RADIUS,
        padding: '13px 22px',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 16, lineHeight: 1.15 }}>
        Reserve your space
      </span>
      {/* The price and the refund promise ride on the button itself: it is the
          objection a race has at the exact moment they are deciding to click.
          Set tight against the label so the two read as one control. */}
      <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, marginTop: 1 }}>
        ${DEPOSIT_AMOUNT} (refundable)
      </span>
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
      {/* The section-heading plate, not the CTA plate. This is a fact about the
          offer sitting directly above the one button in the hero, and in red it
          read as a second thing to click. */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: MONOPOLY.ink,
          backgroundColor: MONOPOLY.paper,
          border: `2px solid ${MONOPOLY.black}`,
          borderRadius: UI_RADIUS,
          boxShadow: `4px 4px 0 ${MONOPOLY.red}`,
          padding: '6px 12px',
        }}
      >
        Commitments close September 30
      </span>
      {/* Held back until four races are in. "22 of 22 left" is arithmetically
          true and reads as nobody has signed, which is the opposite of what a
          scarcity line is for. Once it is counting down it starts working. */}
      {total - remaining >= SPACES_LEFT_THRESHOLD && (
        <span style={{ fontSize: 14, color: MONOPOLY.inkMuted }}>
          Only {remaining} (of {total}) race spaces left
        </span>
      )}
    </div>
  )
}

// ── Local presentation helpers ──────────────────────────────────────────────
// Dark and light sections alternate to give the page rhythm, per the brand's
// landing-page rules.

/**
 * A full-bleed band. Three surfaces: paper, mint, and black.
 *
 * Adjacent sections must never share one. The surface change is the only thing
 * telling a reader they have finished one idea and started another, and two
 * mint bands in a row read as a single overlong section with a stray heading
 * in the middle of it. Paper and mint alternate; black is the accent, used for
 * the two sections that argue rather than inform.
 */
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
      className="py-16 lg:py-24"
      style={{
        backgroundColor: dark ? MONOPOLY.black : muted ? MONOPOLY.mint : MONOPOLY.paper,
        // The engraved banknote field runs under the mint panels, the way it
        // does across the Monopoly packaging system.
        ...(muted ? guilloche('rgba(35,31,32,0.055)', 24) : {}),
        ...(dark ? guilloche('rgba(255,255,255,0.045)', 24) : {}),
      }}
    >
      {/* Same container as the hero, down to the breakpoint padding. They used
          to differ (1600/px-24 against 1152/px-8), so the content edge jumped
          inward the moment you scrolled past the board. */}
      <div className="mx-auto max-w-[1600px] px-5 lg:px-16 xl:px-24">{children}</div>
    </section>
  )
}

/**
 * Section label as a tag rather than spaced-out uppercase text. Reads as a
 * chip you could click, which suits a page that is mostly interactive.
 */
/**
 * The section heading, and the only one each section gets.
 *
 * This used to be a small red tag sitting above a large sentence, which meant
 * every section announced itself twice: once as a label and once as a claim.
 * The claims were doing less work than they looked like they were, since the
 * paragraph underneath almost always made the same point better. So the label
 * won, and it is the heading now.
 *
 * A raised paper plate rather than a flat red one. The CTA now owns red, which
 * is the right way round: the thing you click should be the loudest object on
 * the page, and previously the twelve headings were shouting over the five
 * buttons in the same color.
 */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2
        className="inline-block"
        style={{
          fontSize: 'clamp(16px, 1.7vw, 21px)',
          fontWeight: 700,
          padding: '9px 18px',
          lineHeight: 1.25,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: MONOPOLY.ink,
          backgroundColor: MONOPOLY.paper,
          border: `2px solid ${MONOPOLY.black}`,
          borderRadius: UI_RADIUS,
          boxShadow: `4px 4px 0 ${MONOPOLY.red}`,
        }}
      >
        {children}
      </h2>
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

/** A heading inside a section. One size, so the hierarchy stays two deep. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 22, fontWeight: 700, color: MONOPOLY.ink, letterSpacing: '-0.02em' }}>
      {children}
    </h3>
  )
}

function Beat({
  title,
  body,
  dark,
  upper,
  card,
}: {
  title: string
  body: string
  dark?: boolean
  /** Caps the heading. Used where the beat is a claim rather than a label. */
  upper?: boolean
  /** Red-outlined card. For grids where the beats are a set to scan. */
  card?: boolean
}) {
  return (
    <div
      style={
        card
          ? {
              border: `2px solid ${MONOPOLY.red}`,
              borderRadius: UI_RADIUS,
              padding: '18px 20px',
              backgroundColor: dark ? 'transparent' : MONOPOLY.paper,
            }
          : undefined
      }
    >
      <h3
        className="mb-2"
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          color: dark ? '#FFFFFF' : MONOPOLY.ink,
          ...(upper ? { textTransform: 'uppercase' as const, letterSpacing: '0.04em' } : {}),
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: dark ? 'rgba(255,255,255,0.7)' : MONOPOLY.inkMuted }}>{body}</p>
    </div>
  )
}
