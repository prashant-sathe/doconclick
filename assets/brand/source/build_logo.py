# Builds the DocOnClick logo SVGs (assets/brand/svg). The wordmark is outlined
# to paths, so no font is needed wherever the logo is used. Needs fontTools and
# the Plus Jakarta Sans variable font (OFL) — see assets/brand/README.md:
#   python3 assets/brand/source/build_logo.py PlusJakartaSans[wght].ttf assets/brand/svg
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

NAVY, NAVY2, TEAL, GREEN, MINT = "#0f2a5c", "#143a82", "#0e7490", "#16a36b", "#22c58b"

_fonts = {}
def font(wght):
    if wght not in _fonts:
        _fonts[wght] = instantiateVariableFont(TTFont(FONT), {"wght": wght})
    return _fonts[wght]

def text_path(s, size, wght, x=0.0, y=0.0, track=0.0):
    """Outlines `s` with its baseline at y; returns (svg path d, advance width)."""
    f = font(wght)
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    upm = f["head"].unitsPerEm
    k = size / upm
    pen = SVGPathPen(gs)
    cx = x
    for ch in s:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, cx, y)))
        cx += hmtx[g][0] * k + track * size
    return pen.getCommands(), cx - x - track * size

GRAD = f'''<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{NAVY2}"/><stop offset=".6" stop-color="{TEAL}"/><stop offset="1" stop-color="{GREEN}"/></linearGradient>
<linearGradient id="pn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{NAVY2}"/><stop offset="1" stop-color="{TEAL}"/></linearGradient>
<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#143a82"/><stop offset=".55" stop-color="#11607e"/><stop offset="1" stop-color="#0f9b72"/></linearGradient>'''

def plus_shape(fill, w=300, lo=102, hi=922, r=112):
    a, b = 512 - w / 2, 512 + w / 2
    return (f'<rect x="{a}" y="{lo}" width="{w}" height="{hi-lo}" rx="{r}" fill="{fill}"/>'
            f'<rect x="{lo}" y="{a}" width="{hi-lo}" height="{w}" rx="{r}" fill="{fill}"/>')

HEART = "M512 812 C 318 690, 196 572, 196 420 C 196 312, 278 236, 374 236 C 434 236, 484 266, 512 312 C 540 266, 590 236, 650 236 C 746 236, 828 312, 828 420 C 828 572, 706 690, 512 812 Z"

# Each mark: (on light bg, on dark/brand bg). Drawn in a 1024 box.
def mark_heart(dark=False):
    heart = f'<g transform="translate(512 512) scale(.42) translate(-512 -524)"><path d="{HEART}" fill="{"#11607e" if dark else "#ffffff"}"/></g>'
    return plus_shape("#ffffff" if dark else "url(#pg)") + heart

MARKS = {"heart-plus": mark_heart}

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{GRAD}</defs>{rect}{body}</svg>'

def o_counter(size, x, base):
    """Outer and inner (counter) bounds of 'O' drawn at x/base, in SVG coords."""
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.pens.boundsPen import BoundsPen
    f = font(800)
    gs, g = f.getGlyphSet(), f.getBestCmap()[ord("O")]
    k = size / f["head"].unitsPerEm
    rec = RecordingPen(); gs[g].draw(rec)
    boxes, cur = [], None
    for op, args in rec.value:
        if op == "moveTo":
            cur = BoundsPen(gs); cur.moveTo(*args)
        elif op in ("closePath", "endPath"):
            cur.closePath(); boxes.append(cur.bounds)
        else:
            getattr(cur, op)(*args)
    to_svg = lambda b: (x + b[0] * k, base - b[3] * k, x + b[2] * k, base - b[1] * k)
    boxes = sorted((to_svg(b) for b in boxes), key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
    return boxes[-1], boxes[0]

def o_plus(size, x, base, fill):
    """A rounded plus floating in the O's counter (Doc⊕nClick)."""
    (ox0, oy0, ox1, oy1), (ix0, iy0, ix1, iy1) = o_counter(size, x, base)
    ring = ix0 - ox0
    cx, cy = (ix0 + ix1) / 2, (iy0 + iy1) / 2
    a = min(ix1 - ix0, iy1 - iy0) / 2 * .64   # arm reach from centre
    t = ring * .78                              # bar thickness
    r = t * .32
    return (f'<rect x="{cx-t/2:.1f}" y="{cy-a:.1f}" width="{t:.1f}" height="{2*a:.1f}" rx="{r:.1f}" fill="{fill}"/>'
            f'<rect x="{cx-a:.1f}" y="{cy-t/2:.1f}" width="{2*a:.1f}" height="{t:.1f}" rx="{r:.1f}" fill="{fill}"/>')

def wordmark(x, base, size, dark=False):
    """'Doc' 'On' 'Click' — the three words told apart by colour."""
    col = "#ffffff" if dark else NAVY
    on = MINT if dark else GREEN
    parts, cx = [], x
    for word, c in (("Doc", col), ("On", on), ("Click", col)):
        d, adv = text_path(word, size, 800, cx, base, track=-0.015)
        parts.append(f'<path d="{d}" fill="{c}"/>')
        if word == "On":
            parts.append(o_plus(size, cx, base, c))
        cx += adv - 0.015 * size
    return "".join(parts), cx - x

def tagline(x, base, size, dark=False, width=None):
    s = "YOUR HEALTH, JUST A CLICK AWAY"
    track = 0.16
    if width:  # stretch tracking so the tagline spans the wordmark exactly
        _, adv = text_path(s, size, 600, track=track)
        track += (width - adv) / (len(s) - 1) / size
    d, adv = text_path(s, size, 600, x, base, track=track)
    return f'<path d="{d}" fill="{"#a7e9cf" if dark else "#3d5a80"}"/>', adv

def lockup_h(mark, dark=False):
    H = 300
    icon = f'<g transform="scale({H/1024})">{mark(dark)}</g>'
    wm, ww = wordmark(H + 60, 178, 190, dark)
    tg, _ = tagline(H + 66, 264, 46, dark, width=ww - 8)
    W = int(H + 60 + ww + 20)
    return svg(W, H, icon + wm + tg)

def lockup_v(mark, dark=False):
    wm, ww = wordmark(0, 0, 150, dark)
    W = int(ww + 80)
    icon_s = 360
    body = f'<g transform="translate({(W-icon_s)/2} 30) scale({icon_s/1024})">{mark(dark)}</g>'
    wm, _ = wordmark(40, icon_s + 190, 150, dark)
    tg, _ = tagline(46, icon_s + 262, 36, dark, width=ww - 12)
    return svg(W, icon_s + 300, body + wm + tg)

def app_icon(mark):
    # Full-bleed square (Android/iOS apply their own mask); mark kept in the
    # adaptive-icon safe zone (inner ~62%).
    return svg(1024, 1024, f'<rect width="1024" height="1024" fill="url(#tile)"/><g transform="translate(512 512) scale(.6) translate(-512 -512)">{mark(True)}</g>')

def favicon(mark):
    return svg(1024, 1024, f'<rect width="1024" height="1024" rx="230" fill="url(#tile)"/><g transform="translate(512 512) scale(.68) translate(-512 -512)">{mark(True)}</g>')

# Native app sources (assets/brand/native -> assets/ for @capacitor/assets).
SPLASH_BG = "#F8FAFC"  # = splashBackground in android colors.xml / Capacitor SplashScreen

def app_icon_background():
    return svg(1024, 1024, '<rect width="1024" height="1024" fill="url(#tile)"/>')

def app_icon_foreground(mark):
    # Android adaptive foreground, same placement as app_icon() so the
    # composed launcher icon matches the store icon.
    return svg(1024, 1024, f'<g transform="translate(512 512) scale(.6) translate(-512 -512)">{mark(True)}</g>')

def notification_icon():
    # Status-bar icon: one flat white silhouette (Android tints it) — the plus
    # with the heart cut out. Kept inside the 20/24 dp live area.
    a, b = 512 - 150, 512 + 150
    plus = (f'<rect x="{a}" y="102" width="300" height="820" rx="112" fill="#fff"/>'
            f'<rect x="102" y="{a}" width="820" height="300" rx="112" fill="#fff"/>')
    heart = f'<g transform="translate(512 512) scale(.42) translate(-512 -524)"><path d="{HEART}" fill="#000"/></g>'
    body = (f'<mask id="m"><g transform="translate(512 512) scale(.9) translate(-512 -512)">{plus}{heart}</g></mask>'
            f'<rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>')
    return svg(1024, 1024, body)

def splash(mark):
    # 2732 square; @capacitor/assets centre-crops it for every screen, so the
    # logo stays inside the middle ~1100 px.
    inner = lockup_v(mark)
    vw, vh = (float(v) for v in inner.split('viewBox="0 0 ')[1].split('"')[0].split())
    w = 1000
    h = w * vh / vw
    body = inner.split("</defs>", 1)[1].rsplit("</svg>", 1)[0]
    return svg(2732, 2732, f'<g transform="translate({(2732-w)/2:.1f} {(2732-h)/2:.1f}) scale({w/vw:.4f})">{body}</g>', bg=SPLASH_BG)

for name, m in MARKS.items():
    d = OUT
    files = {
        "mark.svg": svg(1024, 1024, m(False)),
        "mark-white.svg": svg(1024, 1024, m(True)),
        "logo-horizontal.svg": lockup_h(m),
        "logo-horizontal-dark.svg": lockup_h(m, True),
        "logo-stacked.svg": lockup_v(m),
        "logo-stacked-dark.svg": lockup_v(m, True),
        "app-icon.svg": app_icon(m),
        "favicon.svg": favicon(m),
        "native/icon-background.svg": app_icon_background(),
        "native/icon-foreground.svg": app_icon_foreground(m),
        "native/notification.svg": notification_icon(),
        "native/splash.svg": splash(m),
    }
    os.makedirs(os.path.join(d, "native"), exist_ok=True)
    for fn, s in files.items():
        open(os.path.join(d, fn), "w").write(s)
    print("\n".join(sorted(files)))
