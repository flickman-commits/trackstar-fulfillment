# Marathon Monopoly — image generation prompts

Five images for `/monopoly`. Generate **Image 1 first**, then feed the result back
as a reference image for 2–5 so the board art, palette and lighting stay
consistent.

## Why the last set failed

Three things went wrong, and all three are fixable in the prompt:

1. **Too much small text.** Image models garble any text below a certain size.
   The old renders had 40 legible space names, so almost all of them came out as
   nonsense ("MARAHTON MONOPOLY", "COLLECT AS YOU PAS TO CARD", mirrored words).
   The fix is a **text whitelist**: name the few strings allowed to be legible
   and explicitly require everything else to be too small or too soft to read.
2. **A manufacturer logo.** Every render invented a mangled Hasbro mark. We do
   not have the license yet, so it should not appear at all, garbled or not.
3. **Real race names.** New York City Marathon, Marine Corps and California
   International all appeared. None have committed. Use the color-tier
   placeholder names the real board component already uses.

---

## Block A — paste at the top of every prompt

```
Photorealistic product photography of a running-themed board game called
MARATHON MONOPOLY.

CONSISTENT ACROSS THE WHOLE SET:
- Soft, diffused daylight from the upper left. Gentle natural shadows. No
  harsh specular highlights.
- Board playing surface is pale mint green (hex #CCE7D3). Accents are bright
  red (#ED1C24) and warm near-black ink (#231F20). Property color bands are
  brown #955436, light blue #AAE0FA, pink #D93A96, orange #F7941D, red #ED1B24,
  yellow #FEF200, green #1FB25A, dark blue #0072BB.
- Playing pieces are matte pewter / antiqued silver die-cast metal.
- Overall feel: a premium modern board-game press kit. Crisp, clean, uncluttered.
- Shot on a 50mm lens, natural color, no heavy vignette, no HDR look.
- SQUARE 1:1 aspect ratio. Every image in this set is square.

HARD RULES:
- NO manufacturer branding anywhere in frame. No Hasbro, no Parker Brothers,
  no publisher logo, no oval logo badge, no trademark symbols.
- NO real marathon or city names. NO real sponsor or shoe brand logos.
- NO watermarks, no signatures, no UI overlays.
```

## Block B — paste at the bottom of every prompt

```
TEXT RULES — follow these exactly:
- ONLY the words listed in this prompt may appear legibly. Spell them exactly
  as written, upright, correctly oriented, never mirrored or upside down.
- Every other label on the board must be rendered either too small to read or
  softly out of focus. Suggest text with indistinct marks rather than trying to
  render words.
- Do not invent extra words, headlines, prices or logos.
```

---

## Image 1 — The board

Generate this first. It defines the board for the rest of the set.

```
[BLOCK A]

Straight-down overhead flat-lay of the complete open game board on a pale
neutral surface, board filling the frame, edges parallel to the frame edges
(NOT rotated to a diamond).

BOARD STRUCTURE — standard Monopoly geometry, 40 spaces around a square:
- Four corner squares: bottom-right "GO" with a large red arrow, bottom-left
  "IN JAIL / JUST VISITING", top-left "FREE PARKING", top-right "GO TO JAIL".
- 22 property spaces in eight color groups, each with a colored band along
  its inner edge. Clockwise from GO: 2 brown, 3 light blue, 3 pink, 3 orange,
  3 red, 3 yellow, 3 green, 2 dark blue.
- 4 "station" spaces evenly spaced, one per side, each showing a small flat
  icon: a packet-pickup tent, a shuttle bus, a start corral arch, a gear-check
  tag.
- 2 utility spaces with small flat icons: an electrolyte drink bottle, an
  energy gel sachet.
- 2 tax spaces with small flat icons: a race bib, a phone showing a training
  chart.
- 3 "Chance" spaces marked with a large red question mark, and 3 "Community
  Chest" spaces marked with a small chest icon.
- Two card decks sit in the middle of the board, face down, slightly angled.

CENTRE OF THE BOARD:
A bold red and black "MARATHON MONOPOLY" wordmark on a white plate, angled
diagonally, with a simple flat illustration of a road-race field of diverse
runners beneath it. Keep the center illustration simple and graphic, not busy.

LEGIBLE TEXT ALLOWED (exactly these, nothing else):
"MARATHON MONOPOLY", "GO", "FREE PARKING", "IN JAIL", "JUST VISITING",
"GO TO JAIL", "CHANCE", "COMMUNITY CHEST"

Every one of the 22 property space names must be present but rendered as
small, soft, unreadable printed lines. Do not attempt to spell them.

[BLOCK B]
```

## Image 2 — The pieces

```
[BLOCK A]

Close-up three-quarter product shot of six die-cast metal playing pieces
arranged in a loose row on a pale neutral surface, with the corner of the game
board softly out of focus in the upper background.

THE SIX PIECES, left to right:
1. A running shoe, side profile, visible laces and tread.
2. A finisher medal on a short ribbon.
3. An energy gel sachet, slightly crumpled at one end.
4. A crushed paper water cup, pinched at the rim the way runners hold them.
5. A foam roller, short cylinder with a ridged surface.
6. A stopwatch with a round face and a top button.

All six in the same matte antiqued pewter finish, same scale relative to each
other, sharp focus across the row, shallow depth of field behind them.

LEGIBLE TEXT ALLOWED: none. The pieces carry no words at all. Any board text in
the background must be fully out of focus.

[BLOCK B]
```

## Image 3 — Title deed card

```
[BLOCK A]

Close-up of a single title deed card held between the thumb and fingers of one
hand, angled slightly toward camera, with the game board blurred behind it.
Natural skin tones, clean unpolished nails, no jewellery, no visible tattoos.

THE CARD, portrait orientation, white with a black keyline border:
- A solid dark blue (#0072BB) header band across the top.
- Inside the band, in white capitals: "DARK BLUE RACE SPACE"
- Below the band, small black capitals: "TITLE DEED"
- Then a short list of rent lines in plain black text, right-aligned figures.
- The card must NOT name any real marathon, city or brand.

LEGIBLE TEXT ALLOWED (exactly these, nothing else):
"TITLE DEED", "DARK BLUE RACE SPACE", "RENT $50", "WITH 1 HOUSE $200",
"WITH 2 HOUSES $600", "WITH 3 HOUSES $1400", "WITH HOTEL $2000",
"HOUSES COST $200 EACH"

Everything on the blurred board behind must be unreadable.

[BLOCK B]
```

## Image 4 — The cards

```
[BLOCK A]

Close-up of one Chance card held up between thumb and fingers, angled toward
camera, with a neat face-down stack of cards resting on the blurred board
below and behind it.

THE HELD CARD, landscape orientation, white with a thin black keyline:
- The word "CHANCE" in the top left, in a classic script, black.
- Centerd beneath it, in bold black capitals, three short lines:
  "NEW GEL DISAGREES WITH YOU"
  "AT MILE 18"
  "GO BACK 3 SPACES"
- To the right, a simple black line-drawing of a runner in a vest and shorts,
  doubled over holding their stomach. Line art only, no color, no top hat, no
  moustache, no resemblance to any existing mascot character.

The face-down stack shows a plain red card back with a small white question
mark. No wordmark on the backs.

LEGIBLE TEXT ALLOWED (exactly these, nothing else):
"CHANCE", "NEW GEL DISAGREES WITH YOU", "AT MILE 18", "GO BACK 3 SPACES"

[BLOCK B]
```

## Image 5 — The family

```
[BLOCK A]

Warm lifestyle photograph: three people playing the game around a wooden
kitchen table in a bright modern home. A man in his forties mid-move, reaching
to place a piece; a woman beside him laughing; a boy of about ten leaning in
from the right, engaged. Everyone looking at the board, not at the camera.
Candid, unposed, natural expressions, no direct eye contact with the lens.

The open board sits flat in the middle of the table, clearly the Marathon
Monopoly board from the reference image, with cards fanned at the edges,
metal pieces on the spaces, and a couple of finisher medals resting nearby.

Late-afternoon window light from the left, warm and soft. Shot at f/2.8 so the
people and the board are sharp and the room falls away gently. SQUARE 1:1
composition, with headroom above the faces and the full board visible.

LEGIBLE TEXT ALLOWED: "MARATHON MONOPOLY" on the board center only. Every
other word on the board and cards must be too small or too soft to read.

[BLOCK B]
```

---

## After generating

- Check every image at 100% for invented logos and misspelt words before use.
- Web copies live in `public/monopoly/` at ~1400px. Resize with:
  `sips -Z 1400 -s format jpeg -s formatOptions 72 <src> --out public/monopoly/<name>.jpg`
- Filenames the page expects: `board.jpg`, `pieces.jpg`, `title-deed.jpg`,
  `community-chest.jpg`, `family.jpg`.
