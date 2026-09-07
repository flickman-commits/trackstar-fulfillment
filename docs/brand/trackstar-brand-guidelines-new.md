---
name: brand-guidelines
description: "Trackstar brand guidelines reference. Use this skill whenever you're building, designing, writing, or creating ANYTHING for Trackstar — landing pages, emails, ads, social posts, Klaviyo flows, Shopify pages, partner toolkits, proposals, flyers, presentations, or any visual/written asset. Also trigger when the user says 'make this on-brand', 'use our brand', 'Trackstar style', 'brand colors', 'brand voice', 'what font do we use', or asks about logos, colors, typography, tone, or visual direction. If you're about to write copy or generate a design for Trackstar and you haven't read this skill, stop and read it first."
---

# Trackstar Brand Guidelines

Reference document for every Trackstar asset — visual, written, or digital. When building anything for Trackstar, apply these standards. Don't ask Matt to re-explain them.

---

## Brand Identity

**What Trackstar is:** Personalized race finisher prints — premium wall art customized with a runner's finish time, pace, bib number, race-day weather, and course map. Printed on archival matte fine art paper, available framed or unframed. Printed + framed in Kentucky, shipped to your doorstep.

**What Trackstar is NOT:** A participation certificate. A generic race poster. A novelty gift. Cheap wall decor.

**Brand positioning:** This is a trophy you hang on your wall. It's for runners who view running as identity — and for the people who love them and want to honor that.

**Tagline:** Celebrating athletic achievement.

**Two audiences, one product:**
- **Runners** buy for themselves — pride, identity, achievement. They want to see their data immortalized.
- **Gifters** buy for someone they love — thoughtfulness, emotion, surprise. They want to give something that makes a runner cry when they open it.

---

## Color Palette

### Primary Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Trackstar Purple** | `#4600D6` | Primary accent — buttons, links, highlights, CTAs, active states |
| **Near Black** | `#1A1A1A` | Primary text, dark backgrounds, poster backgrounds |
| **White** | `#FFFFFF` | Body text on dark backgrounds, clean space |
| **Cream / Off-White** | `#F7F5F0` | Light backgrounds, the mat border inside framed prints, subtle warmth |

### Supporting Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Light Gray** | `#F5F5F5` | Section backgrounds, cards, subtle dividers |
| **Medium Gray** | `#666666` | Secondary text, captions, metadata |
| **Border Gray** | `#E0E0E0` | Dividers, input borders, table lines |

### Color Rules

- **Trackstar Purple is the accent, not the dominant color.** Use it for CTAs, links, hover states, and emphasis. The brand's visual weight comes from the near-black and cream contrast.
- Dark backgrounds (`#1A1A1A`) with white or cream text is the signature Trackstar look. Use this for hero sections, email headers, and anywhere you want premium feel.
- Never use purple as a background fill for large areas. It's a signal color — buttons, underlines, icons, badges.
- Avoid pure black (`#000000`). Always use `#1A1A1A` — it's softer and more intentional.

---

## Typography

### Font Family

**Helvetica Neue** — used across all touchpoints: website, emails, ads, print collateral, partner materials.

| Weight | Usage |
|--------|-------|
| **Bold (700)** | Headlines, race names, CTAs, emphasis |
| **Medium (500)** | Subheadings, navigation, labels |
| **Regular (400)** | Body copy, descriptions, metadata |
| **Light (300)** | Large display text where you want elegance (sparingly) |

### Typography Rules

- **Headlines are concise.** Nobody reads long headlines. If it doesn't fit in one line on mobile, it's too long.
- Race names on posters and in marketing use the same case as the official race name — do NOT default to all caps.
- Data on posters (finish time, pace, weather, date) uses the same Helvetica Neue family — do not use a separate monospace font.
- Body copy: 16px minimum on web. 14px minimum in emails.
- Line height: 1.4–1.6 for body, 1.1–1.2 for headlines.

### Fallback Stack

```css
font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

---

## Logo

### Logo Files

All logo files are stored in Google Drive:
**Logo Folder:** [https://drive.google.com/drive/folders/1rRl9yfaQY-3w8_JtD4ds7OtpEp-mI58R](https://drive.google.com/drive/folders/1rRl9yfaQY-3w8_JtD4ds7OtpEp-mI58R)

Subfolders:
- **Wordmark/** — The "Trackstar" text logo (primary logo for most uses)
- **Square/** — Square mark for social avatars, favicons, app icons
- **Design Files/** — Source files (AI/EPS) for print and large-format use

### Logo Variants

| Variant | When to Use |
|---------|-------------|
| **Dark wordmark** (black/dark on light background) | Default for light backgrounds — website header, light emails, print collateral |
| **White wordmark** (white on dark background) | Dark hero sections, dark email headers, poster overlays, dark social posts |

### Logo on the Website

The Shopify site uses these two logo images:
- Light mode: `Trackstar_Logo_Cropped.png`
- Dark mode: `Trackstar_White_Logo_Cropped.png`

Both are served from the Shopify CDN.

### Logo Rules

- Always use the provided logo files. Never recreate, retype, or approximate the wordmark.
- Minimum clear space around the logo: at least the height of the "T" in Trackstar on all sides.
- Don't place the logo on busy backgrounds. If the background is complex, add a subtle overlay or use a solid-color container.
- Don't stretch, rotate, recolor, or add effects to the logo.

---

## Poster Design System — "The Trackstar Five"

Every race poster follows these five signature design elements:

### 1. The Cream Mat
An off-white border inside the frame edge — mimics gallery-quality matting. This is what makes the prints feel premium and art-world, not like a printout from a race expo.

### 2. The Stats Block
Finish time, pace, race-day weather, and date displayed below the race title in Helvetica Neue. Clean, data-forward. This is the personalization that makes each print unique.

### 3. The Glowing Route
The course map rendered as a warm-toned route line against the dark background. This is the visual hero — it occupies roughly 50–60% of the composition. The route line should feel like it's glowing or illuminated.

### 4. Shadow Landmarks
Subtle cityscape or geographic silhouettes at 10–15% opacity in the background. These anchor the print to the race's location without competing with the route. Think: a faint skyline, a bridge outline, mountain ridges.

### 5. Bottom-Right Personalization
Runner's name and bib number anchored to the lower right. Understated — it's their print, but the race and the route are the stars.

### Poster Specs

- **Orientation:** Portrait
- **Aspect ratio:** 2:3
- **Background:** One dominant dark color per race, reflecting geographic or cultural identity (deep navy for coastal races, forest green for trail/mountain, warm charcoal for urban)
- **Font:** Helvetica Neue — Bold for race title, Regular/Medium for stats and personalization
- **Course map:** Hero element, ~50–60% of composition
- **Sizes:** 8×10, 12×18, 16×24, 24×36 (Dan designs one Illustrator file with four artboard sizes)

---

## Product Photography & Visual Content

### Mockup Images

- **Straight-on product shots** — clean, minimal background, showing the framed print front-facing. This is the default product image for Shopify listings and email hero images.
- **Detail/zoom shots** — close-ups on the course map, the stats block, the frame corner, the mat texture. These sell the quality and craftsmanship.
- **Lifestyle context shots** — the print hanging on a wall in a real room (living room, office, hallway). Shows scale and how it looks in someone's home.

### UGC & Video Content

- **Unboxing videos** — short clips (15–30 seconds) of someone opening their Trackstar package. Shows the real product experience — the packaging, the reveal, the reaction. Use in stories, reels, emails, and ads.
- **Customer photos** — real photos from customers showing their print on their wall, tagged on Instagram, sent via DM. The best social proof we have.

### Emotional / Lifestyle Photography

- Gritty, real running photography — not stock photos of smiling joggers. Think NYC marathon vibes: rain, sweat, determination, city streets, early morning runs, finish line emotion.
- These images don't show the product. They sell the feeling — the identity of being a runner. Used in hero sections, ad creative, email backgrounds, and social content.
- **The vibe:** documentary, not commercial. Candid, not posed. Urban grit, not suburban polish.

### Visual Content Rules

- Never use generic stock photography of runners. If it looks like it came from a stock library, don't use it.
- Product mockups should always show the actual poster design for the specific race — never a placeholder or blank frame.
- UGC is gold. Real customer photos > polished mockups for social proof sections.

---

## Brand Voice & Copy

### Who Trackstar sounds like

Someone who has run a marathon. They know what it takes — the training, the wall, the finish line emotion. They don't make it a huge dramatic deal, but they respect it. They can have fun with it. They're supportive and encouraging, but never corny. Think: your fast friend who also happens to be a great gift-giver.

### Voice Attributes

| Attribute | What it means | Example |
|-----------|--------------|---------|
| **Restrained pride** | We celebrate achievement without shouting. No "CONGRATS!!!" energy. | "You earned the wall space." |
| **Data-forward** | The personalization IS the product. Lead with the specifics. | "Your finish time. Your pace. Your course map." |
| **Runner-literate** | We speak the language. PR, BQ, negative split, the wall. No need to explain. | "Hang your PR, not just your medal." |
| **Warm, not soft** | Supportive but never saccharine. Direct but never cold. | "He ran it. Let him hang it." |
| **Short** | Copy is tight. If you can say it in 5 words, don't use 10. | "Medals go in drawers. This goes on your wall." |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| **Runner-facing ads** | Pride, identity, achievement | "You didn't run 26.2 miles to forget about it." |
| **Gifter-facing ads** | Emotion, thoughtfulness, love | "The gift that makes a runner cry." |
| **Product descriptions** | Clean, factual, confident | "Personalized with your finish time, pace, bib number, and race-day weather." |
| **Email subject lines** | Curiosity, brevity, urgency | "Don't see your race? We'll make it." |
| **Partner materials** | Professional, win-win, easy | "We promote. You earn. Runners love it." |
| **Social captions** | Casual, real, community | "This is what CIM looks like on the wall." |

### Copy Rules

- **Keep headlines short.** One line on mobile or it's too long.
- **Lead with the runner, not the product.** "You earned this" > "Buy our print."
- **Use "you" and "your" liberally.** This is personal.
- **Avoid:** "Congratulations!", exclamation-heavy copy, generic motivational quotes, "amazing journey" language, anything that sounds like a participation trophy.
- **Gift copy leans emotional:** "Imagine their face." / "The most thoughtful gift you'll ever give."
- **Runner copy leans identity:** "This is a trophy, not a certificate." / "For the Dad who doesn't quit."
- The custom order pitch: "Don't see your race? We'll make it. Any race, any year, anywhere in the world."
- Shipping line: "Printed + framed in Kentucky. Shipped to your doorstep."

### Headlines & Taglines We Like

These are proven lines — reuse and riff on them:

- "Medals go in drawers. This goes on your wall."
- "For the Dad who doesn't quit."
- "He ran it. Let him hang it."
- "Finish lines look better framed."
- "You earned the wall space."
- "Celebrating 1,404 runners and counting." (update the number)
- "Don't see your race? We'll make it."

---

## Digital Design — Website & Email

### Website (Shopify)

- **Header:** Clean, minimal. Dark wordmark logo left-aligned. Navigation is minimal — the product collection is the primary destination.
- **Hero section:** Full-bleed lifestyle or product image with short headline overlay. Dark overlay if needed for text legibility.
- **Product grid:** Clean cards, consistent spacing. Each card shows the straight-on mockup image. Price visible. Race name as title.
- **Social proof:** Customer photos in a horizontal scroll. Each tagged with city/state. Real UGC, not staged.
- **Footer:** Minimal. Logo, legal links, Endorphins partnership callout, Instagram link.
- **Promotions banner:** Top-of-page bar. Current: "Free US Shipping on orders over $100" and "Buy 2 prints & get the second 30% off."

### Email (Klaviyo)

- **Background:** `#1A1A1A` for header sections, `#FFFFFF` or `#F7F5F0` for body.
- **Buttons:** Trackstar Purple (`#4600D6`), white text, **0px border-radius** (sharp corners, no rounding). This is non-negotiable — all buttons across all emails and landing pages should be square-cornered purple.
- **Font:** Helvetica Neue (with Arial/sans-serif fallback for email clients).
- **Image style:** Product mockup as hero, minimal surrounding design. Let the print speak.
- **From name:** "Matt @ Trackstar" for brand emails. "Alexa @ Trackstar" for B2B outreach.
- **Tone:** Casual, concise. Feels like a note from a person, not a corporate email blast.

### Buttons (Universal)

All Trackstar buttons — website, email, landing pages, forms, pop-ups — follow this spec:

```css
background-color: #4600D6;    /* Trackstar Purple */
color: #FFFFFF;
border-radius: 0px;           /* Sharp corners — always */
font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.5px;
padding: 12px 24px;
```

Hover state: slightly lighter purple (`#5A1AE6`) or subtle opacity change.

### Landing Pages

- Keep them focused — one CTA per page.
- Hero image + short headline + CTA above the fold.
- Social proof (customer photos, review quotes) below the fold.
- Dark sections alternate with light sections for visual rhythm.
- Always include the product mockup — people need to see what they're buying.

---

## Ad Creative Guidelines

### Meta Ads

**Proven creative formula:**
1. Product photo (straight-on mockup of the framed print) — this is the foundation
2. Race-specific geographic targeting (25-mile radius around the race city)
3. Short, punchy copy — one line of body text is often enough

**Creative types that work:**
- **Product photos** — clean mockup shots, the print is the star
- **UGC unboxing** — real reactions, real product reveals
- **Lifestyle runner photography** — emotional, gritty, used as background or hook image with product CTA
- **Mom/gifter UGC** — testimonial-style: "I got this for my husband and he cried"

**Creative rules:**
- Turn OFF all Advantage+ Creative Enhancements in Meta except Translate. Visual touch-ups can make the poster look off-brand.
- Pre-race copy: "Running the [Race]? You deserve this." / Post-race copy: "Just finished the [Race]? You earned this."
- Always link to the specific race product page, not the homepage.
- Target CPA: $35–40. Break-even CPA: ~$55.77. If a creative is above $55 CPA after meaningful spend, kill it.

### Social Media (Instagram)

- **Feed posts:** Product mockups, customer UGC reposts, new race design drops
- **Stories:** Unboxing videos, behind-the-scenes, race day content, swipe-up/link stickers to product pages
- **Reels:** Unboxing reveals, runner emotion content, "how it's made" process content
- **Handle:** @trackstar_art
- **Hashtag style:** Minimal. Don't overload. #trackstar if anything.

---

## Partner-Facing Materials

### Proposals & Toolkits

- Professional but not corporate. Clean layout, plenty of white space.
- Lead with the product — include mockup images early.
- Revenue share payout scenarios are the most-read section by race directors. Make the math crystal clear.
- Include links to the unboxing video and customer photos for credibility.
- Tone: collaborative, easy, win-win. "We handle everything. You promote. Runners love it."

### Flyers & Expo Materials

- Dark background, cream/white text — matches the poster aesthetic.
- QR code prominent (generated with `dark="#1a1a1a"`, transparent background).
- Headline should be race-specific: "Your [Race Name] Finisher Print" — not generic.
- Show the actual race's poster design, not a generic example.
- Include the Trackstar logo (white variant on dark background).

---

## Quick Reference — Build Checklist

Before shipping any Trackstar asset, verify:

- [ ] Using Trackstar Purple (`#4600D6`) for accent/buttons — not some other color
- [ ] Buttons have 0px border-radius (sharp corners)
- [ ] Font is Helvetica Neue (not Arial, not system default)
- [ ] Dark color is `#1A1A1A` (not pure black)
- [ ] Copy is short and concise — trim anything that doesn't need to be there
- [ ] Runner vs. gifter audience is clear and tone matches
- [ ] Product mockup or real UGC is included (no generic stock)
- [ ] Logo is the correct variant (dark on light, white on dark)
- [ ] No all-caps race names (unless that's the official name style)
- [ ] Feels premium — not cluttered, not loud, not cheap
