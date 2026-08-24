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
 * What buying a slot includes.
 *
 * One list, rendered in two places: the Investment section and the title deed
 * modal on every board space. They used to be separate arrays saying different
 * things, so a race director who clicked their own square saw a shorter,
 * staler version of the offer than the one further down the page.
 *
 * The asterisk on the last line belongs to the page, which prints the footnote
 * under it. The modal has no room for a footnote, so it appends nothing.
 */
export const SLOT_INCLUDES = [
  "Your race's name on Marathon Monopoly: Edition One",
  'Creative approval of your marks',
  '5 complimentary units shipped to your office',
  'Featured in the Board Guide - a digital landing page where you can explain more about your race',
  'First right of refusal on your space in any future edition',
]

export const SLOT_INCLUDES_NOTE =
  'Your investment covers Edition One. If we ever print another, that edition is its own agreement, and you get first look at your space before anyone else.'

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
  'Your own page on the Board Guide',
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
/**
 * What a race actually gets for the fee, as six deliverables.
 *
 * This replaced three soft beats titled "Be Associated With the World's Best
 * Marathons", "Access to a Marathon-Obsessed Audience" and "Build a Legacy".
 * Not one of them was a thing anybody hands over, and they sat in the most
 * valuable position on the page, third, right where a reader asks what they get
 * for the money.
 *
 * Most of these already existed, scattered across five sections: the referral
 * commission was only in the Investment calculator, first refusal only in the
 * slot list and a FAQ, the guide only in its own section further down. A race
 * director reading top to bottom could not answer "what do I get for $17,000"
 * without scrolling back through four places. Stating them once as a set turns
 * the later sections into proof rather than repetition.
 *
 * "The square is yours" was removed along with the option for a race to put its
 * own title sponsor on the board or resell its square. Two races bringing
 * competing sponsors is a conflict printed onto a physical object that cannot
 * be patched after the run. Removed rather than hidden, because a switched-off
 * feature still reads as one somebody might switch on.
 *
 * The commission card used to lead on exclusivity, that only the 22 races could
 * earn on the game. True, and worth nothing: no running club or influencer was
 * queuing up for the right, so the card was guarding a door nobody was trying
 * to open while burying the part that matters, which is the $20.
 *
 * Ordered so the grid reads in two rows of three: the commercial case first
 * (audience, commission, merchandise), then what a race owns (their space,
 * their page, the print on the wall).
 */

export const WHATS_IN_IT = [
  {
    title: '22 Races Promoting a Product With Your Race On It',
    body: 'Each race is incentivized to promote this product. As their runners buy it, they discover your race.',
  },
  {
    title: 'Earn a Commission Selling the Product',
    body: "You'll earn $20 a box on every order attributed to you, without having to hold product or do fulfillment. We take the order, pack it and ship it.",
  },
  {
    title: 'Expand Your Merch Offering',
    body: "Add a unique product that's highly giftable to your merchandising lineup.",
  },
  {
    title: 'Right of First Refusal',
    body: 'If we create more editions of Marathon Monopoly, you will have the first shot to renew your space before we offer it to anyone else.',
  },
  {
    title: 'A Place to Tell Your Story',
    body: 'There will be a QR code in every box that opens up the Board Guide. Your race has a page on it. You can tell your story, explain your course, and even include a discount code if you want.',
  },
  {
    title: 'A Framed Title Deed',
    body: "We'll send all the races on our board a framed piece of wall art that shows your Marathon Monopoly Title Deed.",
  },
]

/**
 * Three beats, left of the photograph.
 *
 * The first one used to be a subheading, a row of five example chips and a
 * large red panel asking the question, all stacked above the other two. That
 * was three pieces of furniture to make one point, so it is now a beat and the
 * section reads as one list.
 *
 * It carries the question rather than the section heading because the heading
 * is the label on a plate, and a plate reading "Why isn't there Marathon
 * Monopoly?" is a sentence pretending to be a tab. The heading says where you
 * are, the beat asks the question, and the answer is the two beats under it.
 *
 * The licensed-editions clause came out of "Board games are having a moment"
 * when this beat took its place at the top, because the two were making the
 * same argument a paragraph apart.
 */
export const WHY_NOW = [
  {
    title: "Why isn't there Marathon Monopoly?",
    body: 'There are over 300 custom editions of Monopoly (Star Wars, National Parks, NFL teams) but why not Marathon Monopoly? We have got the audience, the obsession and the need for novel gifts. That changes now.',
  },
  {
    title: 'People are tired of screens',
    body: 'Digital fatigue is the defining consumer mood of the decade. The thing people say they want more of is time not spent looking at a phone, and a board on a table is the oldest answer to that there is.',
  },
  {
    title: 'Board games are having a moment',
    body: 'Tabletop has been one of the few physical categories growing while everything else moved to a screen, and a marathon is exactly the kind of thing people build a shelf around.',
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
 * guesses ran $20 to $199 against a $65 direct price. PRICE_ANSWERS below is
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
 * There is no reserved referral pool. Complimentary copies and press seeding
 * come off the top of the run and everything after that is first come, however
 * it sells.
 */
/**
 * The Board Guide: a second surface, reached by QR code from the box.
 *
 * A space on the board carries a race's name and its colors, and that is all
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
  intro:
    'Every board comes with a QR code that takes the people playing the game to an interactive website showing off all the races on the board.',
  beats: [
    {
      title: 'Another touchpoint',
      body: 'The board puts your name in front of them. The guide is where they can read about your race, see it, and decide they want to run it.',
    },
    {
      title: 'Discount codes for your race',
      body: 'Offer a discount on entry, a free upgrade, or anything else you choose. The code appears nowhere but here, so every redemption is a runner the board sent you.',
    },
    {
      title: 'Rich Content',
      body: 'Photos, your course, your story, and a link straight to registration. As much room as you want to tell your story the way you want.',
    },
  ],
}

export const UNIT_PROGRAM = {
  /**
   * What a box sells for, on our site or at an expo.
   *
   * $65, not $55. With a $20 referral commission the true break-even is $63:
   * $29.50 landed, $10 shipping, $3.50 pick and pack, $20 to the race. At $55
   * every referred box loses $8, which is roughly $14,700 across the run and an
   * $18,440 swing against $65.
   *
   * The $55 figure came from the wholesale case, where a race buys at $35 and
   * clears $20 reselling. That is the race's margin, not our break-even, and
   * the two were being read as the same number.
   *
   * Keep this in step with the Shopify product, which already lists at $65.
   */
  retailPrice: 65,
  /**
   * What a race pays for boxes it intends to resell itself.
   *
   * $40, up from $35. Two things moved underneath that number. Retail went to
   * $65, which quietly raised a reseller's margin from $20 to $30 and made
   * wholesale pay a race half again what the referral does. And the channel was
   * never carrying its outbound freight: the model books expo shipping at zero,
   * but somebody puts those boxes on a truck. That runs about $1.70 a unit on a
   * pallet and $4.40 on a small parcel order, so true break-even is $31 to $34
   * against a $29.50 landed cost, not $29.50.
   *
   * At $40 a race still clears $25 reselling at $65, ahead of the $20 referral,
   * and we make roughly $6 to $9 depending on order size.
   */
  wholesalePrice: 40,

  /**
   * Smallest wholesale order, in units.
   *
   * Small orders are where the margin goes: 25 units ships at $4.40 a unit
   * against $1.73 on a pallet. A floor also separates races that mean to sell
   * from races wanting a few for the office, which the 5 complimentary units
   * already cover.
   */
  wholesaleMin: 25,
  /** Paid per box sold through a race's own link or code. */
  commission: 20,
  /**
   * Ceiling on the earnings slider, in units.
   *
   * Not a reserved allocation. Nothing in the run is set aside for race-driven
   * sales any more: complimentary copies and press seeding come off the top and
   * everything else is first come, whether it sells through a race link, a
   * wholesale order or our own audience.
   *
   * 300 rather than 400 because 22 races selling 84 boxes each is already the
   * entire sellable run. A slider that reaches 400 quietly implies a fifth of
   * the print is available to any one race, which is only true for the first
   * few who ask.
   */
  sliderMax: 300,
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
    label: 'Up for grabs',
    units: 1844,
    note: 'Split between races selling through their own links, wholesale orders, and Trackstar\u2019s own audience. First come, first served. Wholesale units are available on request at $40 per unit, 25 unit minimum.',
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
    question: 'Can we earn any of the fee back by selling units?',
    answer:
      'You do not have to. Every race gets its own link, and we pay you $20 for every box sold through it while we handle the order, the packing and the shipping. Nothing to buy up front and nothing to store.',
  },
  {
    question: 'Can we buy units wholesale?',
    answer:
      'Yes. Boxes are $40 each with a 25 unit minimum, if you would rather hold stock and sell it yourself at your expo or in your race store. At the $65 suggested retail that is $25 a box to you. Most races take the link instead, because there is no cash up front and no boxes to store, but the wholesale option is there whenever you want it.',
  },
]
