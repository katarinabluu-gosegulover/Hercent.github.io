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
