# Board Guide photography prompts

The guide cards currently render a generated aerial illustration. It is a
stand-in, not a design decision: real drone photography is what makes a race
card look like somewhere you would fly to. Twenty-two images, one per race.

Two ways to fill them, in order of preference:

1. **Ask the race.** Most majors already own drone footage of their own start,
   finish or skyline, cleared for promotional use. It costs nothing, it is the
   real course, and it gives the race something to contribute early, which is
   worth more than the photo.
2. **Generate one** from the prompts below when a race has nothing usable.

Generated images must never be presented as photographs of the race. Keep them
skyline-only, with no runners, no course furniture and no finish line, so the
image reads as the city rather than as the event.

## Block A: paste at the top of every prompt

```
Aerial drone photograph of a city skyline, shot from roughly 400 feet, camera
tilted slightly down, wide establishing view.

CONSISTENT ACROSS THE SET:
- Golden hour, sun low and behind the camera, long soft shadows.
- Clear air, gentle atmospheric haze toward the horizon.
- Natural color. No HDR, no heavy grading, no teal-and-orange look.
- Shot on a 24mm equivalent lens, level horizon, no fisheye distortion.
- 2:1 landscape crop, composed so the skyline sits in the lower two thirds.

HARD RULES:
- NO runners, NO race courses, NO finish lines, NO start corrals, NO crowds,
  NO banners, NO branded signage of any kind.
- NO recognizable corporate logos on buildings.
- NO text, watermarks, timestamps or UI overlays.
- NO people identifiable at any distance.
```

## Block B: paste at the bottom of every prompt

```
The image must read as a real photograph taken from a drone. Avoid
illustration, painterly rendering, tilt-shift miniature effects, and any
stylised or poster-like treatment.
```

## Per-race prompt

Fill the bracket from the race's own city and drop it between Block A and
Block B.

```
[BLOCK A]

The city is [CITY]. Include its most recognizable natural feature: [RIVER,
HARBOUR, LAKE, MOUNTAINS OR COASTLINE]. The skyline should be identifiable to
somebody who has been there, without relying on any single landmark filling
the frame.

Season: [SEASON THE RACE IS RUN IN]. The trees, light and sky should match the
month the race takes place, not high summer by default.

[BLOCK B]
```

## After generating

- Check at 100% for invented signage and garbled text on buildings before use.
- Crop to 2:1. The card renders at 190px tall and crops to fill, so anything
  important must sit near the center.
- Resize and convert:
  `sips -Z 1600 -s format jpeg -s formatOptions 72 <src> --out <city>.jpg`
- Upload through the theme editor on the race's block in the Board Guide
  section. The section takes an image per race; nothing needs a code change.
