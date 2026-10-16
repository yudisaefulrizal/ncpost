"""Diorama kantor NC Post (tanpa karakter): satu lantai, grid 3x3 dengan koridor di baris tengah.

blender --background --factory-startup --python kantor.py
Hasil: kantor.glb, kantor.blend, render_kantor*.png
Titik duduk karyawan diekspor sebagai empty `kursi_<id>`, titik rute kurir sebagai `titik_<nama>`.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "uji_gaya.py")).read()
exec(src[: src.index("# ---------- diorama")], globals())

rad = math.radians

# ---------- material tambahan ----------
M.update({
    "f_konten": material("lantai_konten", painter=plank_painter("#C9955F", 11)),
    "f_aset": material("lantai_aset", painter=tile_painter("#A3ABBC", "#949DB0", 12)),
    "f_rnd": material("lantai_rnd", painter=tile_painter("#E2E9F3", "#CDD8E8", 13)),
    "f_umum": material("lantai_umum", painter=tile_painter("#5E6E90", "#566584", 14)),
    "f_lobi": material("lantai_lobi", painter=tile_painter("#E8E2D4", "#D3CBB9", 15)),
    "grass": material("rumput", color="#5E9F4E", var=0.18),
    "stone": material("batu", painter=tile_painter("#B8B2A6", "#A8A296", 16)),
    "monitor": material("monitor", color="#1F2433", var=0.04, rough=0.5),
    "screen2": material("layar_hijau", color="#7FE0B5", var=0.12, emit=2.2),
    "screen3": material("layar_ungu", color="#B59BFF", var=0.12, emit=2.2),
    "cabinet": material("lemari", color="#8C96AA", var=0.06, rough=0.6),
    "cabinet_d": material("lemari_gelap", color="#4A5268", var=0.06, rough=0.6),
    "box": material("kardus", color="#C99B62", var=0.1),
    "sofa": material("sofa", color="#3B4E8C", var=0.07),
    "sofa_d": material("sofa_gelap", color="#2D3C6E", var=0.07),
    "red": material("merah", color="#C84B4B", var=0.06),
    "carpet": material("karpet_merah", color="#8E2E3C", var=0.06),
    "glass": material("kaca", color="#9FD8FF", var=0.08, emit=0.6, rough=0.2),
    "led_g": material("led_hijau", color="#3DFF8F", var=0.0, emit=6),
    "led_b": material("led_biru", color="#4C8DFF", var=0.0, emit=6),
    "safe": material("brankas", color="#5A6070", var=0.05, rough=0.4),
    "gold": material("emas", color="#E8B64A", var=0.05, rough=0.4),
    "black": material("hitam", color="#16181F", var=0.04),
    "paper": material("kertas", color="#F4F1EA", var=0.03),
    "holo": material("hologram", color="#4C8DFF", var=0.1, emit=4),
    "sign": material("papan_nama", color="#1B2550", var=0.05),
})


def flat(name, color, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    c = hex2rgb(color)
    lin = [((ch + 0.055) / 1.055) ** 2.4 if ch > 0.04045 else ch / 12.92 for ch in c]
    b.inputs["Base Color"].default_value = (*lin, 1)
    b.inputs["Roughness"].default_value = 0.6
    if emit:
        b.inputs["Emission Color"].default_value = (*lin, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


TXT = flat("teks_terang", "#FFE7A8", emit=2.5)
TXT_W = flat("teks_putih", "#F2F5FC", emit=1.5)

# ---------- pengelompokan agar web ringan (satu mesh per area) ----------
GROUPS = {}
CUR = ["lobi"]


def B(name, size, loc, mat, rot=(0, 0, 0)):
    ob = box(name, size, loc, mat, rot=rot)
    GROUPS.setdefault(CUR[0], []).append(ob)
    return ob


def track(ob):
    GROUPS.setdefault(CUR[0], []).append(ob)
    return ob


def P(cx, cy, ang, lx, ly):
    a = rad(ang)
    return (cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a))


def R(name, size, cx, cy, ang, lx, ly, z, mat, rx=0, ry=0):
    x, y = P(cx, cy, ang, lx, ly)
    return B(name, size, (x, y, z), mat, rot=(rx, ry, ang))


def text(body, loc, rot, size, mat, extrude=0.03):
    cu = bpy.data.curves.new(body, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    ob = bpy.data.objects.new("teks_" + body, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = [rad(a) for a in rot]
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return track(ob)


def empty(name, loc, ang=0):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = loc
    e.rotation_euler = (0, 0, rad(ang))
    e.empty_display_size = 0.3
    return e


# ---------- denah: grid 3x3, baris tengah koridor ----------
H_FULL, H_MID, H_LOW = 2.2, 1.0, 0.4
T = 0.2  # tebal dinding
XS = (-10.5, -3.5, 3.5, 10.5)        # batas kolom
YT, YC, YB = (1.25, 7.25), (-1.25, 1.25), (-7.25, -1.25)  # baris atas, koridor, bawah
COLS = [((XS[i] + XS[i + 1]) / 2) for i in range(3)]   # pusat kolom: -7, 0, 7
AREAS = {
    "konten": ((XS[0], XS[1], *YT), "f_konten"),
    "manajer": ((XS[1], XS[2], *YT), "f_manajer"),
    "aset": ((XS[2], XS[3], *YT), "f_aset"),
    "koridor": ((XS[0], XS[3], *YC), "f_koridor"),
    "rnd": ((XS[0], XS[1], *YB), "f_rnd"),
    "lobi": ((XS[1], XS[2], *YB), "f_lobi"),
    "umum": ((XS[2], XS[3], *YB), "f_umum"),
}
M["f_manajer"] = material("lantai_manajer", painter=plank_painter("#8F5E3B", 17))
M["f_koridor"] = material("lantai_koridor", painter=tile_painter("#B9BFCC", "#AEB4C2", 18))
for key_, ((x0, x1, y0, y1), fm) in AREAS.items():
    CUR[0] = key_
    cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    B("alas_" + key_, (w + 0.3, d + 0.3, 0.5), (cx, cy, -0.28), M["base"])
    B("lantai_" + key_, (w, d, 0.06), (cx, cy, -0.03), M[fm])


def wall(axis, c, a0, a1, h, inner, doors=(), windows=()):
    """axis 'x': dinding sejajar sumbu x di y=c; 'y': sejajar sumbu y di x=c."""
    cuts = sorted(doors)
    segs, s = [], a0
    for d0, d1 in cuts:
        segs.append((s, d0, 0, h))
        if h > 1.7:
            segs.append((d0, d1, 1.6, h))
        s = d1
    segs.append((s, a1, 0, h))
    for s0, s1, z0, z1 in segs:
        if s1 - s0 < 0.01:
            continue
        mid, ln, zc, zh = (s0 + s1) / 2, s1 - s0, (z0 + z1) / 2, z1 - z0
        if axis == "x":
            B("dinding", (ln, T, zh), (mid, c, zc), M["wall"])
            if z1 == h:
                B("tepi", (ln + 0.06, T + 0.08, 0.07), (mid, c, h + 0.035), M["wall_top"])
        else:
            B("dinding", (T, ln, zh), (c, mid, zc), M["wall"])
            if z1 == h:
                B("tepi", (T + 0.08, ln + 0.06, 0.07), (c, mid, h + 0.035), M["wall_top"])
    for w0, w1 in windows:
        mid, ln = (w0 + w1) / 2, w1 - w0
        off = c + inner * (T / 2 + 0.01)
        if axis == "x":
            B("jendela", (ln, 0.03, 0.75), (mid, off, 1.3), M["window"])
            B("palang", (0.06, 0.05, 0.75), (mid, off + inner * 0.01, 1.3), M["wall_top"])
            B("palang", (ln, 0.05, 0.06), (mid, off + inner * 0.01, 1.3), M["wall_top"])
            B("ambang", (ln + 0.12, 0.12, 0.06), (mid, off + inner * 0.04, 0.9), M["wall_top"])
        else:
            B("jendela", (0.03, ln, 0.75), (off, mid, 1.3), M["window"])
            B("palang", (0.05, 0.06, 0.75), (off + inner * 0.01, mid, 1.3), M["wall_top"])
            B("palang", (0.05, ln, 0.06), (off + inner * 0.01, mid, 1.3), M["wall_top"])
            B("ambang", (0.12, ln + 0.12, 0.06), (off + inner * 0.04, mid, 0.9), M["wall_top"])


# ---------- perabot ----------
SCREENS = {"blue": M["screen"], "green": M["screen2"], "purple": M["screen3"]}


def plant(x, y, s=1.0, seed=1):
    B("pot", (0.34 * s, 0.34 * s, 0.3 * s), (x, y, 0.15 * s), M["pot"])
    B("pot_bibir", (0.38 * s, 0.38 * s, 0.06 * s), (x, y, 0.3 * s), M["pot"])
    r = random.Random(seed)
    for i in range(12):
        a = r.uniform(0, math.tau)
        d = r.uniform(0, 0.17) * s
        z = r.uniform(0.42, 0.85) * s
        q = r.uniform(0.13, 0.2) * s
        B("daun", (q, q, q), (x + math.cos(a) * d, y + math.sin(a) * d, z), M[r.choice(["leaf", "leaf", "leaf_dark"])],
          rot=(r.uniform(-20, 20), r.uniform(-20, 20), r.uniform(0, 90)))


def monitor(cx, cy, ang, lx, ly, screen="blue", wide=0.6):
    R("monitor_kaki", (0.2, 0.14, 0.02), cx, cy, ang, lx, ly, 0.645, M["monitor"])
    R("monitor_tiang", (0.06, 0.05, 0.2), cx, cy, ang, lx, ly - 0.02, 0.74, M["monitor"])
    R("monitor", (wide, 0.05, 0.38), cx, cy, ang, lx, ly, 1.0, M["monitor"])
    R("layar", (wide - 0.06, 0.012, 0.32), cx, cy, ang, lx, ly + 0.027, 1.0, SCREENS[screen])


def station(eid, cx, cy, ang=0, screens=("blue",), extra=()):
    """Meja kerja; karyawan duduk di (cx, cy) menghadap -Y lokal."""
    R("meja", (1.4, 0.62, 0.07), cx, cy, ang, 0, -0.7, 0.6, M["wood"])
    for sx in (-0.62, 0.62):
        R("kaki_meja", (0.08, 0.5, 0.56), cx, cy, ang, sx, -0.7, 0.28, M["wood_dark"])
    R("laci", (0.4, 0.5, 0.3), cx, cy, ang, 0.42, -0.7, 0.4, M["wood_dark"])
    R("keyboard", (0.42, 0.14, 0.02), cx, cy, ang, 0, -0.52, 0.645, M["monitor"])
    R("mouse", (0.06, 0.09, 0.03), cx, cy, ang, 0.32, -0.52, 0.65, M["monitor"])
    n = len(screens)
    for i, sc in enumerate(screens):
        lx = (i - (n - 1) / 2) * 0.58
        side = n > 1 and i in (0, n - 1)
        monitor(cx, cy, ang, lx, -0.86 + (0.05 if side else 0), screen=sc, wide=0.56 if n > 2 else 0.6)
    R("kursi_dudukan", (0.5, 0.48, 0.08), cx, cy, ang, 0, 0.06, 0.36, M["chair"])
    R("kursi_sandaran", (0.5, 0.08, 0.55), cx, cy, ang, 0, 0.3, 0.68, M["chair"])
    R("kursi_tiang", (0.07, 0.07, 0.3), cx, cy, ang, 0, 0.06, 0.17, M["metal"])
    R("kursi_kaki", (0.46, 0.46, 0.04), cx, cy, ang, 0, 0.06, 0.03, M["metal"])
    for e in extra:
        if e == "cangkir":
            R("cangkir", (0.1, 0.1, 0.12), cx, cy, ang, -0.55, -0.55, 0.7, M["white"])
        elif e == "kertas":
            for i in range(3):
                R("kertas", (0.24, 0.32, 0.012), cx, cy, ang, -0.5 + i * 0.02, -0.72, 0.645 + i * 0.012, M["paper"])
        elif e == "headphone":
            R("headphone", (0.2, 0.06, 0.04), cx, cy, ang, -0.5, -0.6, 0.66, M["black"])
            R("headphone_l", (0.06, 0.08, 0.08), cx, cy, ang, -0.6, -0.6, 0.68, M["red"])
            R("headphone_r", (0.06, 0.08, 0.08), cx, cy, ang, -0.4, -0.6, 0.68, M["red"])
        elif e == "mic":
            R("mic_kaki", (0.12, 0.12, 0.02), cx, cy, ang, -0.5, -0.75, 0.645, M["black"])
            R("mic_tiang", (0.03, 0.03, 0.3), cx, cy, ang, -0.5, -0.75, 0.8, M["metal"])
            R("mic", (0.08, 0.08, 0.14), cx, cy, ang, -0.5, -0.7, 0.98, M["black"])
        elif e == "tablet":
            R("tablet", (0.36, 0.26, 0.02), cx, cy, ang, -0.45, -0.6, 0.645, M["black"], rx=0)
            R("tablet_layar", (0.3, 0.2, 0.005), cx, cy, ang, -0.45, -0.6, 0.657, M["screen3"])
        elif e == "lampu":
            R("lampu_kaki", (0.12, 0.12, 0.02), cx, cy, ang, -0.58, -0.8, 0.645, M["metal"])
            R("lampu_tiang", (0.03, 0.03, 0.3), cx, cy, ang, -0.58, -0.8, 0.8, M["metal"])
            R("lampu_kepala", (0.16, 0.12, 0.08), cx, cy, ang, -0.52, -0.8, 0.95, M["book_y"])
        elif e == "kardus":
            R("kardus", (0.3, 0.3, 0.24), cx, cy, ang, 0.85, -0.2, 0.12, M["box"])
            R("kardus2", (0.26, 0.26, 0.2), cx, cy, ang, 0.85, -0.2, 0.34, M["box"])
    e = empty("kursi_" + eid, (cx, cy, 0), ang)
    return e


def shelf(x, y, ang, w=1.0, h=1.6, seed=1, kind="buku"):
    R("rak_belakang", (w, 0.04, h), x, y, ang, 0, 0.14, h / 2, M["wood_dark"])
    for sx in (-w / 2, w / 2):
        R("rak_sisi", (0.05, 0.32, h), x, y, ang, sx, 0, h / 2, M["wood_dark"])
    levels = [0.03 + i * (h - 0.06) / 3 for i in range(4)]
    for z in levels:
        R("rak_papan", (w, 0.32, 0.04), x, y, ang, 0, 0, z, M["wood"])
    r = random.Random(seed)
    for z in levels[:-1]:
        lx = -w / 2 + 0.06
        while lx < w / 2 - 0.1:
            if kind == "buku":
                bw, bh = r.uniform(0.06, 0.1), r.uniform(0.2, 0.36)
                if r.random() < 0.15:
                    lx += 0.08
                    continue
                R("buku", (bw, 0.24, bh), x, y, ang, lx + bw / 2, 0, z + 0.02 + bh / 2, M[r.choice(["book_r", "book_b", "book_y", "leaf", "white"])])
                lx += bw + 0.01
            else:
                bw = r.uniform(0.22, 0.3)
                bh = r.uniform(0.18, 0.3)
                R("kotak", (bw, 0.26, bh), x, y, ang, lx + bw / 2, 0, z + 0.02 + bh / 2, M[r.choice(["box", "box", "cabinet_d", "red"])])
                lx += bw + 0.04


def cabinet(x, y, ang, n=3):
    R("lemari", (0.5, 0.5, 0.3 * n + 0.05), x, y, ang, 0, 0, (0.3 * n + 0.05) / 2, M["cabinet"])
    for i in range(n):
        R("laci", (0.44, 0.02, 0.24), x, y, ang, 0, -0.255, 0.05 + 0.3 * i + 0.13, M["cabinet_d"])
        R("gagang", (0.14, 0.03, 0.03), x, y, ang, 0, -0.27, 0.05 + 0.3 * i + 0.2, M["metal"])


def board(x, y, ang, w=1.4, title=None):
    R("papan_bingkai", (w, 0.04, 0.8), x, y, ang, 0, 0, 1.35, M["wood_dark"])
    R("papan", (w - 0.08, 0.04, 0.72), x, y, ang, 0, -0.015, 1.35, M["white"])
    r = random.Random(int(x * 10 + y))
    for i in range(5):
        ln = r.uniform(0.2, w * 0.45)
        R("catatan", (ln, 0.01, 0.05), x, y, ang, -w / 2 + 0.12 + ln / 2 + r.choice([0, 0.6]) * (w > 1.2), -0.04, 1.6 - i * 0.12,
          M[r.choice(["book_b", "book_r", "book_y", "leaf"])])


def sign(label, x, y, ang, w=1.6):
    R("papan_nama", (w, 0.06, 0.42), x, y, ang, 0, 0, 1.92, M["sign"])
    R("papan_nama_tepi", (w + 0.08, 0.05, 0.5), x, y, ang, 0, 0.01, 1.92, M["gold"])
    lx, ly = P(x, y, ang, 0, -0.05)
    text(label, (lx, ly, 1.92), (90, 0, ang), 0.26, TXT)



# ---------- dinding ----------
CUR[0] = "struktur"
wall("x", YT[1], XS[0], XS[3], H_FULL, -1, windows=[(-4.9, -3.9), (8.7, 9.9)])
wall("y", XS[0], YB[0], YT[1], H_FULL, +1, windows=[(5.0, 6.2), (-0.5, 0.5), (-6.4, -5.2)])
wall("x", YB[0], XS[0], XS[3], H_LOW, +1, doors=[(-1.0, 1.0)])
wall("y", XS[3], YB[0], YT[1], H_LOW, -1)
for x in (XS[1], XS[2]):
    wall("y", x, YT[0], YT[1], H_MID, +1)
    wall("y", x, YB[0], YB[1], H_MID, +1)
wall("x", YC[1], XS[0], XS[3], H_MID, +1, doors=[(c - 0.8, c + 0.8) for c in COLS])
wall("x", YC[0], XS[0], XS[3], H_MID, -1, doors=[(COLS[0] - 0.8, COLS[0] + 0.8), (-1.1, 1.1), (COLS[2] - 0.8, COLS[2] + 0.8)])


def doorframe(x, y, label, half=0.8):
    for s in (-1, 1):
        B("kusen", (0.14, 0.26, 1.95), (x + s * (half + 0.07), y, 0.975), M["wood_dark"])
    B("kusen_atas", (2 * half + 0.28, 0.26, 0.16), (x, y, 1.87), M["wood_dark"])
    w = max(1.2, 0.17 * len(label) + 0.5)
    B("papan_pintu_tepi", (w + 0.08, 0.05, 0.42), (x, y - 0.15, 2.12), M["gold"])
    B("papan_pintu", (w, 0.06, 0.34), (x, y - 0.17, 2.12), M["sign"])
    text(label, (x, y - 0.205, 2.12), (90, 0, 0), 0.19, TXT)


doorframe(COLS[0], YC[1], "KONTEN")
doorframe(COLS[1], YC[1], "MANAJER")
doorframe(COLS[2], YC[1], "ASET")
doorframe(COLS[0], YC[0], "R&D")
doorframe(COLS[1], YC[0], "LOBI", half=1.1)
doorframe(COLS[2], YC[0], "UMUM")

# --- Departemen Konten (6 orang; manajer di ruangnya sendiri) ---
CUR[0] = "konten"
station("produksi", -9.0, 5.9, screens=("blue", "purple"), extra=("headphone",))
station("art", -6.8, 5.9, screens=("purple",), extra=("tablet",))
station("antrean", -4.6, 5.9, screens=("blue", "green"), extra=("cangkir",))
station("shift", -9.0, 3.5, screens=("green",), extra=("kertas",))
station("sekretaris", -6.8, 3.5, screens=("blue",), extra=("kertas", "lampu"))
shelf(-10.25, 2.4, 90, w=1.2, seed=21)
board(-7.0, 7.13, 0, w=1.8)
station("sosmed", -4.6, 3.5, screens=("purple", "blue"), extra=("cangkir",))
bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.025, location=(-5.12, 2.72, 0.95), rotation=(rad(90), 0, 0))
rl = bpy.context.active_object; rl.data.materials.append(M["window"]); track(rl)
B("ring_tiang", (0.03, 0.03, 0.3), (-5.12, 2.72, 0.75), M["metal"])
plant(-4.0, 1.75, 0.9, seed=4)
B("dispenser", (0.34, 0.34, 0.9), (-10.15, 4.4, 0.45), M["white"])
B("galon", (0.26, 0.26, 0.36), (-10.15, 4.4, 1.08), M["glass"])

# --- Ruang Manajer ---
CUR[0] = "manajer"
station("manajer", 0.0, 5.7, screens=("blue",), extra=("kertas", "cangkir", "lampu"))
B("trofi_alas", (0.14, 0.14, 0.06), (-0.55, 5.0, 0.66), M["wood_dark"])
B("trofi", (0.1, 0.1, 0.22), (-0.55, 5.0, 0.8), M["gold"])
for x in (-2.5, 2.5):
    shelf(x, 6.95, 0, w=1.2, h=1.6, seed=60 + int(x))
board(0.0, 7.13, 0, w=1.6)
B("meja_rapat", (2.2, 1.0, 0.07), (0.0, 2.9, 0.6), M["wood_dark"])
B("kaki_rapat", (0.2, 0.2, 0.56), (-0.8, 2.9, 0.28), M["metal"])
B("kaki_rapat2", (0.2, 0.2, 0.56), (0.8, 2.9, 0.28), M["metal"])
for i, (dx, dy, a) in enumerate([(-0.6, 0.75, 0), (0.6, 0.75, 0), (-0.6, -0.75, 180), (0.6, -0.75, 180)]):
    R("kursi_rapat", (0.46, 0.44, 0.08), dx, 2.9 + dy, a, 0, 0, 0.36, M["chair"])
    R("kursi_rapat_sandaran", (0.46, 0.08, 0.45), dx, 2.9 + dy, a, 0, 0.22, 0.62, M["chair"])
for i in range(3):
    B("dokumen", (0.24, 0.32, 0.012), (-0.4 + i * 0.4, 2.9, 0.645), M["paper"], rot=(0, 0, i * 12 - 10))
plant(-3.0, 2.0, 1.1, seed=61)
plant(3.0, 2.0, 1.1, seed=62)

# --- Departemen Aset ---
CUR[0] = "aset"
station("foto", 5.0, 5.9, screens=("blue",), extra=())
station("audio", 7.0, 5.9, screens=("green",), extra=("headphone", "mic"))
station("casting", 9.0, 5.9, screens=("purple",), extra=("mic",))
station("ggambar", 5.0, 3.5, screens=("blue",), extra=("kardus",))
station("gpanel", 7.0, 3.5, screens=("purple",), extra=())
station("gvideo", 9.0, 3.5, screens=("blue", "blue"), extra=())
for i, x in enumerate((4.3, 5.55, 6.8, 8.05)):
    shelf(x, 6.95, 0, w=1.2, h=1.6, seed=40 + i, kind="kotak" if i % 2 == 0 else "buku")
for a in (0, 120, 240):
    B("tripod", (0.03, 0.03, 0.9), (4.1 + math.cos(rad(a)) * 0.12, 2.1 + math.sin(rad(a)) * 0.12, 0.45), M["black"],
      rot=(math.sin(rad(a)) * -8, math.cos(rad(a)) * 8, 0))
B("kamera", (0.26, 0.16, 0.18), (4.1, 2.1, 0.98), M["black"])
B("lensa", (0.1, 0.14, 0.1), (4.1, 1.96, 0.98), M["monitor"])
for i in range(3):
    B("kardus_tumpuk", (0.4, 0.4, 0.3), (10.0, 2.0 + (i % 2) * 0.05, 0.15 + i * 0.3), M["box"], rot=(0, 0, i * 7))

# --- Departemen R&D ---
CUR[0] = "rnd"
station("naskah", -9.0, -2.6, screens=("green", "blue"), extra=("kertas", "cangkir"))
station("jurnalis", -7.0, -2.6, screens=("blue", "green"), extra=("kertas",))
station("visual", -5.0, -2.6, screens=("purple", "blue", "purple"), extra=("tablet",))
B("meja_lab", (2.2, 0.9, 0.08), (-7.0, -5.4, 0.75), M["white"])
for sx in (-1.0, 1.0):
    B("kaki_lab", (0.08, 0.8, 0.72), (-7.0 + sx, -5.4, 0.37), M["metal"])
for i, (bx, mat, hh) in enumerate([(-0.8, "screen", 0.24), (-0.5, "screen2", 0.18), (-0.2, "screen3", 0.28), (0.3, "screen2", 0.2), (0.6, "screen", 0.16)]):
    B("tabung", (0.1, 0.1, hh), (-7.0 + bx, -5.3, 0.79 + hh / 2), M[mat])
B("mikroskop", (0.14, 0.2, 0.3), (-6.15, -5.55, 0.94), M["black"])
board(-10.38, -4.2, 90, w=1.8)
plant(-10.0, -6.8, 1.0, seed=8)
plant(-4.0, -6.8, 0.9, seed=9)

# --- Lobi ---
CUR[0] = "lobi"
B("karpet_lobi_tepi", (1.55, 4.0, 0.008), (0, -5.3, 0.004), M["gold"])
B("karpet_lobi", (1.4, 3.9, 0.012), (0, -5.3, 0.006), M["carpet"])
B("resepsionis", (2.6, 0.55, 0.95), (0, -3.15, 0.475), M["wood"])
B("resepsionis_atas", (2.7, 0.62, 0.06), (0, -3.15, 0.98), M["gold"])
for s in (-1, 1):
    R("resepsionis_sayap", (0.55, 0.9, 0.95), s * 1.6, -2.85, 0, 0, 0, 0.475, M["wood"])
    R("resepsionis_sayap_atas", (0.62, 0.96, 0.06), s * 1.6, -2.85, 0, 0, 0, 0.98, M["gold"])
text("NC POST", (0, -3.44, 0.55), (90, 0, 0), 0.24, TXT)
monitor(0, -2.4, 0, 0.0, -0.72, screen="blue")
empty("kursi_resepsionis", (0, -2.4, 0), 0)
B("kursi_resepsionis", (0.5, 0.48, 0.08), (0, -2.35, 0.36), M["chair"])
B("kursi_resepsionis_sandaran", (0.5, 0.08, 0.55), (0, -2.1, 0.68), M["chair"])
for (sx, a) in ((-2.75, -90), (2.75, 90)):
    R("sofa", (1.8, 0.62, 0.42), sx, -5.6, a, 0, 0, 0.21, M["sofa"])
    R("sofa_sandaran", (1.8, 0.2, 0.75), sx, -5.6, a, 0, 0.3, 0.375, M["sofa_d"])
    for s_ in (-0.95, 0.95):
        R("sofa_lengan", (0.14, 0.62, 0.55), sx, -5.6, a, s_, 0, 0.275, M["sofa_d"])
B("meja_tamu", (0.5, 0.8, 0.36), (-1.95, -5.6, 0.18), M["wood"])
B("majalah", (0.22, 0.3, 0.02), (-1.95, -5.6, 0.37), M["red"])
plant(-3.0, -1.9, 1.0, seed=31)
plant(3.0, -1.9, 1.0, seed=32)
plant(-3.0, -6.8, 1.1, seed=33)
plant(3.0, -6.8, 1.1, seed=34)
CUR[0] = "lobi"
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.38, depth=0.4, location=(2.6, -3.6, 0.2))
ped = bpy.context.active_object; ped.data.materials.append(M["cabinet_d"]); track(ped)
bpy.ops.mesh.primitive_torus_add(major_radius=0.5, minor_radius=0.025, location=(2.6, -3.6, 0.44))
ring = bpy.context.active_object; ring.data.materials.append(M["holo"]); track(ring)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.55, location=(2.6, -3.6, 1.2))
globe = bpy.context.active_object
wf = globe.modifiers.new("wf", "WIREFRAME"); wf.thickness = 0.035
bpy.ops.object.modifier_apply(modifier="wf")
globe.data.materials.append(M["holo"]); globe.name = "globe"
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.25, location=(2.6, -3.6, 1.2))
core = bpy.context.active_object; core.data.materials.append(M["holo"]); core.name = "globe_inti"
# gerbang depan
CUR[0] = "lobi"
for s in (-1, 1):
    B("tiang_gerbang", (0.16, 0.16, 1.9), (s * 1.15, -7.45, 0.95), M["wood_dark"])
B("papan_gerbang_tepi", (2.5, 0.1, 0.56), (0, -7.47, 2.0), M["gold"])
B("papan_gerbang", (2.4, 0.12, 0.46), (0, -7.5, 2.0), M["sign"])
text("NC POST", (0, -7.57, 2.0), (90, 0, 0), 0.3, TXT)
for i in range(3):
    B("anak_tangga", (2.0, 0.45, 0.08), (0, -7.6 - i * 0.45, -0.08 - i * 0.08), M["stone"])

# --- Departemen Umum ---
CUR[0] = "umum"
station("kunci", 5.2, -2.6, screens=("green",), extra=("lampu",))
station("admin", 8.6, -2.6, screens=("blue",), extra=("kertas", "cangkir"))
cabinet(6.9, -1.65, 0, n=4)
B("brankas", (0.7, 0.6, 0.9), (4.1, -6.6, 0.45), M["safe"])
B("brankas_pintu", (0.03, 0.5, 0.8), (4.465, -6.6, 0.45), M["cabinet_d"])
B("brankas_putar", (0.03, 0.16, 0.16), (4.49, -6.6, 0.55), M["gold"])
B("server", (0.6, 0.7, 1.8), (10.1, -1.85, 0.9), M["black"])
for i in range(8):
    B("led", (0.04, 0.02, 0.04), (9.95 + (i % 3) * 0.1, -2.21, 0.4 + i * 0.18), M["led_g" if i % 3 else "led_b"])
B("meja_kopi", (0.5, 0.9, 0.75), (10.1, -6.4, 0.375), M["wood_dark"])
B("mesin_kopi", (0.3, 0.3, 0.4), (10.1, -6.6, 0.95), M["black"])
B("cangkir_kopi", (0.1, 0.1, 0.1), (10.15, -6.15, 0.8), M["white"])
B("sofa_umum", (1.6, 0.6, 0.4), (7.2, -6.75, 0.2), M["sofa"])
B("sofa_umum_sandaran", (1.6, 0.18, 0.7), (7.2, -7.05, 0.35), M["sofa_d"])
plant(4.1, -4.2, 1.1, seed=12)

# --- Koridor ---
CUR[0] = "koridor"
B("karpet_koridor", (20.4, 0.9, 0.012), (0, 0, 0.006), M["sofa_d"])
B("karpet_koridor_tepi", (20.5, 1.0, 0.008), (0, 0, 0.004), M["gold"])
for x in (-3.5, 3.5):
    B("bangku", (1.2, 0.4, 0.06), (x, 0.85, 0.42), M["wood"])
    for s in (-0.5, 0.5):
        B("kaki_bangku", (0.06, 0.34, 0.4), (x + s, 0.85, 0.2), M["metal"])
board(-10.38, 0.0, 90, w=1.4)
plant(10.0, 0.8, 1.0, seed=71)
plant(10.0, -0.8, 1.0, seed=72)

# ---------- titik rute kurir ----------
ROOM_X = {"konten": COLS[0], "manajer": COLS[1], "aset": COLS[2], "rnd": COLS[0], "lobi": COLS[1], "umum": COLS[2]}
for r, x in ROOM_X.items():
    top = r in ("konten", "manajer", "aset")
    empty(f"titik_{r}_pintu", (x, YC[1] if top else YC[0], 0))
    empty(f"titik_koridor_{r}", (x, 0.35 if top else -0.35, 0))
    empty(f"titik_{r}_dalam", (x + (0.0 if r != "lobi" else 0), 2.2 if top else -2.0 if r != "lobi" else -4.4, 0))
empty("titik_pintu_masuk", (0, -7.5, 0))
empty("titik_koridor_kiri", (-10.0, 0, 0))
empty("titik_koridor_kanan", (10.0, 0, 0))

# ---------- satukan mesh per area ----------
for g, objs in GROUPS.items():
    objs = [o for o in objs if o.name in bpy.data.objects]
    if objs:
        join(objs, "area_" + g)

# ---------- cahaya & kamera ----------
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.012, 0.02, 0.05, 1)
bg.inputs["Strength"].default_value = 1.0


def light(name, kind, loc, energy, color, rot=None, size=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if size and kind == "AREA":
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    if rot:
        ob.rotation_euler = [rad(a) for a in rot]
    return ob


light("matahari", "SUN", (0, 0, 20), 1.6, (1.0, 0.93, 0.82), rot=(38, 8, 30))
light("isi", "AREA", (14, -14, 12), 2500, (0.6, 0.7, 1.0), rot=(55, 0, 45), size=20)
WARM, COOL = (1, 0.85, 0.65), (0.8, 0.9, 1)
for name, loc, col in [("lampu_konten", (-7, 4.3, 2.8), WARM), ("lampu_manajer", (0, 4.3, 2.8), WARM),
                       ("lampu_aset", (7, 4.3, 2.8), WARM), ("lampu_rnd", (-7, -4.3, 2.8), COOL),
                       ("lampu_lobi", (0, -4.3, 2.8), WARM), ("lampu_umum", (7, -4.3, 2.8), WARM),
                       ("lampu_koridor1", (-5, 0, 2.4), WARM), ("lampu_koridor2", (5, 0, 2.4), WARM)]:
    light(name, "POINT", loc, 200, col)
light("cahaya_globe", "POINT", (2.6, -3.6, 1.2), 50, (0.35, 0.55, 1.0))

cam_d = bpy.data.cameras.new("Kamera")
cam_d.type = "ORTHO"
cam = bpy.data.objects.new("Kamera", cam_d)
bpy.context.collection.objects.link(cam)
scene.camera = cam


def shoot(name, target, scale, res=(1600, 1100)):
    cam.rotation_euler = (rad(55), 0, rad(40))
    d = Vector((0, 0, 1)); d.rotate(cam.rotation_euler)
    cam.location = Vector(target) + d * 40
    cam_d.ortho_scale = scale
    cam_d.clip_end = 200
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(HERE, f"render_{name}.png")
    bpy.ops.render.render(write_still=True)


for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
scene.view_settings.view_transform = "Standard"

shoot("kantor", (-0.8, 0.6, 0.5), 27, (1700, 1150))
shoot("kantor_atas", (0, 4.3, 0.8), 14, (1600, 1000))
shoot("kantor_bawah", (0, -4.3, 0.8), 14, (1600, 1000))

bpy.ops.object.select_all(action="DESELECT")
for ob in scene.objects:
    if ob.type in ("MESH", "EMPTY"):
        ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "kantor.glb"), export_format="GLB", use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "kantor.blend"))
print("SELESAI")
