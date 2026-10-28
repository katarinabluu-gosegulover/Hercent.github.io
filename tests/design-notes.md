# Research notebook components

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
