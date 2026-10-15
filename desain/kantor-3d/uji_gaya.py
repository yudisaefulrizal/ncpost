import bpy, bmesh, math, os, random, sys
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(OUT, "tex")
os.makedirs(TEX, exist_ok=True)
DENSITY = 32  # piksel tekstur per 1 unit Blender

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def hex2rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def clamp(v):
    return max(0.0, min(1.0, v))


# ---------- tekstur pixel art ----------
def pixel_image(name, size, painter):
    img = bpy.data.images.new(name, size, size, alpha=False)
    px = []
    for y in range(size):
        for x in range(size):
            r, g, b = painter(x, y)
            px += [clamp(r), clamp(g), clamp(b), 1.0]
    img.pixels = px
    img.filepath_raw = os.path.join(TEX, name + ".png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def noise_painter(base, var, seed):
    rnd = random.Random(seed)
    grid = {}
    c = hex2rgb(base)

    def p(x, y):
        k = grid.setdefault((x, y), rnd.uniform(-var, var))
        return [ch * (1 + k) for ch in c]
    return p


def plank_painter(base, seed):
    rnd = random.Random(seed)
    c = hex2rgb(base)
    rows = {}

    def p(x, y):
        row = y // 6
        tone = rows.setdefault(row, rnd.uniform(-0.08, 0.08))
        k = tone + rnd.uniform(-0.04, 0.04)
        if y % 6 == 0:
            k -= 0.28
        if (x + row * 11) % 32 == 0:
            k -= 0.22
        return [ch * (1 + k) for ch in c]
    return p


def tile_painter(a, b, seed):
    rnd = random.Random(seed)
    ca, cb = hex2rgb(a), hex2rgb(b)

    def p(x, y):
        c = ca if ((x // 8) + (y // 8)) % 2 == 0 else cb
        k = rnd.uniform(-0.05, 0.05)
        if x % 8 == 0 or y % 8 == 0:
            k -= 0.18
        return [ch * (1 + k) for ch in c]
    return p


def brick_painter(base, seed):
    rnd = random.Random(seed)
    c = hex2rgb(base)

    def p(x, y):
        k = rnd.uniform(-0.05, 0.05)
        row = y // 5
        if y % 5 == 0 or (x + (row % 2) * 6) % 12 == 0:
            k -= 0.25
        return [ch * (1 + k) for ch in c]
    return p


# ---------- material ----------
MATS = {}


def material(name, painter=None, color=None, var=0.07, emit=0.0, rough=0.85, size=32):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    img = pixel_image(name, size, painter or noise_painter(color, var, hash(name) % 9999))
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if emit:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emit
    MATS[name] = m
    return m


# ---------- balok dengan UV skala dunia ----------
def box(name, size, loc, mat, rot=(0, 0, 0), group=None, parts=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u_i, v_i = [(1, 2), (0, 2), (0, 1)][ax]
        for l in f.loops:
            co = l.vert.co + Vector(loc)
            l[uv].uv = (co[u_i] * DENSITY / 32, co[v_i] * DENSITY / 32)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    me.materials.append(mat)
    if group:
        vg = ob.vertex_groups.new(name=group)
        vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    if parts is not None:
        parts.append(ob)
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


# ---------- palet ----------
M = {
    "skin": material("kulit", color="#F2C29B", var=0.03),
    "hair": material("rambut", color="#2A1F1A", var=0.12),
    "shirt": material("baju", color="#3D7BE0", var=0.06),
    "pants": material("celana", color="#2B3550", var=0.06),
    "shoe": material("sepatu", color="#E9EEF8", var=0.04),
    "eye": material("mata", color="#1A1420", var=0.0),
    "white": material("putih", color="#FFFFFF", var=0.0),
    "blush": material("pipi", color="#F28B8B", var=0.0),
    "wood": material("kayu", painter=plank_painter("#C9955F", 3)),
    "wood_dark": material("kayu_gelap", painter=plank_painter("#8A5E3A", 4)),
    "floor": material("lantai", painter=tile_painter("#D8C3A0", "#C9B08A", 5)),
    "wall": material("dinding", painter=brick_painter("#3A4D88", 6)),
    "wall_top": material("dinding_atas", color="#5C73B8", var=0.04),
    "base": material("alas", color="#232C47", var=0.05),
    "metal": material("logam", color="#3A4256", var=0.05, rough=0.5),
    "screen": material("layar", color="#7FB2FF", var=0.12, emit=2.5),
    "window": material("jendela", color="#FFC870", var=0.08, emit=3.0),
    "chair": material("kursi", color="#2A3350", var=0.06),
    "pot": material("pot", color="#B5653E", var=0.08),
    "leaf": material("daun", color="#4FA35A", var=0.15),
    "leaf_dark": material("daun_gelap", color="#2F7A45", var=0.15),
    "rug": material("karpet", painter=tile_painter("#8A2F3E", "#7A2836", 9)),
    "rug_edge": material("karpet_tepi", color="#E8B64A", var=0.06),
    "card": material("id_card", color="#FFFFFF", var=0.02),
    "lanyard": material("tali", color="#E04A4A", var=0.05),
    "book_r": material("buku_merah", color="#C84B4B", var=0.06),
    "book_b": material("buku_biru", color="#3F6FD0", var=0.06),
    "book_y": material("buku_kuning", color="#E8B64A", var=0.06),
}

# ---------- diorama ----------
box("alas", (3.2, 3.2, 0.36), (0, 0, -0.18), M["base"])
box("lantai", (3.0, 3.0, 0.06), (0, 0, -0.03), M["floor"])
box("dinding_belakang", (3.0, 0.14, 1.7), (0, 1.43, 0.85), M["wall"])
box("dinding_kiri", (0.14, 3.0, 1.7), (-1.43, 0, 0.85), M["wall"])
box("tepi_belakang", (3.04, 0.18, 0.06), (0, 1.43, 1.72), M["wall_top"])
box("tepi_kiri", (0.18, 3.04, 0.06), (-1.43, 0, 1.72), M["wall_top"])
box("jendela", (0.7, 0.04, 0.55), (0.65, 1.355, 1.05), M["window"])
box("bingkai_jendela", (0.06, 0.05, 0.55), (0.65, 1.35, 1.05), M["wall_top"])
box("jendela2", (0.04, 0.6, 0.55), (-1.355, -0.6, 1.05), M["window"])
box("bingkai_jendela2", (0.05, 0.06, 0.55), (-1.35, -0.6, 1.05), M["wall_top"])
box("palang1", (0.7, 0.05, 0.04), (0.65, 1.35, 1.05), M["wall_top"])
box("palang2", (0.05, 0.6, 0.04), (-1.35, -0.6, 1.05), M["wall_top"])

# rak buku terbuka di dinding kiri
RX = -1.2
box("rak_belakang", (0.04, 0.9, 1.15), (RX - 0.14, 0.6, 0.575), M["wood_dark"])
for sy in (0.15, 1.05):
    box(f"rak_sisi{sy}", (0.32, 0.05, 1.15), (RX, sy, 0.575), M["wood_dark"])
for i, z in enumerate((0.03, 0.4, 0.77, 1.14)):
    box(f"rak_papan{i}", (0.32, 0.9, 0.04), (RX, 0.6, z), M["wood"])
rnd = random.Random(7)
for shelf, z in enumerate((0.05, 0.42, 0.79)):
    y = 0.2
    while y < 0.95:
        h = rnd.uniform(0.18, 0.3)
        w = rnd.uniform(0.06, 0.1)
        if rnd.random() < 0.12:
            y += 0.08
            continue
        mat = M[rnd.choice(["book_r", "book_b", "book_y", "leaf", "white"])]
        box(f"buku{shelf}_{y:.2f}", (0.24, w, h), (RX + 0.02, y + w / 2, z + h / 2), mat)
        y += w + 0.01

# papan tulis & jam di dinding belakang
box("papan_bingkai", (0.82, 0.04, 0.56), (-0.45, 1.35, 1.12), M["wood_dark"])
box("papan", (0.74, 0.04, 0.48), (-0.45, 1.335, 1.12), M["white"])
for i, (px_, pz, pw, mat) in enumerate([(-0.65, 1.25, 0.22, "book_b"), (-0.6, 1.16, 0.3, "book_r"), (-0.62, 1.07, 0.26, "book_b"), (-0.28, 1.2, 0.16, "book_y"), (-0.3, 1.02, 0.2, "leaf")]):
    box(f"catatan{i}", (pw, 0.01, 0.035), (px_ + pw / 2 - 0.1, 1.31, pz), M[mat])
box("jam", (0.2, 0.04, 0.2), (0.18, 1.35, 1.42), M["white"])
box("jam_jarum", (0.015, 0.01, 0.07), (0.18, 1.325, 1.45), M["eye"])
box("jam_jarum2", (0.05, 0.01, 0.015), (0.2, 1.325, 1.42), M["eye"])

# karpet
box("karpet_tepi", (1.38, 1.28, 0.01), (0.05, 0.05, 0.005), M["rug_edge"])
box("karpet", (1.3, 1.2, 0.016), (0.05, 0.05, 0.008), M["rug"])

# tanaman rimbun
box("pot", (0.34, 0.34, 0.3), (1.1, 1.05, 0.15), M["pot"])
box("pot_bibir", (0.38, 0.38, 0.06), (1.1, 1.05, 0.3), M["pot"])
box("tanah", (0.3, 0.3, 0.02), (1.1, 1.05, 0.33), M["wood_dark"])
prnd = random.Random(3)
for i in range(16):
    a = prnd.uniform(0, math.tau)
    r = prnd.uniform(0.0, 0.18)
    z = prnd.uniform(0.42, 0.85)
    s_ = prnd.uniform(0.13, 0.2)
    box(f"daun{i}", (s_, s_, s_), (1.1 + math.cos(a) * r, 1.05 + math.sin(a) * r, z), M[prnd.choice(["leaf", "leaf", "leaf_dark"])], rot=(prnd.uniform(-20, 20), prnd.uniform(-20, 20), prnd.uniform(0, 90)))

# meja
DESK_Y = -0.38
box("meja_atas", (1.4, 0.62, 0.07), (0, DESK_Y, 0.6), M["wood"])
for sx in (-0.62, 0.62):
    box(f"kaki_meja{sx}", (0.08, 0.5, 0.56), (sx, DESK_Y, 0.28), M["wood_dark"])
box("laci", (0.4, 0.5, 0.3), (0.45, DESK_Y, 0.4), M["wood_dark"])

# lampu meja
box("lampu_kaki", (0.12, 0.12, 0.02), (-0.55, DESK_Y + 0.1, 0.645), M["metal"])
box("lampu_tiang", (0.03, 0.03, 0.3), (-0.55, DESK_Y + 0.1, 0.8), M["metal"])
box("lampu_kepala", (0.16, 0.12, 0.08), (-0.49, DESK_Y + 0.1, 0.95), M["book_y"], rot=(0, -20, 0))
box("lampu_bohlam", (0.1, 0.08, 0.02), (-0.48, DESK_Y + 0.1, 0.905), M["window"], rot=(0, -20, 0))

# laptop menghadap karakter (+Y)
box("laptop_alas", (0.46, 0.3, 0.03), (-0.05, DESK_Y + 0.06, 0.65), M["metal"])
box("laptop_tutup", (0.46, 0.03, 0.32), (-0.05, DESK_Y - 0.1, 0.8), M["metal"], rot=(-12, 0, 0))
box("laptop_layar", (0.4, 0.01, 0.26), (-0.05, DESK_Y - 0.083, 0.8), M["screen"], rot=(-12, 0, 0))
box("cangkir", (0.1, 0.1, 0.12), (0.45, DESK_Y + 0.05, 0.7), M["white"])

# kursi
CY = 0.32
box("kursi_dudukan", (0.5, 0.48, 0.08), (0, CY, 0.36), M["chair"])
box("kursi_sandaran", (0.5, 0.08, 0.55), (0, CY + 0.26, 0.68), M["chair"])
box("kursi_tiang", (0.07, 0.07, 0.3), (0, CY, 0.17), M["metal"])
box("kursi_kaki", (0.46, 0.46, 0.04), (0, CY, 0.03), M["metal"])

# ---------- karakter chibi ----------
P = []
HX, HY, HZ = 0, CY - 0.02, 1.18  # pusat kepala
# kaki (duduk)
for sx in (-0.1, 0.1):
    box("paha", (0.17, 0.38, 0.16), (sx, CY - 0.12, 0.47), M["pants"], group="root", parts=P)
    box("betis", (0.16, 0.16, 0.34), (sx, CY - 0.3, 0.24), M["pants"], group="root", parts=P)
    box("sepatu", (0.18, 0.24, 0.1), (sx, CY - 0.34, 0.05), M["shoe"], group="root", parts=P)
# badan
box("badan", (0.42, 0.26, 0.4), (0, CY, 0.68), M["shirt"], group="spine", parts=P)
box("kerah", (0.2, 0.04, 0.05), (0, CY - 0.13, 0.86), M["white"], group="spine", parts=P)
for sx in (-0.07, 0.07):
    box("tali", (0.03, 0.02, 0.2), (sx, CY - 0.135, 0.77), M["lanyard"], group="spine", parts=P)
box("id_card", (0.11, 0.02, 0.13), (0, CY - 0.14, 0.62), M["card"], group="spine", parts=P)
box("id_foto", (0.04, 0.01, 0.05), (-0.02, CY - 0.152, 0.635), M["shirt"], group="spine", parts=P)
# kepala
box("kepala", (0.62, 0.56, 0.54), (HX, HY, HZ), M["skin"], group="head", parts=P)
box("rambut_atas", (0.68, 0.62, 0.18), (HX, HY + 0.01, HZ + 0.32), M["hair"], group="head", parts=P)
box("rambut_belakang", (0.68, 0.14, 0.5), (HX, HY + 0.26, HZ + 0.05), M["hair"], group="head", parts=P)
for sx in (-0.33, 0.33):
    box("rambut_samping", (0.08, 0.5, 0.36), (sx, HY + 0.04, HZ + 0.1), M["hair"], group="head", parts=P)
for i, (bx, bh) in enumerate([(-0.22, 0.14), (-0.06, 0.2), (0.1, 0.12), (0.24, 0.17)]):
    box(f"poni{i}", (0.17, 0.06, bh), (HX + bx, HY - 0.28, HZ + 0.25 - bh / 2 + 0.06), M["hair"], group="head", parts=P)
FY = HY - 0.285
for sx in (-0.14, 0.14):
    box("mata", (0.09, 0.02, 0.13), (HX + sx, FY, HZ - 0.03), M["eye"], group="head", parts=P)
    box("kilau", (0.035, 0.02, 0.04), (HX + sx + 0.02, FY - 0.004, HZ + 0.005), M["white"], group="head", parts=P)
    box("pipi", (0.09, 0.02, 0.04), (HX + sx * 1.45, FY, HZ - 0.12), M["blush"], group="head", parts=P)
for sx in (-0.14, 0.14):
    box("alis", (0.1, 0.02, 0.025), (HX + sx, FY, HZ + 0.07), M["hair"], group="head", parts=P)
box("mulut", (0.06, 0.02, 0.025), (HX, FY, HZ - 0.15), M["eye"], group="head", parts=P)
# lengan (menggantung dari bahu, digerakkan tulang)
SH = 0.84
for side, sx in (("L", 0.28), ("R", -0.28)):
    box("lengan", (0.14, 0.15, 0.34), (sx, CY, SH - 0.15), M["shirt"], group=f"arm.{side}", parts=P)
    box("tangan", (0.13, 0.13, 0.1), (sx, CY, SH - 0.37), M["skin"], group=f"arm.{side}", parts=P)

chibi = join(P, "Chibi")

# ---------- rig ----------
arm_data = bpy.data.armatures.new("RigChibi")
rig = bpy.data.objects.new("RigChibi", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
root = eb.new("root"); root.head = (0, CY, 0.0); root.tail = (0, CY, 0.4)
spine = eb.new("spine"); spine.head = (0, CY, 0.48); spine.tail = (0, CY, 0.9); spine.parent = root
head = eb.new("head"); head.head = (0, CY, 0.9); head.tail = (0, CY, 1.5); head.parent = spine
for side, sx in (("L", 0.28), ("R", -0.28)):
    b = eb.new(f"arm.{side}"); b.head = (sx, CY, SH); b.tail = (sx, CY, SH - 0.42); b.parent = spine
# arah rotasi X yang menggerakkan ujung tulang ke depan (-Y)
FWD = {b.name: (-1 if b.z_axis.y > 0 else 1) for b in eb}
bpy.ops.object.mode_set(mode="OBJECT")

chibi.parent = rig
mod = chibi.modifiers.new("Armature", "ARMATURE")
mod.object = rig

for pb in rig.pose.bones:
    pb.rotation_mode = "XYZ"


def key(action_name, frames):
    """frames: {frame: {bone: (rx, ry, rz) derajat 'maju', optional 'z': loc}}"""
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for f, pose in frames.items():
        for pb in rig.pose.bones:
            r = pose.get(pb.name, (0, 0, 0))
            pb.rotation_euler = (math.radians(r[0]) * FWD[pb.name], math.radians(r[1]), math.radians(r[2]))
            pb.location = (0, pose.get("lift", 0) if pb.name == "root" else 0, 0)
            pb.keyframe_insert("rotation_euler", frame=f)
            pb.keyframe_insert("location", frame=f)
    return act


ARMS_TYPE = 72
acts = {
    "diam": key("diam", {
        1: {"spine": (2, 0, 0), "head": (0, 0, 3), "arm.L": (35, 0, 0), "arm.R": (35, 0, 0)},
        25: {"spine": (3, 0, 0), "head": (1, 0, -3), "arm.L": (38, 0, 0), "arm.R": (38, 0, 0)},
        49: {"spine": (2, 0, 0), "head": (0, 0, 3), "arm.L": (35, 0, 0), "arm.R": (35, 0, 0)},
    }),
    "mengetik": key("mengetik", {
        1: {"spine": (5, 0, 0), "head": (2, 0, 0), "arm.L": (ARMS_TYPE, 0, 0), "arm.R": (ARMS_TYPE - 8, 0, 0)},
        4: {"spine": (5, 0, 0), "head": (3, 0, 0), "arm.L": (ARMS_TYPE - 8, 0, 0), "arm.R": (ARMS_TYPE, 0, 0)},
        7: {"spine": (5, 0, 0), "head": (2, 0, 0), "arm.L": (ARMS_TYPE, 0, 0), "arm.R": (ARMS_TYPE - 8, 0, 0)},
    }),
    "selesai": key("selesai", {
        1: {"arm.L": (35, 0, 0), "arm.R": (35, 0, 0)},
        6: {"spine": (-6, 0, 0), "head": (-8, 0, 0), "arm.L": (150, 0, 40), "arm.R": (150, 0, -40)},
        12: {"spine": (-6, 0, 0), "head": (-8, 0, 0), "arm.L": (140, 0, 55), "arm.R": (140, 0, -55)},
        18: {"spine": (-6, 0, 0), "head": (-8, 0, 0), "arm.L": (150, 0, 40), "arm.R": (150, 0, -40)},
        25: {"arm.L": (35, 0, 0), "arm.R": (35, 0, 0)},
    }),
    "gagal": key("gagal", {
        1: {"spine": (6, 0, 0), "head": (11, 0, 0), "arm.L": (60, 0, 25), "arm.R": (60, 0, -25)},
        25: {"spine": (7, 0, 0), "head": (13, 0, 0), "arm.L": (62, 0, 25), "arm.R": (62, 0, -25)},
        49: {"spine": (6, 0, 0), "head": (11, 0, 0), "arm.L": (60, 0, 25), "arm.R": (60, 0, -25)},
    }),
}

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
        ob.rotation_euler = [math.radians(a) for a in rot]
    return ob


light("matahari", "SUN", (3, -3, 6), 2.2, (1.0, 0.93, 0.82), rot=(40, 10, 35))
light("isi", "AREA", (4, -4, 3), 220, (0.62, 0.72, 1.0), rot=(60, 0, 45), size=4)
light("jendela_cahaya", "POINT", (0.65, 1.1, 1.1), 40, (1.0, 0.75, 0.45))
light("cahaya_layar", "POINT", (-0.05, DESK_Y + 0.15, 0.95), 12, (0.5, 0.7, 1.0))

cam_d = bpy.data.cameras.new("Kamera")
cam_d.type = "ORTHO"
cam_d.ortho_scale = 4.6
cam = bpy.data.objects.new("Kamera", cam_d)
bpy.context.collection.objects.link(cam)
cam.rotation_euler = (math.radians(58), 0, math.radians(38))
d = Vector((0, 0, 1))
d.rotate(cam.rotation_euler)
cam.location = Vector((0, 0, 0.55)) + d * 12
scene.camera = cam

# ---------- render ----------
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
if "--cycles" in sys.argv:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.device = "CPU"
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.view_settings.view_transform = "Standard"

for name, frame in (("mengetik", 1), ("diam", 25), ("selesai", 12), ("gagal", 25)):
    rig.animation_data.action = acts[name]
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(OUT, f"render_{name}.png")
    bpy.ops.render.render(write_still=True)

rig.animation_data.action = acts["mengetik"]
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "uji_gaya.glb"),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "uji_gaya.blend"))
print("SELESAI")
