"""Paket animasi untuk rig karyawan (semua karakter memakai nama tulang yang sama).

blender --background --factory-startup --python animasi.py
Hasil: animasi.glb (rig contoh + semua klip animasi), animasi_pratinjau.gif.
Di web, klip dari animasi.glb diputar pada karakter mana pun dari karyawan.glb
karena nama tulangnya sama.
"""
import bpy, math, os, shutil, subprocess
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "karyawan.py")).read()
exec(src[: src.index("# ---------- studio foto per karakter")], globals())
rad = math.radians
FPS = 24
scene.render.fps = FPS

# ---------- pose dalam sumbu dunia (rig berdiri tegak menghadap -Y) ----------
# ("X", -d) mengayun lengan/kaki ke depan; ("X", +d) menunduk untuk spine/head;
# ("Y", -d) lengan kiri keluar, ("Y", +d) lengan kanan keluar; ("Z", d) menoleh.
AX = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}
BONES = ("root", "spine", "head", "arm.L", "arm.R", "leg.L", "leg.R")


def local_quat(pb, rots):
    rw = Matrix.Identity(3)
    for ax, deg in rots:
        rw = Matrix.Rotation(rad(deg), 3, AX[ax]) @ rw
    b = pb.bone.matrix_local.to_3x3()
    return (b.inverted() @ rw @ b).to_quaternion()


def assign(rig, act):
    rig.animation_data_create()
    rig.animation_data.action = act
    try:
        if rig.animation_data.action_slot is None and len(act.slots):
            rig.animation_data.action_slot = act.slots[0]
    except AttributeError:
        pass


def make_action(rig, name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    assign(rig, act)
    for f, pose in frames.items():
        for pb in rig.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = local_quat(pb, pose.get(pb.name, []))
            pb.location = (0, pose.get("lift", 0.0), 0) if pb.name == "root" else (0, 0, 0)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)
    rig.animation_data.action = None
    return act


def merge(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = v if k == "lift" else out.get(k, []) + v
    return out


SIT = {"leg.L": [("X", -90)], "leg.R": [("X", -90)], "lift": 0.09}
LAP = {"arm.L": [("X", -35)], "arm.R": [("X", -35)]}


def sit(p):
    return merge(SIT, p)


def step(phase, carry=False):
    s = math.sin(phase * math.tau)
    p = {
        "leg.L": [("X", -28 * s)], "leg.R": [("X", 28 * s)],
        "spine": [("Z", 3 * s)], "head": [("Z", -2 * s)],
        "lift": abs(math.cos(phase * math.tau)) * 0.035,
    }
    if carry:
        p["arm.L"] = [("Y", 8), ("X", -72 + 2 * s)]
        p["arm.R"] = [("Y", -8), ("X", -72 - 2 * s)]
        p["spine"] += [("X", -3)]
    else:
        p["arm.L"] = [("Y", -5), ("X", 25 * s)]
        p["arm.R"] = [("Y", 5), ("X", -25 * s)]
    return p


def anims(rig):
    A = {}
    A["duduk_diam"] = make_action(rig, "duduk_diam", {
        1: sit({"spine": [("X", 2)], "head": [("Z", 3)], "arm.L": [("X", -35)], "arm.R": [("X", -35)]}),
        25: sit({"spine": [("X", 4)], "head": [("Z", -3), ("X", 2)], "arm.L": [("X", -38)], "arm.R": [("X", -38)]}),
        49: sit({"spine": [("X", 2)], "head": [("Z", 3)], "arm.L": [("X", -35)], "arm.R": [("X", -35)]}),
    })
    A["mengetik"] = make_action(rig, "mengetik", {
        1: sit({"spine": [("X", 5)], "head": [("X", 2)], "arm.L": [("X", -72)], "arm.R": [("X", -64)]}),
        5: sit({"spine": [("X", 5)], "head": [("X", 4)], "arm.L": [("X", -64)], "arm.R": [("X", -72)]}),
        9: sit({"spine": [("X", 5)], "head": [("X", 2)], "arm.L": [("X", -72)], "arm.R": [("X", -64)]}),
    })
    cross = {"arm.L": [("X", -60), ("Z", -35)], "arm.R": [("X", -60), ("Z", 35)]}
    A["menunggu"] = make_action(rig, "menunggu", {
        f: sit(merge(cross, {"head": [("Z", z)], "spine": [("X", 3)]}))
        for f, z in ((1, 0), (13, 22), (25, 0), (37, -22), (49, 0))
    })
    up = lambda o: {"arm.L": [("Y", -o), ("X", -160)], "arm.R": [("Y", o), ("X", -160)],
                    "spine": [("X", -4)], "head": [("X", -8)]}
    A["selesai"] = make_action(rig, "selesai", {
        1: sit(LAP),
        6: merge(sit(up(25)), {"lift": 0.13}),
        12: merge(sit(up(40)), {"lift": 0.09}),
        18: merge(sit(up(25)), {"lift": 0.13}),
        25: sit(LAP),
    })
    head_hold = {"arm.L": [("Y", 18), ("X", -150)], "arm.R": [("Y", -18), ("X", -150)]}
    A["gagal"] = make_action(rig, "gagal", {
        f: sit(merge(head_hold, {"spine": [("X", 8)], "head": [("X", 14), ("Z", z)]}))
        for f, z in ((1, 5), (25, -5), (49, 5))
    })
    A["jalan"] = make_action(rig, "jalan", {f: step((f - 1) / 16) for f in range(1, 18, 2)})
    A["jalan_bawa"] = make_action(rig, "jalan_bawa", {f: step((f - 1) / 16, carry=True) for f in range(1, 18, 2)})
    stand = {"arm.L": [("Y", -5)], "arm.R": [("Y", 5)]}
    A["berdiri_diam"] = make_action(rig, "berdiri_diam", {
        1: merge(stand, {"spine": [("X", 1)]}),
        25: merge(stand, {"spine": [("X", 3)], "head": [("Z", 3)], "lift": -0.008}),
        49: merge(stand, {"spine": [("X", 1)]}),
    })
    lean = {"spine": [("X", 28)], "head": [("X", -10)], "leg.L": [("X", -55)], "leg.R": [("X", -55)],
            "arm.L": [("X", -20)], "arm.R": [("X", -20)], "lift": 0.06}
    A["berdiri"] = make_action(rig, "berdiri", {1: sit(LAP), 8: lean, 16: merge(stand, {})})
    A["duduk"] = make_action(rig, "duduk", {1: merge(stand, {}), 9: lean, 16: sit(LAP)})
    wave = lambda o: {"arm.L": [("Y", -o)], "arm.R": [("Y", 5)], "head": [("Y", 8)]}
    A["melambai"] = make_action(rig, "melambai", {f: wave(o) for f, o in ((1, 140), (7, 165), (13, 140), (19, 165), (25, 140))})
    return A


# ---------- rig utama untuk ekspor ----------
by_id = {s["id"]: s for s in STAFF}
main_rig, main_mesh, _, _ = build(by_id["manajer"])
ACTS = anims(main_rig)
LOOP = {"duduk_diam": 48, "mengetik": 8, "menunggu": 48, "selesai": 24, "gagal": 48, "jalan": 16,
        "jalan_bawa": 16, "berdiri_diam": 48, "melambai": 24}

# ---------- adegan pratinjau ----------
FLOOR = material("lantai_pratinjau", painter=plank_painter("#C9955F", 81))
box("lantai", (12, 6, 0.1), (0.4, 0.2, -0.05), FLOOR)
WOOD, WOOD_D = M["wood"], M["wood_dark"]
M["box"] = material("kardus", color="#C99B62", var=0.1)


def desk_set(cx, cy, with_desk=True):
    box("kursi", (0.5, 0.48, 0.08), (cx, cy + 0.06, 0.36), M["chair"])
    box("sandaran", (0.5, 0.08, 0.55), (cx, cy + 0.3, 0.68), M["chair"])
    box("tiang", (0.07, 0.07, 0.3), (cx, cy + 0.06, 0.17), M["metal"])
    if with_desk:
        box("meja", (1.4, 0.62, 0.07), (cx, cy - 0.7, 0.6), WOOD)
        for sx in (-0.62, 0.62):
            box("kaki_meja", (0.08, 0.5, 0.56), (cx + sx, cy - 0.7, 0.28), WOOD_D)
        box("monitor", (0.6, 0.05, 0.38), (cx, cy - 0.86, 1.0), M["metal"])
        box("layar", (0.54, 0.012, 0.32), (cx, cy - 0.833, 1.0), M["screen"])
        box("tiang_monitor", (0.06, 0.05, 0.2), (cx, cy - 0.88, 0.74), M["metal"])
        box("keyboard", (0.42, 0.14, 0.02), (cx, cy - 0.52, 0.645), M["metal"])


CAST = [  # (id, aksi, x, y, duduk?)
    ("produksi", "mengetik", -3.3, 0.9, True),
    ("shift", "menunggu", -1.1, 0.9, True),
    ("antrean", "selesai", 1.1, 0.9, True),
    ("sekretaris", "gagal", 3.3, 0.9, True),
    ("resepsionis", "melambai", 4.6, -1.0, False),
    ("gvideo", "jalan_bawa", 0.0, -1.0, False),
]
actors = []
TOTAL = 96
for cid, act, x, y, seated in CAST:
    rig, mesh, _, _ = build(by_id[cid])
    rig.location = (x, y, 0)
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    if seated:
        desk_set(x, y)
    rig.animation_data_create()
    track = rig.animation_data.nla_tracks.new()
    strip = track.strips.new(act, 1, ACTS[act])
    try:
        strip.action_slot = ACTS[act].slots[0]
    except (AttributeError, IndexError):
        pass
    strip.repeat = TOTAL / LOOP[act]
    actors.append((cid, act, rig))

# kurir membawa kotak berjalan bolak-balik (gerak objek di action terpisah)
walker = [a for a in actors if a[1] == "jalan_bawa"][0][2]
crate = box("kotak_bawaan", (0.34, 0.28, 0.26), (0, 0, 0), M["box"])
for f, x, ang in ((1, -3.2, -90), (48, 1.8, -90), (49, 1.8, 90), (96, -3.2, 90)):
    walker.location = (x, -1.0, 0)
    walker.rotation_euler = (0, 0, rad(ang))
    walker.keyframe_insert("location", frame=f)
    walker.keyframe_insert("rotation_euler", frame=f)
move_act = walker.animation_data.action
try:
    curves = [fc for layer in move_act.layers for st in layer.strips for bag in st.channelbags for fc in bag.fcurves]
except AttributeError:
    curves = list(move_act.fcurves)
for fc in curves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
scene.frame_set(1)
bpy.context.view_layer.update()
crate.parent = walker
crate.parent_type = "BONE"
crate.parent_bone = "spine"
bpy.context.view_layer.update()
crate.matrix_world = walker.matrix_world @ Matrix.Translation((0, -0.36, 0.5))

# label nama aksi di lantai
for cid, act, rig in actors:
    if rig is walker:
        continue
    cu = bpy.data.curves.new(act, "FONT")
    cu.body = act.replace("_", " ").upper(); cu.size = 0.2; cu.align_x = "CENTER"
    ob = bpy.data.objects.new("lbl_" + act, cu); bpy.context.collection.objects.link(ob)
    ob.location = (rig.location.x, rig.location.y + (-1.25 if act != "melambai" else -0.45), 0.01)
    m = bpy.data.materials.new("lbl"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (1, 0.8, 0.4, 1)
    b.inputs["Emission Color"].default_value = (1, 0.8, 0.4, 1)
    b.inputs["Emission Strength"].default_value = 1.5
    cu.materials.append(m)

# ---------- cahaya & kamera ----------
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.02, 0.05, 1)
for name, kind, loc, energy, color_, rot, size in [
    ("matahari", "SUN", (0, 0, 10), 2.0, (1.0, 0.93, 0.82), (40, 10, 35), None),
    ("isi", "AREA", (6, -6, 5), 900, (0.65, 0.75, 1.0), (60, 0, 45), 8),
]:
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color_
    if size:
        ld.size = size
    ob = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = [rad(a) for a in rot]
cam_d = bpy.data.cameras.new("Kamera"); cam_d.type = "ORTHO"; cam_d.ortho_scale = 8.6
cam = bpy.data.objects.new("Kamera", cam_d); bpy.context.collection.objects.link(cam)
cam.rotation_euler = (rad(60), 0, rad(22))
d = Vector((0, 0, 1)); d.rotate(cam.rotation_euler)
cam.location = Vector((0.6, 0.0, 0.6)) + d * 30
scene.camera = cam
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x, scene.render.resolution_y = 960, 600
main_rig.hide_render = True
main_mesh.hide_render = True
main_rig.location = (0, 0, -50)

frames = os.path.join(HERE, "_frames_animasi")
os.makedirs(frames, exist_ok=True)
for i, f in enumerate(range(1, TOTAL + 1, 2)):
    scene.frame_set(f)
    scene.render.filepath = os.path.join(frames, f"f{i:03d}.png")
    bpy.ops.render.render(write_still=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "12", "-i", os.path.join(frames, "f%03d.png"),
                "-vf", "split[a][b];[a]palettegen[p];[b][p]paletteuse", os.path.join(HERE, "animasi_pratinjau.gif")], check=True)
shutil.rmtree(frames)

# ---------- ekspor: satu rig contoh + semua klip ----------
main_rig.location = (0, 0, 0)
main_rig.hide_render = False
main_mesh.hide_render = False
bpy.ops.object.select_all(action="DESELECT")
main_rig.select_set(True)
main_mesh.select_set(True)
for pb in main_rig.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "animasi.glb"), export_format="GLB", use_selection=True,
                          export_animations=True, export_animation_mode="ACTIONS")
print("SELESAI", sorted(ACTS))
