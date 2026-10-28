# Research notebook components

## October 28 editorial cleanup

Home keeps one field navigator (the map), removes generic repeated covers and
uses explicit `reading_picks.yml` selections instead of duplicating latest
posts. The featured image remains the existing labelled reconstruction of
original Fuzzing logs; it is not presented as a new screenshot.

Archive filters combine search, one category and ALL selected topics. Topics
are explicit front matter, initially populated for seven reviewed posts only.
Untagged posts remain visible by default. JavaScript-disabled archives show all
entries and retain category links. Reset clears every filter and returns focus
to search.

Optional post fields: `topics` (array), `analysis_info` (label/value entries),
`source_code` (trusted HTTPS URL), `last_modified_at` (actual editorial date).
Never infer unknown environments or use deployment time as a modification date.
`series` and numeric `series_order` enable the ordered list and previous/next
links; Git learning parts 1 and 2 are the initial verified series.

Earlier component notes below describe implementation history; generic covers
remain reusable includes but are no longer rendered on home or post pages.

Category badges use the existing `_data/categories.yml` keys. Render them with
`{% include category-badge.html category=category %}`. Labels and symbols remain
visible without JavaScript; color is not the only category cue.

The home timeline preserves the six newest posts and their original dates.
The orange endpoint marks the newest entry, not an unread or live status.

Use explicit author-selected callouts, not automatic content classification:

```liquid
{% capture note %}
Existing Markdown paragraph, including its links and inline code.
{% endcapture %}
{% include analysis-note.html kind="finding" content=note %}
```

Supported kinds: `finding`, `warning`, `result`. Callouts render on the server
and do not create extra headings in the article's table of contents.
The Fuzzing101 article demonstrates all three with existing text unchanged.

Post covers are decorative conceptual diagrams, not measured execution traces.
The title and summary select fuzzing, web, memory or generic code motifs. The actual date
is displayed only on the full article cover; home previews use compact covers.

The image viewer enhances only unlinked article images. Existing image links
are preserved. Visible images form the gallery, excluding hidden tab panels.
Native dialog provides modal focus and Escape handling; closing restores focus
and document scrolling. Without JavaScript, original images remain unchanged.

The home research map renders category names, counts and links directly from
Jekyll data, including standalone entries. Empty fields remain navigable and
are labelled explicitly. Connections are decorative, not a claim that posts
have semantic relationships. Below 761px, links become a normal grid/list in
data order. No JavaScript or animation is required.

The terminal profile keeps the original biography and GitHub avatar source.
The window marks and whoami prompt are decorative, not a live terminal or
online-status indicator. The existing cursor preference remains available.

The editorial home layout enlarges the conceptual hero diagram and headline.
The featured report uses its existing image, text and metrics; the two side
cards are the newest posts excluding that report, never invented content.
Below 761px the hero and report spread become single-column layouts. Existing
motion preferences, article order and image links remain unchanged.

Ambient motion uses a 7-second hero signal and eight staggered map paths in
an 8-second cycle. Both controls share a persisted preference, independent of
the profile cursor setting. IntersectionObserver and document visibility pause
offscreen/background animations. Reduced-motion and no-JavaScript states keep
the underlying diagrams static. Mobile map links retain their list layout;
the hero signal also runs on mobile. Hover/focus highlights map routes without
requiring animation. Tests simulate the document visibility event explicitly.
