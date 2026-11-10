#!/usr/bin/env python3
"""Build the blank card chassis and icon glyphs the form's live card uses.

Every V12 card on the site shares one frame per color. A per-pixel median of the
real cards of one color keeps that frame and drops what changes card to card
(name, HP, photo, text, bar fills). The parts every card prints differently but
in the same place (city pill, icon glyph, bar ends) are cleaned up explicitly.

    python3 _input-form/tools/build_card_assets.py

Reads  index.html and assets/cards-finish-v12/*.webp
Writes input-form/card/chassis-{green,blue,gold}.webp, glyph-{food,drink,both}.png, card.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CARDS = ROOT / "assets" / "cards-finish-v12"
OUT = ROOT / "input-form" / "card"

W, H = 1500, 2100
S = 1056 / 1110
DISC = (1309.3, 170.8)
DISC_R = 40.5
PILL = (147, 139, 253, 200)
PHOTO_INNER = (176, 246, 1324, 996)
TRACK_X0, TRACK_X1 = 293, 1349
TRACK_TOPS = (1714, 1815, 1916)
TRACK_H = 31
COLORS = {"food": "green", "drink": "blue", "special": "gold"}


def site_cards():
    src = (ROOT / "index.html").read_text()
    pat = re.compile(
        r"name: \"([^\"]+)\",\s*city: '[^']*',\s*hp: \d+,(\s*wasta: true,)?\s*vibes: \['(\w+)'\]"
        r"[\s\S]*?image: '(assets/cards-finish-v12/[^']+)'"
    )
    out = []
    for name, wasta, kind, image in pat.findall(src):
        out.append({"name": name, "wasta": bool(wasta), "color": COLORS[kind], "image": ROOT / image})
    return out


def load(path):
    return np.array(Image.open(path).convert("RGB"))


def robust_median(stack):
    """Median per pixel, ignoring near-black ink unless a pixel is ink on most cards."""
    out = np.zeros(stack.shape[1:], np.uint8)
    for y0 in range(0, H, 60):
        blk = stack[:, y0:y0 + 60].astype(np.float32)
        dark = blk.max(axis=3) < 70
        static = dark.mean(axis=0) >= 0.6
        masked = np.where(dark[..., None], np.nan, blk)
        first = np.nanmedian(masked, axis=0)
        allmed = np.median(blk, axis=0)
        first = np.where(np.isnan(first), allmed, first)
        far = np.abs(blk - first[None]).sum(axis=3) > 45
        masked2 = np.where((dark | far)[..., None], np.nan, blk)
        second = np.nanmedian(masked2, axis=0)
        second = np.where(np.isnan(second), first, second)
        res = np.where(static[..., None], allmed, second)
        out[y0:y0 + 60] = np.clip(res + 0.5, 0, 255).astype(np.uint8)
    return out


# Areas where every card prints its own text or pill. Keep only samples that look like bare panel.
LIVE = (
    (262, 128, 1266, 219),
    (300, 1048, 1200, 1126),
    (138, 1208, 1364, 1394),
    (138, 1530, 1364, 1632),
)


def panel_model(chassis, box, pad=14):
    """Quadratic fit of the bare panel in a ring just outside the box."""
    x0, y0, x1, y1 = box
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    yy, xx = np.mgrid[Y0:Y1, X0:X1]
    px = chassis[Y0:Y1, X0:X1].astype(np.float32)
    ring = ~((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1))
    plain = (px.max(axis=2) > 150) & (px[..., 0] - px[..., 1] < 45)
    sel = ring & plain
    med = np.median(px[sel], axis=0)
    sel &= np.abs(px - med).sum(axis=2) < 40
    def basis(x, y):
        u, v = (x - x0) / max(1, x1 - x0), (y - y0) / max(1, y1 - y0)
        return np.stack([np.ones_like(u), u, v, u * u, v * v, u * v], axis=-1)
    A = basis(xx[sel].astype(np.float32), yy[sel].astype(np.float32))
    coef, *_ = np.linalg.lstsq(A, px[sel], rcond=None)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    return basis(gx.astype(np.float32), gy.astype(np.float32)) @ coef


def panel_texture(chassis, shape):
    """Paper grain from the bare strip right of the VIBES heading, mirror-tiled to shape."""
    src = chassis[1146:1198, 420:1300].astype(np.float32)
    grain = src - cv2.GaussianBlur(src, (0, 0), 7)
    tile = np.concatenate([grain, grain[::-1]], axis=0)
    tile = np.concatenate([tile, tile[:, ::-1]], axis=1)
    reps = (shape[0] // tile.shape[0] + 1, shape[1] // tile.shape[1] + 1, 1)
    return np.tile(tile, reps)[: shape[0], : shape[1]]


def clean_header(chassis):
    """The header band carries no paper texture, so extend the clean rows above the text down."""
    x0, y0, x1, y1 = LIVE[0]
    rows = np.median(chassis[124:136, x0:x1].astype(np.float32), axis=0)
    xs = np.linspace(-1, 1, x1 - x0)
    band = np.stack([np.polyval(np.polyfit(xs, rows[:, ch], 4), xs) for ch in range(3)], axis=1)
    # A little grain keeps WebP from flattening the gradient into visible blocks.
    grain = np.random.default_rng(7).normal(0, 1.1, (y1 - y0, x1 - x0, 1))
    chassis[y0:y1, x0:x1] = np.clip(band[None] + grain + 0.5, 0, 255).astype(np.uint8)


def clean_live(chassis, stack):
    n = stack.shape[0]
    clean_header(chassis)
    for box in LIVE[1:]:
        x0, y0, x1, y1 = box
        ref = panel_model(chassis, box)
        fallback = ref + panel_texture(chassis, ref.shape)
        region = stack[:, y0:y1, x0:x1].astype(np.float32)
        ok = np.abs(region - ref[None]).sum(axis=3) < 24
        med = np.nanmedian(np.where(ok[..., None], region, np.nan), axis=0)
        count = ok.sum(axis=0)
        weight = np.clip((count - 2) / max(1.0, 0.35 * n), 0, 1)[..., None]
        med = np.where(np.isnan(med), fallback, med)
        out = weight * med + (1 - weight) * fallback
        chassis[y0:y1, x0:x1] = np.clip(out + 0.5, 0, 255).astype(np.uint8)


def disc_mask(r):
    yy, xx = np.mgrid[0:H, 0:W]
    return (xx - DISC[0]) ** 2 + (yy - DISC[1]) ** 2 <= r * r


def bubble_and_glyph(img):
    inner = disc_mask(DISC_R - 4)
    px = img[inner].astype(np.float32)
    light = px.min(axis=1)
    cut = np.percentile(light, 55)
    bubble = np.median(px[light <= cut], axis=0)
    glyph = np.percentile(px[light > np.percentile(light, 97)], 50, axis=0)
    return bubble, glyph


def clean_tracks(chassis, stack):
    """Bars fill from the left, so each track pixel is the median of the cards whose
    bar stops short of it. The three tracks share the same art, so a pixel that one
    track's bar nearly always covers is borrowed from a sibling track. The far left
    is covered on every card; mirror the right cap there."""
    span = TRACK_X0 + TRACK_X1
    xa, xb = TRACK_X0 - 7, TRACK_X1 + 8
    meds, counts, alls = [], [], []
    for top in TRACK_TOPS:
        y0, y1 = top - 3, top + TRACK_H + 3
        region = stack[:, y0:y1, xa:xb].astype(np.float32)
        dark = region.max(axis=3) < 120
        # a fill's anti-aliased end is not track either
        grown = dark.copy()
        for d in range(1, 5):
            grown[:, :, d:] |= dark[:, :, :-d]
            grown[:, :, :-d] |= dark[:, :, d:]
        meds.append(np.nanmedian(np.where(grown[..., None], np.nan, region), axis=0))
        counts.append((~grown).sum(axis=0))
        alls.append(np.median(region, axis=0))
    counts = np.stack(counts)
    best = counts.argmax(axis=0)
    best_count = counts.max(axis=0)
    for t, top in enumerate(TRACK_TOPS):
        y0, y1 = top - 3, top + TRACK_H + 3
        med = meds[t].copy()
        borrow = counts[t] < 5
        for o in range(len(TRACK_TOPS)):
            take = borrow & (best == o) & (best_count >= 5)
            med[take] = meds[o][take]
        # the track's own black outline is dark on every card
        outline = best_count < 5
        inner = np.zeros_like(outline)
        inner[3 + 4:3 + TRACK_H - 4, TRACK_X0 + 8 - xa:TRACK_X1 - 8 - xa] = True
        med[outline & ~inner] = alls[t][outline & ~inner]
        # inside the track, nothing clean anywhere: carry the nearest clean pixel from the right
        hole = outline & inner
        for row in np.where(hole.any(axis=1))[0]:
            carry = None
            for col in range(med.shape[1] - 1, -1, -1):
                if not hole[row, col]:
                    carry = med[row, col]
                elif carry is not None:
                    med[row, col] = carry
        out = np.clip(np.nan_to_num(med) + 0.5, 0, 255).astype(np.uint8)
        half = (xb - xa) // 2
        thin = np.where(best_count[:, :half].min(axis=0) < 5)[0]
        first = int(thin.max()) + 4 if len(thin) else 0
        for i in range(first):
            out[:, i] = out[:, span - (xa + i) - xa]
        chassis[y0:y1, xa:xb] = out


def inpaint(chassis, box, ref_dx):
    x0, y0, x1, y1 = box
    patch = chassis[y0:y1, x0 + ref_dx:x1 + ref_dx].copy()
    mask = np.zeros((H, W), np.uint8)
    mask[y0:y1, x0:x1] = 255
    smooth = cv2.inpaint(chassis, mask, 6, cv2.INPAINT_TELEA)
    tex = patch.astype(np.float32) - cv2.GaussianBlur(patch, (0, 0), 6).astype(np.float32)
    chassis[y0:y1, x0:x1] = np.clip(smooth[y0:y1, x0:x1].astype(np.float32) + tex, 0, 255).astype(np.uint8)


def paint_disc(chassis, color):
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt((xx - DISC[0]) ** 2 + (yy - DISC[1]) ** 2)
    cover = np.clip(DISC_R - 2.5 - dist, 0, 1)[..., None]
    chassis[:] = np.clip(chassis * (1 - cover) + np.array(color)[None, None] * cover + 0.5, 0, 255).astype(np.uint8)


def glyph_alpha(cards):
    size = 96
    cx, cy = round(DISC[0]), round(DISC[1])
    x0, y0 = cx - size // 2, cy - size // 2
    alphas = []
    for card in cards:
        img = load(card["image"]).astype(np.float32)
        bubble, glyph = bubble_and_glyph(img)
        crop = img[y0:y0 + size, x0:x0 + size]
        diff = glyph - bubble
        a = ((crop - bubble) * diff).sum(axis=2) / max(1.0, float((diff * diff).sum()))
        alphas.append(np.clip(a, 0, 1))
    alpha = np.median(np.stack(alphas), axis=0)
    yy, xx = np.mgrid[0:size, 0:size]
    inside = (xx + x0 - DISC[0]) ** 2 + (yy + y0 - DISC[1]) ** 2 <= (DISC_R - 5) ** 2
    alpha = np.where(inside, alpha, 0)
    alpha = np.where(alpha < 0.08, 0, alpha)
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba), (x0, y0)


def read_stats(img):
    """Food, drink and scene as printed, from where each black bar fill ends."""
    out = []
    for top in TRACK_TOPS:
        row = img[top + 15, TRACK_X0:TRACK_X1 + 1].max(axis=1) < 60
        end = TRACK_X0 + int(np.argmin(row)) if not row.all() else TRACK_X1
        out.append(round(100 * (end - TRACK_X0) / (TRACK_X1 - TRACK_X0)))
    return out


def icon_for(food, drink):
    """Zaid's rule from the compositor: barely any drink is fork + spoon, barely any food is a martini."""
    if drink <= 25 < food:
        return "food"
    if food <= 25 < drink:
        return "drink"
    return "both"


def pill_fill(cards):
    vals = []
    for card in cards:
        img = load(card["image"]).astype(np.float32)
        vals.append(np.median(img[150:158, 200:212].reshape(-1, 3), axis=0))
    return np.median(np.stack(vals), axis=0)


def corner_alpha(cards):
    """Rounded-corner transparency, identical on every finished card."""
    return np.median(np.stack([np.array(Image.open(c["image"]))[..., 3] for c in cards[:9]]), axis=0).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cards = site_cards()
    alpha = corner_alpha(cards)
    meta = {"geometry": {"scale": S, "disc": DISC, "discR": DISC_R}, "colors": {}}
    for color in ("green", "blue", "gold"):
        group = [c for c in cards if c["color"] == color]
        stack = np.stack([load(c["image"]) for c in group])
        cache = Path("/tmp") / f"fnp-median-{color}-{len(group)}.npy"
        if cache.exists():
            chassis = np.load(cache)
        else:
            chassis = robust_median(stack)
            np.save(cache, chassis)
        clean_live(chassis, stack)
        clean_tracks(chassis, stack)
        inpaint(chassis, PILL, 150)
        plain = [c for c in group if not c["wasta"]]
        bubbles, glyphs = zip(*(bubble_and_glyph(load(c["image"]).astype(np.float32)) for c in plain))
        bubble = np.median(np.stack(bubbles), axis=0)
        glyph = np.median(np.stack(glyphs), axis=0)
        paint_disc(chassis, bubble)
        # The photo always covers its window; a flat fill keeps the file small.
        chassis[PHOTO_INNER[1]:PHOTO_INNER[3], PHOTO_INNER[0]:PHOTO_INNER[2]] = (214, 205, 188)
        wasta = [c for c in group if c["wasta"]]
        wasta_bubble = (
            np.median(np.stack([bubble_and_glyph(load(c["image"]).astype(np.float32))[0] for c in wasta]), axis=0)
            if wasta else bubble * 0.22 + np.array([216, 96, 106]) * 0.78
        )
        pill = pill_fill(group)
        rgba = np.dstack([chassis, alpha])
        Image.fromarray(rgba, "RGBA").save(OUT / f"chassis-{color}.webp", quality=94, alpha_quality=100, method=6)
        meta["colors"][color] = {
            "cards": len(group),
            "bubble": [round(v) for v in bubble],
            "wastaBubble": [round(v) for v in wasta_bubble],
            "glyph": [round(v) for v in glyph],
            "cityPill": [round(v) for v in pill],
        }
        print(color, len(group), meta["colors"][color])
    for card in cards:
        card["stats"] = read_stats(load(card["image"]))
        card["icon"] = icon_for(card["stats"][0], card["stats"][1])
    for kind in ("food", "drink", "both"):
        group = [c for c in cards if c["icon"] == kind]
        img, origin = glyph_alpha(group)
        img.save(OUT / f"glyph-{kind}.png", optimize=True)
        meta.setdefault("glyphs", {})[kind] = {"cards": len(group), "x": origin[0], "y": origin[1], "size": img.size[0]}
        print("glyph", kind, len(group))
    (OUT / "card.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    main()
