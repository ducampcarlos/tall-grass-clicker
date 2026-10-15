#!/usr/bin/env python3
"""Draws the battle backgrounds: one small pixel-art picture per kind of place, all original, made
from nothing but code (gradients, noise and simple shapes). They are shown scaled up with
`image-rendering: pixelated`. Needs Pillow and numpy: `python3 scripts/gen-scenes.py`.
The horizon is always at 58% of the height, where the creature stands."""
import os
import numpy as np
from PIL import Image

W, H = 160, 96
HZ = int(H * 0.58)
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "assets", "scenes")
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def hexc(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


class Scene:
    def __init__(self, seed):
        self.px = np.zeros((H, W, 3), dtype=np.uint8)
        self.rng = np.random.default_rng(seed)
        self.yy, self.xx = np.mgrid[0:H, 0:W]

    # --- drawing helpers ---
    def gradient(self, y0, y1, top, bottom, steps=7):
        """A vertical gradient in a few dithered bands, like old pixel art."""
        a, b = hexc(top), hexc(bottom)
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1) * (steps - 1)
            lo = int(np.floor(t))
            frac = t - lo
            row_t = lambda k: k / (steps - 1)
            for x in range(W):
                k = lo + (1 if frac > BAYER[y % 4, x % 4] else 0)
                self.px[y, x] = (a + (b - a) * row_t(min(k, steps - 1))).astype(np.uint8)

    def fill(self, mask, color):
        self.px[mask] = hexc(color).astype(np.uint8)

    def rect(self, x0, y0, x1, y1, color):
        self.px[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = hexc(color).astype(np.uint8)

    def ellipse(self, cx, cy, rx, ry, color):
        self.fill(((self.xx - cx) / rx) ** 2 + ((self.yy - cy) / ry) ** 2 <= 1, color)

    def dot(self, x, y, color):
        if 0 <= x < W and 0 <= y < H:
            self.px[y, x] = hexc(color).astype(np.uint8)

    def skyline(self, base, amp, color, rough=0.45, seed_shift=0, below=None):
        """A silhouette of hills or mountains whose top is a random walk; filled down to `below` (or the bottom)."""
        r = np.random.default_rng(self.rng.integers(1 << 30) + seed_shift)
        h = np.cumsum(r.normal(0, rough, W))
        h = (h - np.linspace(h[0], h[-1], W))
        h = h / (np.abs(h).max() + 1e-6) * amp
        top = (base - h).astype(int)
        for x in range(W):
            self.px[top[x]:(below if below else H), x] = hexc(color).astype(np.uint8)
        return top

    def peaks(self, base, n, hmin, hmax, color, snow=None, width=(26, 44)):
        for _ in range(n):
            cx = int(self.rng.integers(-8, W + 8))
            ph = int(self.rng.integers(hmin, hmax))
            pw = int(self.rng.integers(*width))
            for x in range(max(0, cx - pw), min(W, cx + pw)):
                top = base - int(ph * (1 - abs(x - cx) / pw))
                self.px[top:base, x] = hexc(color).astype(np.uint8)
                if snow and base - top > ph * 0.68:
                    self.px[top:top + max(1, int((base - top - ph * 0.68) * 0.9) + 1), x] = hexc(snow).astype(np.uint8)

    def clouds(self, n, color, shade, ymin=4, ymax=None):
        ymax = ymax or HZ - 20
        for _ in range(n):
            cx, cy = int(self.rng.integers(0, W)), int(self.rng.integers(ymin, ymax))
            for i in range(int(self.rng.integers(3, 6))):
                ox, oy = cx + i * 6 - 8, cy + int(self.rng.integers(-2, 3))
                self.ellipse(ox, oy, 7, 4, color)
            self.rect(cx - 12, cy + 2, cx + 18, cy + 5, shade)
            self.ellipse(cx + 3, cy + 1, 14, 3, color)

    def pine(self, x, base, h, color, light=None):
        for i in range(h):
            half = max(1, int((h - i) * 0.38) if i else 0)
            y = base - h + i
            half = int(i * 0.42) + 1
            self.rect(x - half, y, x + half + 1, y + 1, color)
        self.rect(x, base, x + 1, base + 2, "#3a2a1a")
        if light:
            for i in range(0, h, 3):
                self.dot(x - int(i * 0.42), base - h + i, light)

    def round_tree(self, x, base, r, color, trunk="#5a3d22", light=None):
        self.rect(x - 1, base - r, x + 1, base + 1, trunk)
        self.ellipse(x, base - r - 2, r, r - 1, color)
        if light:
            self.ellipse(x - r // 3, base - r - 4, max(1, r // 2), max(1, r // 3), light)

    def speckle(self, y0, y1, colors, n):
        for _ in range(n):
            self.dot(int(self.rng.integers(0, W)), int(self.rng.integers(y0, y1)), colors[int(self.rng.integers(len(colors)))])

    def stars(self, n, y1, colors=("#ffffff", "#bcd0ff", "#ffe9a8")):
        for _ in range(n):
            self.dot(int(self.rng.integers(0, W)), int(self.rng.integers(0, y1)), colors[int(self.rng.integers(len(colors)))])

    def vignette(self, strength=0.22):
        d = np.sqrt(((self.xx - W / 2) / (W / 2)) ** 2 + ((self.yy - H / 2) / (H / 2)) ** 2)
        k = 1 - np.clip((d - 0.55), 0, 1) * strength
        self.px = (self.px * k[..., None]).astype(np.uint8)

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        Image.fromarray(self.px).save(os.path.join(OUT, name + ".png"), optimize=True)


def ground(s, top, bottom, speck=None, y0=HZ, n=140):
    s.gradient(y0, H, top, bottom, steps=5)
    if speck:
        s.speckle(y0 + 2, H, speck, n)


def meadow():
    s = Scene(1)
    s.gradient(0, HZ, "#6fbfff", "#d6f1ff")
    s.clouds(4, "#ffffff", "#e3f2fc")
    s.skyline(HZ - 4, 10, "#8fc7b0", seed_shift=1, below=HZ + 1)
    s.skyline(HZ - 1, 6, "#6fb36f", seed_shift=2, below=HZ + 1)
    for x in (22, 70, 128):
        s.round_tree(x, HZ + 1, 6, "#3f8f4a", light="#5fb35f")
    ground(s, "#6fc060", "#3f8a3c", ["#8fe07a", "#4f9a48", "#fff6a0", "#ff8aa8", "#ffffff"], n=200)
    s.save("meadow")


def forest():
    s = Scene(2)
    s.gradient(0, HZ, "#3f7d6b", "#9fd0a0")
    for i, (col, hh, step) in enumerate((("#2f6b5a", 30, 11), ("#245447", 38, 9), ("#173b33", 46, 8))):
        for x in range(-4 + i * 3, W + 4, step):
            self_h = hh + int(s.rng.integers(-6, 8))
            s.pine(x + int(s.rng.integers(-2, 3)), HZ - 4 + i * 4, self_h, col, light=None)
    # light shafts
    for x0 in (30, 74, 120):
        for y in range(0, HZ + 6):
            xs = x0 + y // 3
            s.px[y, xs:xs + 6] = (s.px[y, xs:xs + 6] * 0.7 + hexc("#ffffcc") * 0.3).astype(np.uint8)
    ground(s, "#3d7a40", "#1f4a2a", ["#5fa05a", "#2a5a30", "#8f6a3a", "#a6d06a"], n=220)
    s.vignette(0.3)
    s.save("forest")


def cave():
    s = Scene(3)
    s.gradient(0, H, "#1a1626", "#3a3048")
    # back wall noise
    for _ in range(300):
        s.dot(int(s.rng.integers(0, W)), int(s.rng.integers(0, HZ)), ["#2a2438", "#241f32", "#332b44"][int(s.rng.integers(3))])
    for _ in range(14):
        x, ln = int(s.rng.integers(0, W)), int(s.rng.integers(6, 28))
        for i in range(ln):
            half = max(0, (ln - i) // 6)
            s.rect(x - half, i, x + half + 1, i + 1, "#3a3050")
    for _ in range(9):
        x, hh = int(s.rng.integers(0, W)), int(s.rng.integers(8, 22))
        for i in range(hh):
            half = max(0, (hh - i) // 5)
            s.rect(x - half, HZ - i, x + half + 1, HZ - i + 1, "#463a5c")
    for cx, cy, col, glow in ((24, HZ - 6, "#7ff0ff", "#2a5a78"), (118, HZ - 10, "#ff8ae8", "#6a2a68"), (92, HZ - 3, "#8affc0", "#2a6a50"), (146, HZ - 4, "#7ff0ff", "#2a5a78")):
        s.ellipse(cx, cy, 6, 5, glow)
        for i in range(5):
            s.rect(cx - 1, cy - i * 2, cx + 1, cy - i * 2 + 2, col)
        s.dot(cx - 2, cy - 4, col)
        s.dot(cx + 2, cy - 2, col)
    ground(s, "#5a4a46", "#2e2630", ["#6e5c56", "#3a2e34", "#7a6a64"], n=200)
    s.vignette(0.4)
    s.save("cave")


def lake():
    s = Scene(4)
    s.gradient(0, HZ - 14, "#5cb0ff", "#cfeeff")
    s.clouds(3, "#ffffff", "#e0f0fa", ymax=HZ - 30)
    s.peaks(HZ - 14, 4, 18, 34, "#7d9fc0", snow="#eef6ff")
    s.skyline(HZ - 14, 4, "#4f8f6f", seed_shift=3, below=HZ - 13)
    # water
    s.gradient(HZ - 14, HZ + 8, "#3f95d8", "#2a6fb8", steps=5)
    for _ in range(46):
        x, y = int(s.rng.integers(0, W)), int(s.rng.integers(HZ - 12, HZ + 8))
        s.rect(x, y, x + int(s.rng.integers(3, 8)), y + 1, "#a8dcff")
    # sandy shore
    for x in range(W):
        top = HZ + 6 + int(2 * np.sin(x / 9.0))
        s.px[top:, x] = hexc("#e8d08a").astype(np.uint8)
    s.gradient(HZ + 9, H, "#e8d08a", "#c4a864", steps=4)
    s.speckle(HZ + 9, H, ["#fff0b8", "#b89a58", "#d8c07a"], 90)
    s.save("lake")


def hills():
    s = Scene(5)
    s.gradient(0, HZ, "#86bdf0", "#eaf4ff")
    s.clouds(3, "#ffffff", "#e6f0fa", ymax=30)
    s.peaks(HZ - 6, 5, 28, 50, "#8a8f9f", snow="#ffffff", width=(30, 52))
    s.peaks(HZ, 4, 16, 30, "#6f7a68", width=(30, 50))
    s.skyline(HZ, 5, "#5f8a4f", seed_shift=4, below=HZ + 1)
    ground(s, "#7f9a58", "#546a3a", ["#9ab568", "#6a7e48", "#a79a86", "#8a8478"], n=170)
    for x, y, r in ((28, HZ + 12, 5), (112, HZ + 18, 7), (148, HZ + 8, 4)):
        s.ellipse(x, y, r, r - 1, "#8c8c92")
        s.ellipse(x - 1, y - 1, r - 2, max(1, r - 3), "#a6a6ac")
    s.save("hills")


def gym():
    s = Scene(6)
    s.gradient(0, HZ, "#24304f", "#3b4b78")
    # wall panels + banners
    for x in range(0, W, 20):
        s.rect(x, 0, x + 1, HZ, "#1c2540")
    for cx, col in ((30, "#d8504a"), (80, "#f0c040"), (130, "#d8504a")):
        s.rect(cx - 8, 6, cx + 8, 38, col)
        for i in range(8):
            s.rect(cx - 8 + i, 38 + i // 2, cx + 8 - i, 39 + i // 2, col)
        s.ellipse(cx, 20, 5, 5, "#fff6d0")
        s.ellipse(cx, 20, 2, 2, col)
    # spotlight cones
    for x0 in (20, 80, 140):
        for y in range(0, HZ):
            half = 2 + y // 4
            seg = s.px[y, max(0, x0 - half):x0 + half].astype(float)
            s.px[y, max(0, x0 - half):x0 + half] = np.clip(seg * 0.85 + 40, 0, 255).astype(np.uint8)
    # floor: checker in perspective
    for y in range(HZ, H):
        t = (y - HZ) / (H - HZ)
        size = int(6 + t * 12)
        for x in range(W):
            tile = ((x // size) + ((y - HZ) // max(2, size // 2))) % 2
            s.px[y, x] = hexc("#8a96b8" if tile else "#6b7799").astype(np.uint8)
    s.rect(0, HZ, W, HZ + 1, "#1c2540")
    s.vignette(0.3)
    s.save("gym")


def swamp():
    s = Scene(7)
    s.gradient(0, HZ, "#6a7a52", "#b8c07a")
    for x in range(0, W, 6):
        s.dot(x + int(s.rng.integers(0, 4)), int(s.rng.integers(0, HZ)), "#8a9a62")
    for x, h in ((14, 34), (60, 42), (104, 30), (146, 38)):
        s.rect(x, HZ - h, x + 2, HZ + 2, "#2f2a22")
        for i in range(3):
            d = (-1 if i % 2 else 1)
            for k in range(8):
                s.dot(x + 1 + d * k, HZ - h + 6 + i * 6 - k // 2, "#2f2a22")
        for k in range(10):
            s.dot(x - 3 + k, HZ - h + 3 + (k % 3), "#4a6a3a")
    # fog bands
    for y0 in (HZ - 14, HZ - 4):
        for y in range(y0, y0 + 6):
            s.px[y] = (s.px[y] * 0.55 + hexc("#c8d09a") * 0.45).astype(np.uint8)
    ground(s, "#4a5a34", "#2a3a22", ["#5f7a42", "#35452a", "#6a5a3a"], n=160)
    for cx, cy, rx in ((40, HZ + 14, 18), (116, HZ + 20, 24)):
        s.ellipse(cx, cy, rx, 4, "#3a5a48")
        s.ellipse(cx - 2, cy - 1, rx - 5, 2, "#4f7a5f")
        for _ in range(3):
            s.dot(cx + int(s.rng.integers(-rx // 2, rx // 2)), cy + int(s.rng.integers(-1, 2)), "#a8d8b0")
    s.vignette(0.3)
    s.save("swamp")


def desert():
    s = Scene(8)
    s.gradient(0, HZ, "#f2a860", "#ffe6a8")
    s.ellipse(112, 34, 13, 13, "#fff3c0")
    s.ellipse(112, 34, 10, 10, "#ffffe0")
    s.skyline(HZ - 2, 8, "#e0a860", rough=0.25, seed_shift=5, below=HZ + 1)
    s.skyline(HZ + 2, 6, "#d8985a", rough=0.2, seed_shift=6, below=HZ + 3)
    for x in (20, 132):
        s.rect(x, HZ - 12, x + 3, HZ + 3, "#4a8a4a")
        s.rect(x - 4, HZ - 8, x - 2, HZ - 3, "#4a8a4a")
        s.rect(x - 4, HZ - 4, x, HZ - 2, "#4a8a4a")
        s.rect(x + 5, HZ - 10, x + 7, HZ - 5, "#4a8a4a")
        s.rect(x + 3, HZ - 6, x + 7, HZ - 4, "#4a8a4a")
    ground(s, "#ecc27a", "#c8905a", ["#f8d890", "#b88050", "#fff0b0"], n=200)
    for k in range(4):
        y = HZ + 6 + k * 8
        for x in range(W):
            if int(3 * np.sin(x / 11.0 + k)) == 1:
                s.dot(x, y, "#f6d68c")
    s.save("desert")


def haunted():
    s = Scene(9)
    s.gradient(0, HZ, "#1b1233", "#5a3a78")
    s.stars(40, HZ - 20)
    s.ellipse(124, 22, 11, 11, "#f2ecd0")
    s.ellipse(120, 19, 9, 9, "#faf6e0")
    # tower
    s.rect(60, 14, 84, HZ + 2, "#1a1224")
    s.rect(56, 10, 88, 16, "#1a1224")
    for i in range(6):
        s.rect(57 + i * 5, 6, 59 + i * 5, 10, "#1a1224")
    s.rect(66, 2, 78, 14, "#1a1224")
    for i in range(7):
        s.rect(66 + i * 2, 1 + (i % 2), 68 + i * 2, 2, "#1a1224")
    for x, y in ((66, 26), (74, 26), (70, 42), (66, 56), (76, 56), (70, 70)):
        s.rect(x, y, x + 3, y + 5, "#ffd86a")
        s.dot(x + 1, y + 2, "#fff8c0")
    # dead trees + gravestones
    for x, h in ((16, 36), (138, 30)):
        s.rect(x, HZ - h, x + 2, HZ + 2, "#120c1a")
        for k in range(9):
            s.dot(x - k, HZ - h + 8 - k // 2, "#120c1a"); s.dot(x + 2 + k, HZ - h + 14 - k // 2, "#120c1a")
    for y in (HZ - 8, HZ - 1):
        for yy in range(y, y + 5):
            s.px[yy] = (s.px[yy] * 0.6 + hexc("#8a6ab0") * 0.4).astype(np.uint8)
    ground(s, "#3a2a50", "#1a1226", ["#4a3a64", "#2a1e3a", "#5a4a74"], n=140)
    for x in (30, 108, 128):
        s.rect(x, HZ + 4, x + 6, HZ + 11, "#6a6080")
        s.ellipse(x + 3, HZ + 4, 3, 2, "#6a6080")
        s.rect(x + 3, HZ + 5, x + 4, HZ + 9, "#4a4060")
    s.vignette(0.35)
    s.save("haunted")


def power():
    s = Scene(10)
    s.gradient(0, HZ, "#7a8294", "#d8d4b0")
    s.clouds(3, "#a8acb8", "#8a90a0", ymax=34)
    for x, y, w, h in ((8, HZ - 24, 26, 26), (116, HZ - 30, 36, 32)):
        s.rect(x, y, x + w, HZ + 2, "#4a5062")
        s.rect(x, y, x + w, y + 3, "#383d4c")
        for yy in range(y + 6, HZ - 2, 6):
            for xx in range(x + 3, x + w - 3, 6):
                s.rect(xx, yy, xx + 3, yy + 3, "#ffe070" if (xx + yy) % 5 else "#2a2e3a")
    # pylons and wires
    for x in (52, 98):
        for i in range(30):
            half = 1 + i // 5
            s.rect(x - half, HZ - 34 + i, x - half + 1, HZ - 33 + i, "#2a2e3a")
            s.rect(x + half, HZ - 34 + i, x + half + 1, HZ - 33 + i, "#2a2e3a")
            if i % 6 == 0:
                s.rect(x - half, HZ - 34 + i, x + half + 1, HZ - 33 + i, "#2a2e3a")
        s.rect(x - 9, HZ - 32, x + 10, HZ - 31, "#2a2e3a")
    for x in range(52, 99):
        s.dot(x, HZ - 31 + int(3 * np.sin((x - 52) / 46 * np.pi)), "#1a1e28")
    # lightning
    bx, by = 76, 2
    for i in range(14):
        s.rect(bx, by, bx + 2, by + 2, "#fff68a")
        bx += int(s.rng.integers(-2, 3)); by += 2
    ground(s, "#7a7e88", "#4a4e5a", ["#8a8e98", "#5a5e6a", "#ffe070"], n=120)
    for x in range(0, W, 16):
        s.rect(x, HZ + 14, x + 8, HZ + 15, "#e6c850")
    s.vignette(0.25)
    s.save("power")


def victory():
    s = Scene(11)
    s.gradient(0, HZ, "#6a3a2a", "#c88a52")
    # rock walls both sides, light in the middle
    s.ellipse(80, HZ - 18, 34, 24, "#ffd9a0")
    s.ellipse(80, HZ - 18, 22, 15, "#fff0cc")
    for side in (0, 1):
        for y in range(0, HZ + 4):
            w = int(34 + 12 * np.sin(y / 7.0 + side * 2) + (HZ - y) * 0.15)
            if side == 0:
                s.px[y, :w] = hexc("#3a261c").astype(np.uint8)
                s.px[y, max(0, w - 3):w] = hexc("#6a4a38").astype(np.uint8)
            else:
                s.px[y, W - w:] = hexc("#3a261c").astype(np.uint8)
                s.px[y, W - w:W - w + 3] = hexc("#6a4a38").astype(np.uint8)
    for _ in range(160):
        s.dot(int(s.rng.integers(0, W)), int(s.rng.integers(0, HZ)), ["#4a3022", "#2a1a12"][int(s.rng.integers(2))])
    ground(s, "#7a5a44", "#3a2a22", ["#8a6a54", "#5a4234", "#a8845e"], n=200)
    for x in range(0, W, 14):  # path stones
        s.rect(x, HZ + 16, x + 9, HZ + 18, "#9a7a62")
    s.vignette(0.35)
    s.save("victory")


def champion():
    s = Scene(12)
    s.gradient(0, HZ, "#1a2250", "#4a5a9a")
    s.stars(18, HZ - 30, ("#ffe9a8", "#ffffff"))
    # pillars
    for x in (14, 52, 108, 146):
        s.rect(x, 6, x + 10, HZ + 2, "#d8d4e8")
        s.rect(x + 7, 6, x + 10, HZ + 2, "#a8a4c0")
        s.rect(x - 2, 4, x + 12, 9, "#ece8f8")
        s.rect(x - 2, HZ - 2, x + 12, HZ + 3, "#ece8f8")
    # arch of light
    for r in range(30, 36):
        for a in np.linspace(np.pi, 2 * np.pi, 140):
            s.dot(int(80 + r * np.cos(a)), int(HZ - 2 + r * 0.9 * np.sin(a)) + 2, "#ffd86a")
    # floor with carpet
    s.gradient(HZ, H, "#d0cce0", "#8a86a8", steps=4)
    for y in range(HZ, H):
        half = 14 + (y - HZ) * 2
        s.rect(80 - half, y, 80 + half, y + 1, "#b8323c" if (y % 4) else "#9a2230")
        s.rect(80 - half, y, 80 - half + 2, y + 1, "#ffd86a")
        s.rect(80 + half - 2, y, 80 + half, y + 1, "#ffd86a")
    s.vignette(0.3)
    s.save("champion")


def tower():
    s = Scene(13)
    s.gradient(0, H, "#10102e", "#6a4a9a")
    s.stars(70, HZ - 10)
    s.ellipse(30, 24, 9, 9, "#e8e4ff")
    s.ellipse(27, 22, 8, 8, "#f6f4ff")
    # tiered tower
    for i, (w, y0, col) in enumerate(((12, 8, "#2a2250"), (18, 22, "#32285e"), (26, 38, "#3a2e6a"), (34, 56, "#44367a"))):
        s.rect(100 - w, y0, 100 + w, HZ + 4, col)
        s.rect(100 - w - 2, y0 - 2, 100 + w + 2, y0 + 1, "#5a4a96")
        for xx in range(100 - w + 4, 100 + w - 3, 8):
            s.rect(xx, y0 + 6, xx + 3, y0 + 11, "#ffe070")
    s.rect(99, 0, 101, 8, "#5a4a96")
    s.ellipse(100, 2, 3, 3, "#ffd86a")
    # cloud floor
    s.gradient(HZ, H, "#d8d0f4", "#8a7ec0", steps=4)
    for _ in range(22):
        s.ellipse(int(s.rng.integers(0, W)), int(s.rng.integers(HZ, H)), int(s.rng.integers(10, 22)), int(s.rng.integers(3, 6)), "#f2eeff")
    s.vignette(0.3)
    s.save("tower")


if __name__ == "__main__":
    for fn in (meadow, forest, cave, lake, hills, gym, swamp, desert, haunted, power, victory, champion, tower):
        fn()
    print("scenes written to", os.path.normpath(OUT))
