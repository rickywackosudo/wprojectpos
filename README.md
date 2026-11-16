# wprojectpos

Two things live in this repository:

| Path | What it is |
| --- | --- |
| `/` (`index.html`) | **W Project POS**: the order board (paint queue, new order, recap) synced to a Google Sheet through `netlify/functions/api.mjs`. Installable as an app (`manifest.webmanifest`, `sw.js`). |
| `/studio/` | **W.PROJECT studio page**: the public, motion-led brand experience. |

Both are plain HTML, CSS and JavaScript with no build step and no dependencies. Netlify publishes the repository root.

## The studio page (`/studio/`)

```
studio/
  index.html    markup and the brand artwork (logo, CREATE BEYOND LIMITS lettering, paint splashes) as inline SVG
  studio.css    the visual system and every section
  studio.js     palette engine, scroll scenes, exhibition, work detail
  works.json    the portfolio: finished works and contact links (edit this)
  works/        photos referenced from works.json
```

Sections, in scroll order: opening + hero, manifesto (a paper sheet that slides over the hero), the "Art in motion" stripe,
the studio chapters (Craft, Art, Precision, Timeline: a pinned stage whose color, type and graphic change together),
the process (a horizontal track on wide screens), **The Result** (the exhibition), pre-order, footer.

### Adding finished works (the exhibition)

The exhibition is built from real data only. It stays hidden until there is something to show.

1. Put the images in `studio/works/`. WebP is preferred (quality ~85 keeps cartoon lines and neon colors clean at
   about 100 KB per image); JPG and PNG work too. Use lowercase file names without spaces, such as
   `avante-candy-fade.webp`, and keep each file under ~300 KB.
2. Add one entry per work to `studio/works.json`:

```json
{
  "studio": {
    "whatsapp": "0812xxxxxxxx",
    "instagram": "your.handle"
  },
  "works": [
    {
      "title": "Avante Mk.III — Candy Fade",
      "body": "Avante Mk.III",
      "spec": "Candy red to blue fade, gold flakes",
      "image": "works/avante-candy-fade.webp",
      "alt": "Avante Mk.III body painted candy red fading into blue",
      "year": 2026,
      "qty": 1
    }
  ]
}
```

Every field except one of `image` / `body` / `title` is optional; empty fields are simply not shown.
`colors` (a list of hex values such as `["#B3121F", "#1F5FD1"]`) overrides the automatic palette.
`studio.whatsapp` and `studio.instagram` turn on the pre-order buttons; leave them empty to hide them.

**Colors come from the artwork.** For each image the page samples the picture (k-means in OKLab). Colors that cover
the image's edges (cutting mat, table, backdrop) count as background and are left out, and shades of one hue are
grouped, so the palette comes from the body's paint. The leading paint color then sets that work's palette:
red → dark ground with red accents, blue → white or black ground with
blue accents, green → dark ground, yellow → black with a yellow highlight, purple → deep purple with neutrals.
The work's own dominant color is never used as the full background, so the artwork keeps its edges. Text colors
are adjusted to meet WCAG contrast (4.5:1 for body and small text, 3:1 for large type). Scrolling the exhibition and
moving between works in the detail view blends the whole page from one palette to the next.

### Orders from the POS on the same device

On a device where the POS is used, the exhibition also shows that device's **finished** orders (newest first, up to 24)
as "spec renders": a paint chip drawn from the order's paint spec ("Matte black, pink pinstripe" → black with pink
stripes), clearly labelled as a render and not a photo. Only the body type, paint spec, quantity and finish date are read.
**Customer name, phone and address are never read or shown.** These entries exist only in that device's browser storage:
visitors never see them. To publish a work, add a photo to `works.json`.

### Motion, accessibility, performance

- One `requestAnimationFrame` loop that sleeps when nothing moves; everything animated uses `transform`, `opacity` or `clip-path`.
- Palettes are written to the sections and the fixed header only, never to `:root`, so a color blend re-styles a few
  hundred elements instead of the whole page. Hidden studio graphics use `content-visibility: hidden`.
- `prefers-reduced-motion: reduce` gives a still version: no opening curtain, no parallax or marquee, pinned sections
  become normal flow, all text is fully visible.
- Phones get their own composition (logo-led hero, stacked process, tap-friendly menu); short landscape screens have
  their own layout too. The custom cursor and magnetic hover only exist for a mouse or trackpad.
- The POS service worker leaves `/studio/` alone, so the studio page and `works.json` always come fresh from the network.

## The POS app (`/`)

Unchanged by the studio page. See the settings dialog in the app for connecting a Google Sheet, setup links,
installing, and CSV backup.
