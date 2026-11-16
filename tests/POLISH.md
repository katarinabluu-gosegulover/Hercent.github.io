# Winter polish review

Scope: preserve the owner-approved winter landscape, pixel headings and optional weather motion. Guidance: Impeccable `reference/polish.md` and `reference/craft-floor.md`.

## Findings addressed

- Small search input and mobile article prose: use 16px text; enlarge archive summaries to 15px.
- Small theme and motion controls: 44px targets, visible enabled/disabled state, destination-theme icon and matching browser theme color.
- Bright ice behind hero copy: strengthen the local scrim without dimming the whole panorama.
- Competing sky effects: reduce the CSS illumination amplitude while keeping canvas aurora and snow.
- Stale night intensity after pausing: synchronize the weather theme when the render loop resumes.
- Fragmented Korean headings: keep words together, with an emergency wrap for long unbroken strings.
- Conflicting old design notes: replace the historical document with the current winter contract.

## Verification

Jekyll build, `tests/winter-smoke.cjs`, desktop/mobile screenshot review, and Impeccable manual detector. The detector returned no findings for the scanned HTML/CSS; this is not a complete accessibility certification. The browser suite checks 320/360/390/768/1024/1920px widths, theme icons, fonts, filters, search, reading tools, weather frame changes, reduced motion, persistence and no-JS content.

Screenshots are generated under ignored `test-results/`. Cross-browser Safari/Firefox and physical-device performance remain unverified; browser checks use Edge.
