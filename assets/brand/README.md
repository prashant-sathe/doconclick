# DocOnClick brand assets

The DocOnClick logo: a rounded **plus with a heart** (the mark) and the
**Doc·On·Click** wordmark, with a plus inside the "O" of "On".

These files are the source of truth for marketing images, store listings and
any future in-app or website logo update. The app and website still use the
older logo in `public/` and `assets/icon-*.png` — they are not switched over yet.

## Which file to use

| Need | File |
|---|---|
| Website / app header, receipts, documents (light background) | `png/logo/logo-horizontal-*.png` or `svg/logo-horizontal.svg` |
| Same on navy / dark / photo background | `logo-horizontal-dark` |
| Splash screen, posters, social posts, square layouts | `logo-stacked` / `logo-stacked-dark` |
| Mark only (avatars, watermarks, small spaces) | `png/mark/mark-*.png`, `mark-white-*` on dark |
| App launcher icon, Play Store icon (512) | `png/app-icon/app-icon-*.png` (full-bleed square; the OS rounds it) |
| Browser tab, PWA, Apple touch icon (180) | `png/favicon/` (`favicon.ico` = 16/32/48) |

PNG names end in their width in px (`logo-horizontal-1200.png` = 1200 px wide).
Use the SVGs wherever the tool accepts them — they stay sharp at any size and
need no font (the text is outlined).

## Colours

| Role | Hex |
|---|---|
| Navy (wordmark "Doc"/"Click") | `#0F2A5C` |
| Green (wordmark "On") | `#16A36B` |
| Mint (green on dark backgrounds) | `#22C58B` |
| Tagline on light / on dark | `#3D5A80` / `#A7E9CF` |
| Mark gradient | `#143A82` → `#0E7490` → `#16A36B` |
| App-icon tile gradient | `#143A82` → `#11607E` → `#0F9B72` |

## Typeface

Wordmark: **Plus Jakarta Sans ExtraBold (800)**; tagline: SemiBold (600),
wide letter-spacing. Free under the SIL Open Font License, OK for commercial
use. Use the same family for headlines in marketing material.

## Usage

- Keep clear space around the logo of at least the height of the "O".
- Don't recolour, stretch, rotate or add effects; use the `-dark` versions on
  dark backgrounds instead of placing the light logo there.
- Minimum size: horizontal logo 120 px wide on screen; below that use the mark.

## Regenerating

`source/build_logo.py` draws every SVG; `source/export.ts` renders the PNGs.

```sh
python3 -m venv /tmp/ftenv && /tmp/ftenv/bin/pip install fonttools
curl -sL -o /tmp/PlusJakartaSans.ttf "https://github.com/google/fonts/raw/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf"
/tmp/ftenv/bin/python assets/brand/source/build_logo.py /tmp/PlusJakartaSans.ttf assets/brand/svg
npx tsx assets/brand/source/export.ts
```
