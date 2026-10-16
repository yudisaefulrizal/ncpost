"""Kantor terisi: semua karyawan di kursinya dengan status contoh + satu kurir di koridor.

blender kantor.blend --background --python isi_kantor.py
(jalankan kantor.py, karyawan.py, animasi.py lebih dulu)
Hasil: render_isi_kantor.png, render_isi_kantor_atas.png, render_isi_kantor_bawah.png, isi_kantor.gif
"""
import bpy, math, os, shutil, subprocess
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath))


def part(name, start=None, end=None):
    s = open(os.path.join(HERE, name)).read()
    a = s.index(start) if start else 0
    b = s.index(end) if end else len(s)
    return s[a:b]


g = globals()
exec(part("uji_gaya.py", None, "# ---------- diorama").replace("bpy.ops.wm.read_factory_settings(use_empty=True)", ""), g)
exec(part("karyawan.py", "rad = math.radians", "# ---------- studio foto per karakter"), g)
exec(part("animasi.py", "FPS = 24", "# ---------- rig utama untuk ekspor"), g)
from mathutils import Matrix  # noqa: E402

TOTAL = 96
by_id = {s["id"]: s for s in STAFF}
ACTS = anims(build(by_id["manajer"])[0])
bpy.data.objects["rig_manajer"].name = "rig_sumber"
LOOP = {"duduk_diam": 48, "mengetik": 8, "menunggu": 48, "selesai": 24, "gagal": 48, "jalan_bawa": 16}

# status contoh
STATUS = {
    "manajer": "duduk_diam", "produksi": "mengetik", "art": "selesai", "shift": "menunggu", "antrean": "mengetik",
    "sekretaris": "gagal", "foto": "menunggu", "audio": "mengetik", "casting": "duduk_diam", "gpanel": "duduk_diam",
    "gvideo": "mengetik", "naskah": "duduk_diam", "visual": "mengetik", "jurnalis": "mengetik", "kunci": "duduk_diam", "admin": "selesai",
    "resepsionis": "duduk_diam", "sosmed": "mengetik",
}
BUBBLE = {  # warna, simbol
    "mengetik": ("#4C8DFF", "..."), "menunggu": ("#F5B451", "zz"), "selesai": ("#2EC4A0", "OK"),
    "gagal": ("#FF6B4A", "!"), "duduk_diam": None,
}
CAM_YAW = 40


def emit_mat(name, hexc, strength=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    c = [((ch + 0.055) / 1.055) ** 2.4 for ch in hex2rgb(hexc)]
    b.inputs["Base Color"].default_value = (*c, 1)
    b.inputs["Emission Color"].default_value = (*c, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


TXT_DARK = emit_mat("teks_gelembung", "#0B1220", 0.0)


def bubble(x, y, z, kind):
    hexc, glyph = BUBBLE[kind]
    ob = box("gelembung", (0.42, 0.05, 0.28), (x, y, z), emit_mat("gel_" + kind, hexc, 1.6), rot=(0, 0, CAM_YAW))
    tail = box("gelembung_ekor", (0.08, 0.05, 0.08), (x, y, z - 0.17), emit_mat("gel_" + kind, hexc, 1.6), rot=(0, 45, CAM_YAW))
    cu = bpy.data.curves.new(glyph, "FONT")
    cu.body = glyph; cu.size = 0.2; cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.extrude = 0.005
    t = bpy.data.objects.new("gelembung_teks", cu); bpy.context.collection.objects.link(t)
    off = Vector((0, -0.035, 0)); off.rotate(Matrix.Rotation(math.radians(CAM_YAW), 3, "Z"))
    t.location = Vector((x, y, z)) + off
    t.rotation_euler = (math.radians(90), 0, math.radians(CAM_YAW))
    cu.materials.append(TXT_DARK)


def play(rig, act):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rig.animation_data_create()
    tr = rig.animation_data.nla_tracks.new()
    st = tr.strips.new(act, 1, ACTS[act])
    st.repeat = TOTAL / LOOP[act]


for s in STAFF:
    if s["id"] == "ggambar":
        continue
    rig, mesh, _, _ = build(s)
    seat = bpy.data.objects["kursi_" + s["id"]]
    rig.location = seat.location
    rig.rotation_euler = seat.rotation_euler
    act = STATUS[s["id"]]
    play(rig, act)
    if BUBBLE.get(act):
        bubble(seat.location.x, seat.location.y, 1.82, act)

# kurir: Staf Gudang Gambar membawa kardus menyusuri koridor menuju Aset
rig, mesh, _, _ = build(by_id["ggambar"])
play(rig, "jalan_bawa")
for f, x in ((1, -6.0), (TOTAL, 4.0)):
    rig.location = (x, -0.25, 0)
    rig.rotation_euler = (0, 0, math.radians(90))
    rig.keyframe_insert("location", frame=f)
    rig.keyframe_insert("rotation_euler", frame=f)
try:
    curves = [fc for l in rig.animation_data.action.layers for st in l.strips for bag in st.channelbags for fc in bag.fcurves]
except AttributeError:
    curves = list(rig.animation_data.action.fcurves)
for fc in curves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
M["box"] = material("kardus_kurir", color="#C99B62", var=0.1)
crate = box("kotak_bawaan", (0.34, 0.28, 0.26), (0, 0, 0), M["box"])
scene.frame_set(1)
bpy.context.view_layer.update()
crate.parent = rig
crate.parent_type = "BONE"
crate.parent_bone = "spine"
bpy.context.view_layer.update()
crate.matrix_world = rig.matrix_world @ Matrix.Translation((0, -0.36, 0.5))

src_rig = bpy.data.objects["rig_sumber"]
for o in [src_rig] + list(src_rig.children):
    o.hide_render = True

# ---------- render ----------
cam = scene.camera
cam_d = cam.data


def shoot(name, target, sc, res, frame=1):
    cam.rotation_euler = (math.radians(55), 0, math.radians(CAM_YAW))
    d = Vector((0, 0, 1)); d.rotate(cam.rotation_euler)
    cam.location = Vector(target) + d * 40
    cam_d.ortho_scale = sc
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.frame_set(frame)
    scene.render.filepath = os.path.join(HERE, name)
    bpy.ops.render.render(write_still=True)


shoot("render_isi_kantor.png", (-0.8, 0.6, 0.5), 27, (1700, 1150), 30)
shoot("render_isi_kantor_atas.png", (0, 4.3, 0.8), 14, (1600, 1000), 30)
shoot("render_isi_kantor_bawah.png", (0, -4.3, 0.8), 14, (1600, 1000), 30)

frames = os.path.join(HERE, "_frames_isi")
os.makedirs(frames, exist_ok=True)
cam.rotation_euler = (math.radians(55), 0, math.radians(CAM_YAW))
d = Vector((0, 0, 1)); d.rotate(cam.rotation_euler)
cam.location = Vector((-0.8, 0.6, 0.5)) + d * 40
cam_d.ortho_scale = 27
scene.render.resolution_x, scene.render.resolution_y = 1100, 745
for i, f in enumerate(range(1, TOTAL + 1, 2)):
    scene.frame_set(f)
    scene.render.filepath = os.path.join(frames, f"f{i:03d}.png")
    bpy.ops.render.render(write_still=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "12", "-i", os.path.join(frames, "f%03d.png"),
                "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", os.path.join(HERE, "isi_kantor.gif")], check=True)
shutil.rmtree(frames)
print("SELESAI")
