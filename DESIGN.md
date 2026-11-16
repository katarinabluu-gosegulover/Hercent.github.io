# Hercent design direction — Beta v1.0

The owner-approved winter preview supersedes the previous homepage direction below. Use sunset / aurora landscapes, warm paper / deep blue reading surfaces, NeoDunggeunmo Code for Korean and English display text, and sans serif for long prose. Homepage sequence: landscape, real featured analysis, newest-first notes with author/topic sidebar. All article links and metadata come from Jekyll data. Background artwork is generated, not a photograph of an identified location. A subtle sky-light animation is optional; no video or moving landscape is implied.

Run `tests/winter-smoke.cjs` for this release. `tests/smoke.cjs` retains the previous diagram-era regression suite and includes obsolete homepage selectors.

## Previous Direction (Historical)

### Beta v1.0 polish

Desktop uses separate 1774x887 sunset/night WebP scenes (native generated resolution, not claimed as 4K). Mobile keeps the original portrait composition via `landscape.webp`. Do not reuse the half-width mobile image for desktop. Preserve opacity crossfades except when reduced motion is requested. Motion controls animate sky illumination and the scroll invitation; they do not play a landscape video. Keep native wheel/touch scrolling; only the explicit scroll link requests smooth navigation. English Motion/Cursor controls remain separate. Archive filter labels sit above 44px controls on a shared baseline; wrap to stacked groups on mobile.

This is a reading-first security study archive, not a simulated security dashboard. The homepage should help visitors find real notes and understand the author's approach before it shows decorative interface details.

## Keep

- Dark ink background, sharp green and orange accents, Korean body copy, and the existing technical diagram as a restrained illustration of the learning process.
- Actual post dates, categories, working links, reduced-motion support, and the GitHub-linked profile image.
- Real case-study evidence and excerpts from published posts as the main visual material.

## Avoid

- Fake telemetry, decorative coordinates, numbered sections without a sequence, and repeated all-caps labels that do not aid navigation.
- Metric tiles in the hero, heavy hard-offset shadows, and extra frames around content already separated by spacing.
- Decorative motion that obscures reading or ignores reduced-motion preferences.

## Verification

Review the rendered homepage at desktop and mobile widths. Check that the article list and calls to action remain prominent and that the first viewport has a clear reading order. Run the Jekyll build and `tests/smoke.cjs` after changes.

Impeccable project skill: `.agents/skills/impeccable/SKILL.md`. Design guidance is adapted from its `reference/craft-floor.md` and a review of `index.html` and `assets/research.css`.
