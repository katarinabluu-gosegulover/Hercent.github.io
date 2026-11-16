# Hercent — Winter Beta v1.0

The owner approved a winter landscape with a subtle hacker identity. Preserve this direction during polish; do not restore the older terminal/diagram homepage.

## Visual System

- Light: coral sunset, snowy trees and frozen river; warm paper reading surface.
- Dark: the matching night scene with aurora; deep blue reading surface.
- NeoDunggeunmo Code for Korean/English display text and navigation; IBM Plex Sans KR for long prose; IBM Plex Mono for code.
- Homepage sequence: landscape, real featured analysis, newest-first notes, author/topic sidebar.
- Real post titles, dates, links and images come from Jekyll data. Background artwork is generated, not a photograph of an identified location.

## Imagery And Motion

Desktop has separate native 1774x887 sunset/night WebP images. Mobile keeps the original portrait composition via `landscape.webp`. Do not stretch half the mobile comparison image across desktop. Preserve theme crossfades unless reduced motion is enabled.

`winter-weather.js` renders snow and night-only aurora at up to 30 fps. Mobile uses 36 particles and 1x resolution; desktop uses 80 particles and at most 1.5x. Motion Off, reduced motion, hidden tabs and offscreen heroes stop rendering. This is procedural animation over a still image, not video. The subtle CSS sky light supports, rather than competes with, the canvas aurora.

Keep native wheel/touch scrolling. Only the explicit scroll link requests smooth navigation. Motion and Cursor controls are separate, in English, with persistent preferences. Theme icons show the destination theme.

## Craft Rules

- Preserve clear text over scenery; effects never capture pointer input.
- Controls use at least 44px targets where possible. Archive filters share 44px input heights and aligned baselines, stacking on mobile.
- Search inputs and mobile article prose are at least 16px. Pixel styling is not a reason to shrink long text.
- No fake telemetry, extra profile monograms, terminal windows, or decorative metrics.
- Keep keyboard focus, no-JS reading, working links, image viewing, code copy and table of contents.

## Verification

Build with Jekyll and run `tests/winter-smoke.cjs`. Review desktop/mobile captures in both themes. The older `tests/smoke.cjs` contains obsolete diagram-era homepage selectors; do not treat it as the current homepage contract.

Guidance: `.agents/skills/impeccable/reference/polish.md` and `reference/craft-floor.md`. The user's pinned landscape and pixel-font choices remain the visual authority.
