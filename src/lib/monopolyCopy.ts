/**
 * Every fixed word on /monopoly.
 *
 * This used to live in the Google Sheet alongside the sales data, on the theory
 * that Matt could edit copy without a deploy. In practice copy changes are
 * always written here first and then round-tripped through a CSV export and a
 * "Replace current sheet" import, which is slower than editing this file and
 * introduced real drift: the sheet spent a stretch telling race directors about
 * unit allocations the offer no longer had, because the code had moved on and
 * the tab had not.
 *
 * So the split is now by what actually changes:
 *
 *   Sheet  — the sales layer. Which spaces are sold, held or open, who holds
 *            them, tier fees, token availability. Matt edits these often and
 *            they must not need a deploy.
 *   Code   — prose. Timeline, FAQ, sales plan, commitment steps, inventory
 *            counts, brand pricing bands. These change when the offer changes,
 *            which is a code change anyway.
 */
import type {
  ColorGroup,
  CommitStep,
  FaqItem,
  SalesPlanItem,
  TimelinePhase,
} from './monopolyTypes'

/**
 * The pricing ladder, and the six playing pieces.
 *
 * These used to come from the sheet. They moved here for the same reason the
 * copy did: a tier fee is a strategic decision that changes when the offer
 * changes, not a weekly edit, and keeping it in the sheet meant a repricing in
 * the repo could sit invisible behind a stale tab.
 *
 * What the sheet still owns is the only thing that genuinely moves week to
 * week: which spaces are sold, held or open, and who holds them.
 *
 * Repriced from call data rather than from a spreadsheet. Races were on the
 * fence at $20,000 and refused anything above it, so the ladder is built so the
 * median slot lands at $15,500 and the whole board averages $15,636 across 22
 * slots. Listing above what we expect to take leaves room to negotiate down, or
 * to let a race buy units and bring its own number down.
 *
 * Dark Blue is capped at $24,000 for a reason that is arithmetic, not taste. On
 * a 2,004 box run the edition delivers 2.4 million impressions, so a slot above
 * $24,048 costs a race more per thousand impressions than an Instagram ad, and
 * the media argument inverts. Every tier here stays under that line.
 *
 * The ladder exists so a major can buy a bigger space, which earlier partner
 * feedback said matters.
 */
export interface TierDef {
  tierKey: string
  label: string
  colorGroups: ColorGroup[]
  fee: number
  /** Comp copies included in every slot, whatever the tier. */
  unitsIncluded: number
  features: string[]
  sortOrder: number
  isFounding: boolean
}

/**
 * What every space carries, whatever the fee.
 *
 * The exclusivity line used to be "5-year category exclusivity in your market",
 * which promised a clock rather than a thing. If no second edition is ever
 * printed, five years of exclusivity is five years of nothing, and a race
 * director who works that out mid-pitch has caught us selling air.
 *
 * Per edition is the honest unit. Your space on Edition One is guaranteed the
 * moment you commit, and first refusal carries to whatever comes next, if
 * anything does. It promises less and means more.
 */
const COMMON_FEATURES = [
  '5 complimentary units for your team',
  'Your own title sponsor on your title deed card',
  'A race slot on Marathon Monopoly Edition One, and first refusal on the next',
]

export const TIERS: TierDef[] = [
  {
    tierKey: 'boardwalk',
    label: 'Dark Blue',
    colorGroups: ['darkblue'],
    fee: 24000,
    unitsIncluded: 5,
    features: [
      'The two most recognized spaces on any Monopoly board',
      'Largest name treatment on the board',
      ...COMMON_FEATURES,
    ],
    sortOrder: 1,
    isFounding: false,
  },
  {
    tierKey: 'green',
    label: 'Green',
    colorGroups: ['green'],
    fee: 20000,
    unitsIncluded: 5,
    features: ["Premium block on the board's final stretch", 'Full name treatment', ...COMMON_FEATURES],
    sortOrder: 2,
    isFounding: false,
  },
  {
    tierKey: 'yellowred',
    label: 'Yellow / Red',
    colorGroups: ['yellow', 'red'],
    fee: 17000,
    unitsIncluded: 5,
    features: ['High-traffic mid-board position', ...COMMON_FEATURES],
    sortOrder: 3,
    isFounding: false,
  },
  {
    tierKey: 'orangepink',
    label: 'Orange / Pink',
    colorGroups: ['orange', 'pink'],
    fee: 14000,
    unitsIncluded: 5,
    features: ['The most-landed-on block in the game', ...COMMON_FEATURES],
    sortOrder: 4,
    isFounding: false,
  },
  {
    tierKey: 'bluebrown',
    label: 'Light Blue / Brown',
    colorGroups: ['lightblue', 'brown'],
    fee: 10000,
    unitsIncluded: 5,
    features: ['Entry position on the board', ...COMMON_FEATURES],
    sortOrder: 5,
    isFounding: false,
  },
]

/** The six playing pieces. Part of the product now, not inventory to sell. */
export const TOKENS = [
  { name: 'The Running Shoe', description: 'The one every runner reaches for first.', sortOrder: 1 },
  { name: 'The Finisher Medal', description: 'Ribbon and all.', sortOrder: 2 },
  { name: 'The Gel Packet', description: 'The most divisive object in the sport.', sortOrder: 3 },
  { name: 'The Water Cup', description: 'Pinched at the top, exactly the way you learn to.', sortOrder: 4 },
  { name: 'The Foam Roller', description: 'Recovery, rendered in die-cast metal.', sortOrder: 5 },
  { name: 'The Stopwatch', description: 'Every PR starts and ends here.', sortOrder: 6 },
]

/**
 * Why this lands in 2027 rather than being a nice idea at any time.
 *
 * Every other section argues the product is good. This one argues the moment
 * is, which is the question a race director asks second and nobody had
 * answered: board games are growing while screen time is the thing people say
 * they want less of, and a physical object aimed at a sport with no board game
 * of its own is sitting in the middle of that.
 */
export const WHY_NOW = [
  {
    title: 'People are tired of screens',
    body: 'Digital fatigue is the defining consumer mood of the decade. The thing people say they want more of is time not spent looking at a phone, and a board on a table is the oldest answer to that there is.',
  },
  {
    title: 'Board games are having a moment',
    body: 'Tabletop has been one of the few physical categories growing while everything else moved to a screen, and the licensed editions people actually keep are the ones tied to something they love.',
  },
]

/**
 * The reservation deposit, in dollars.
 *
 * One constant because it appears in the commit steps, the page prose, the
 * page CTA and the board-space modal, and those had already drifted once.
 *
 * ⚠️ This is display only. The amount actually charged is fixed inside the
 * Stripe payment link at DEPOSIT_URL, so changing this number does NOT change
 * what a race director pays. Both have to move together.
 */
export const DEPOSIT_AMOUNT = 250

export const TIMELINE: TimelinePhase[] = [
  {
    phase: 'Locking in races',
    window: 'Closes September 30, 2026',
    note: 'Every space must be committed before design can start',
  },
  {
    phase: 'Design',
    window: 'October to December 2026',
    note: 'Twelve weeks. Board composition locks the day it begins',
  },
  {
    phase: 'Production',
    window: 'January to October 2027',
    note: 'Nine months, costed at the long end of the quote with a month of slack',
  },
  {
    phase: 'On shelves',
    window: 'Holiday 2027',
    note: 'Delivered with the gifting window still ahead of it',
  },
]

export const COMMIT_STEPS: CommitStep[] = [
  {
    title: `Reserve your spot with a $${DEPOSIT_AMOUNT} deposit`,
    body: `Once you confirm which space you want with Matt, you put down a $${DEPOSIT_AMOUNT} deposit to reserve it. Fully refundable if we do not end up filling the entire board.`,
  },
  {
    title: 'We fill up the remaining race slots',
    body: 'We keep filling slots until all 22 are full with world-class marathons.',
  },
  {
    title: 'You pay 50% of your investment',
    body: `You see the complete list of races first, then pay the 50%, less the $${DEPOSIT_AMOUNT} you already put down.`,
  },
  {
    title: 'Final 50% when the product is in hand',
    body: 'Due on receipt of your complimentary units, and any additional units you ordered. Roughly October 2027.',
  },
]

/**
 * Awareness channels, as distinct from the unit allocation above them.
 *
 * The allocation already answers "which box goes where". These three do not
 * move units directly, they move the people who decide whether units move, so
 * putting them in the same list as expo stock made both harder to read.
 */
export const SALES_PLAN: SalesPlanItem[] = [
  {
    title: '22 race partners promoting at once',
    body: 'Every race on the board has a reason to tell their runners. That is 22 lists behind one product, in one gifting window.',
  },
  {
    title: 'Gifted to media',
    body: 'Units to running and lifestyle outlets early enough to make their holiday coverage.',
  },
  {
    title: 'Seeded to running influencers',
    body: 'Units in the hands of the creators runners already follow, ahead of launch.',
  },
  {
    title: '2027 holiday gift guides',
    body: 'Placement is being pursued now. An official Monopoly edition for a sport that has never had one is an easy story to place.',
  },
]

/**
 * Real replies to the tease email, sent August 12 2026.
 *
 * The email asked four questions, one of which was what they would expect to
 * pay, so every quote here is paired with that person's own answer.
 *
 * Verbatim apart from trimming, and attributed by first name only because
 * these were private replies to a survey rather than reviews anybody submitted
 * for publication. Two people are called Ricky, hence the initials.
 *
 * Which quotes get featured is an editorial call. Which numbers feed the chart
 * is not: 15 people wrote back, two said outright they would not buy, and the
 * guesses ran $20 to $199 against a $55 direct price. PRICE_ANSWERS below is
 * every figure anybody named, including the ones not quoted here, because
 * dropping the low end would move the median and that is choosing a number
 * rather than reporting one.
 */
export const COMMUNITY_FEEDBACK = [
  {
    quote:
      'I will with 100000% confidence purchase it if you guys make it happen. It can actually even be a perfect gift for fellow runners. We spend hundreds on race entry fees and gear so why not on a marathon board game.',
    name: 'Ricky F.',
    price: 'Price would not be an issue',
  },
  {
    quote:
      'Great idea. I would order for sure. If it is personalized maybe a bit more. Jail should be DNF.',
    name: 'Pat',
    price: '$50 to $60',
  },
  {
    quote:
      'Yes, absolutely. So many ideas: new gel disagrees with you at mile 18, go back N spaces. You win a lottery entry into the London marathon, jump ahead N spaces. Favorite shoe company drops new carbon plate race shoes 6 weeks before your next race, pay $300.',
    name: 'Dave',
    price: 'Not exceeding $49',
  },
]

/**
 * Every price anybody named, in dollars, as the midpoint of their answer.
 *
 * Kept next to the quotes rather than inside the chart component so the two
 * cannot drift, and so it is obvious that the chart holds more answers than
 * the six cards do.
 */
export const PRICE_ANSWERS = [20, 40, 42.5, 49, 55, 100, 149.5]

/** How many people replied at all, and how many of those named a figure. */
export const FEEDBACK_COUNTS = { replies: 15, namedAPrice: PRICE_ANSWERS.length }

/**
 * Where every box goes, for a 2,004 print run.
 *
 * The single thing a race asked to see before putting money down: not "we will
 * sell them", but which boxes, to whom, through what. Numbers are for the
 * minimum run and scale up if pre-orders justify a bigger one.
 */
/**
 * The two ways a race can turn its slot fee back into money.
 *
 * One place for these because four files were about to quote them: the offset
 * FAQ, the distribution allocation, the EarnItBack calculator and the deck.
 * The wholesale margin is derived rather than stated, so a change to retail or
 * wholesale cannot leave a stale "$20 a box" behind it.
 *
 * `commission` is set level with the wholesale margin on purpose. A race earns
 * the same either way, so the choice between them is about whether they want to
 * hold stock, never about which one pays better.
 *
 * `referralPool` is the "Race partner distribution" line in UNIT_ALLOCATION.
 * That row already assumed races would drive sales to our site; this pays them
 * for it. Keep the two in step.
 */
/**
 * The Board Guide: a second surface, reached by QR code from the box.
 *
 * A space on the board carries a race's name and its colours, and that is all
 * the board can carry. Twenty-two names on a game board is recognition, not
 * information, and a race director who wants to convert that recognition into
 * entries has nowhere to send anybody.
 *
 * The guide is that somewhere. Every box carries a code, every code lands on
 * one page, and every race on the board gets a panel on it: what the course is
 * like, what the finish feels like, when entries open. The board earns the
 * attention and the guide is where the attention can act.
 *
 * The promo code is the part that makes it measurable. A race issues its own
 * code, only the guide carries it, and every redemption is a runner who found
 * that race through this box. That turns a media buy a race director has to
 * take on faith into a channel with a number at the end of it, which is the
 * single thing the exposure model cannot give them.
 *
 * Deliberately not promised as a permanent URL with permanent hosting. It ships
 * with Edition One and lives as long as the edition does, same as the space.
 */
export const BOARD_GUIDE = {
  /** Where the code on the box lands. */
  url: 'trackstar.art/pages/board-guide',
  beats: [
    {
      title: 'A page of your own',
      body: 'Photos, your course, your story, and the one thing that makes your race worth flying for. As much room as you want, rather than the two words that fit on a game board.',
    },
    {
      title: 'A code only found here',
      body: 'Offer a discount on entry, a free upgrade, or anything else you choose. It appears nowhere but this guide, so every redemption is a runner the board sent you.',
    },
    {
      title: 'Twenty-two races, one audience',
      body: 'Somebody who bought this box already loves marathons. They are reading about your race next to the other 21, at the exact moment they are thinking about which one to run.',
    },
  ],
}

export const UNIT_PROGRAM = {
  /** What a box sells for, at an expo or on our site. */
  retailPrice: 55,
  /** What a race pays for boxes it intends to resell itself. */
  wholesalePrice: 35,
  /** Most boxes a race may buy at wholesale against one space. */
  wholesaleCap: 150,
  /** Paid per box sold through a race's own link or code. */
  commission: 20,
  /** Boxes of the first run set aside for race-driven sales. */
  referralPool: 400,
}

export const UNIT_ALLOCATION = [
  {
    label: 'Complimentary copies for race partners',
    units: 110,
    note: '5 complimentary units each, for staff, boards and giveaways',
  },
  {
    label: 'Press and influencer seeding',
    units: 50,
    note: 'Running media and creators, in hand before launch',
  },
  {
    label: 'Race partner distribution',
    units: 400,
    note: 'Races promoting through their own email list and social media, still purchased on the Trackstar site',
  },
  {
    label: 'Units races buy for their own stores',
    units: 200,
    note: 'Bought at $35 wholesale and sold at their expo or race store for $55',
  },
  {
    label: 'Trackstar (DTC)',
    units: 1244,
    note: 'Our email list of 10,000 people who have already bought a running gift, plus our organic and paid channels.',
  },
]


/**
 * The launch itself. A coordinated drop is the difference between 22 races
 * posting whenever they get round to it and the sport noticing on one day.
 */
export const LAUNCH_PLAN = [
  {
    title: 'Simultaneous social media launch',
    body: "To announce the launch of the product, we'll have 22 races post about it at the exact same time, driving intrigue and awareness.",
  },
  {
    title: 'Product photo shoot',
    body: 'Product photography, social cutdowns and copy, delivered to every partner ahead of the drop. Yours to run on your own channels at no production cost.',
  },
]

/**
 * Product shots.
 *
 * Concept renders, not photographs: the board has not been designed yet, so
 * anything legible inside them is illustrative. The set follows what we
 * actually have imagery of rather than an idealised list, which is why there
 * is no box shot here. An entry with no `src` renders as a reserved slot.
 */
export const PRODUCT_SHOTS: { label: string; src?: string }[] = [
  { label: 'The Board', src: '/monopoly/board.jpg' },
  { label: 'The Pieces', src: '/monopoly/pieces.jpg' },
  { label: 'Title Deeds', src: '/monopoly/title-deed.jpg' },
  { label: 'The Cards', src: '/monopoly/community-chest.jpg' },
]

export const FAQ: FaqItem[] = [
  {
    question: 'Is this officially licensed yet?',
    answer:
      "We have a verbal commitment from the company that holds the sole rights to create custom Monopoly editions, and they have told us that once all 22 races are signed up, they can get this edition approved. If it does not work out for any reason, you get all of your money back.",
  },
  {
    question: 'What if we do not have the infrastructure to hold and sell inventory?',
    answer:
      'You do not need any. We produce, warehouse, sell and ship every unit. Beyond the 5 complimentary units that come with your space, no boxes are sent to you unless you choose to buy some.',
  },
  {
    question: 'Will there be sponsors on the board competing with our own race sponsors?',
    answer:
      'The only other sponsors on the board will be title sponsors that individual races choose to put on their own title deed card. Other than that we are not taking on third-party sponsors anywhere on the board, so nothing appears beside your race that you did not agree to.',
  },
  {
    question: 'Is the board design final?',
    answer:
      'No. Everything you have seen is a concept render. The board layout, artwork, tokens and game rules are all worked out during the 12-week design and development period, which starts once all 22 spaces are committed, and you approve how your own race appears before anything prints.',
  },
  {
    question: 'Will we have control of how our marks appear?',
    answer:
      'Yes. You have approval rights on your name, your marks and how your course is represented, and nothing prints until you have signed it off.',
  },
  {
    question: 'What if you cannot fill the board, or the license does not come through?',
    answer:
      'Every deposit is refundable in full, for either reason. Nothing prints until the board is committed, the license is executed and the run is funded, so there is no version of this where you have paid for something that does not exist.',
  },
  {
    question: 'How long does this last?',
    answer:
      'It is per edition rather than per year. Committing guarantees your space on Edition One, which is printed once and then exists permanently. If there is ever a second edition you get first refusal on your space before it is offered to anybody else, and if there never is, you have still lost nothing to a clock running out.',
  },
  {
    question: 'What is the Board Guide?',
    answer:
      'Every box carries a QR code that opens a digital guide, and every race on the board has its own panel on it. You get photos, a description of your course, and a promotional code that exists nowhere else, so anybody who redeems it came to you from the board. The space puts your name in front of people; the guide is where they can act on it. You write your own panel and we build it.',
  },
  {
    question: 'Can we offset the fee by buying units of Marathon Monopoly?',
    answer:
      'Yes, and there are two ways to do it. You can buy up to 150 units at $35 and resell them at your expo for $55, which returns $20 a box. Or you can skip the inventory entirely: we give you a link and a code that are yours, you send people to it, and we pay you $20 for every box sold through it. We take the order, pack it and ship it. Both pay the same, and you can use both.',
  },
]
