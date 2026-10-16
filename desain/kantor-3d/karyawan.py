"""Karakter chibi karyawan NC Post: satu badan dasar + variasi per peran, rig seragam.

blender --background --factory-startup --python karyawan.py
Hasil: karyawan.glb (mesh `karyawan_<id>` + armature `rig_<id>`, semua di titik 0),
       render_karyawan.png (lembar karakter).
Nama tulang sama untuk semua karakter (root, spine, head, arm.L/R, leg.L/R),
sehingga satu set animasi bisa dipakai bersama.
"""
import bpy, math, os, random
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "uji_gaya.py")).read()
exec(src[: src.index("# ---------- diorama")], globals())
rad = math.radians


def col(hexcode, var=0.06):
    return material("c_" + hexcode.lstrip("#"), color=hexcode, var=var)


# ---------- daftar karyawan ----------
# lanyard per departemen
DEPT = {"konten": "#E04A4A", "manajer": "#E8B64A", "aset": "#3FAE5A", "rnd": "#8B5CF6", "umum": "#3F6FD0", "lobi": "#F28C38"}
STAFF = [
    # baris depan
    dict(id="naskah", nama="Peneliti Naskah", dept="rnd", skin="#F2C29B", hair="#2A1F1A", rambut="berantakan", shirt="#7BA3D9", pants="#3A4256", outer="jas_lab", aks=["kacamata", "pena"]),
    dict(id="kunci", nama="Pemegang Kunci", dept="umum", skin="#C98E62", hair="#1B1B1F", rambut="pendek", shirt="#1F2E5A", pants="#1F2E5A", topi="satpam", aks=["kunci", "sabuk"], sleeve="#1F2E5A"),
    dict(id="manajer", nama="Manajer Produksi", dept="manajer", skin="#E8B48A", hair="#1B1B1F", rambut="rapi", shirt="#F4F1EA", pants="#2B2F3A", outer="jas", outer_col="#3A4050", aks=["dasi", "jam"]),
    dict(id="resepsionis", nama="Resepsionis", dept="lobi", skin="#F2C29B", hair="#4A2A1A", rambut="kerudung", kerudung="#C98B86", shirt="#F4F1EA", pants="#2D3C6E", outer="jas", outer_col="#3B5FB0", aks=[], rok=True),
    dict(id="admin", nama="Admin / HRD", dept="umum", skin="#E8B48A", hair="#6B3E1F", rambut="kerudung", kerudung="#8FA9CF", shirt="#E7A0B5", pants="#3A4256", aks=[], rok=True),
    dict(id="jurnalis", nama="Jurnalis", dept="rnd", skin="#E8B48A", hair="#2A1F1A", rambut="rapi", shirt="#F4F1EA", pants="#2B3550", outer="rompi", outer_col="#2F4A6B", aks=["pena", "hp"]),
    dict(id="visual", nama="Peneliti Visual", dept="rnd", skin="#C98E62", hair="#24180F", rambut="jambul", shirt="#2E2E3A", pants="#3A4256", outer="jas_lab", aks=["vr"]),
    # baris tengah
    dict(id="produksi", nama="Tim Produksi", dept="konten", skin="#C98E62", hair="#24180F", rambut="pendek", shirt="#3D7BE0", pants="#2B3550", topi="cap_balik", topi_col="#E04A4A", aks=["headphone_leher"]),
    dict(id="art", nama="Art Director", dept="konten", skin="#F2C29B", hair="#B23A3A", rambut="bob", shirt="#2E2E3A", pants="#2E2E3A", topi="baret", topi_col="#C0392B", aks=["syal_kuning"]),
    dict(id="shift", nama="Penjadwal Shift", dept="konten", skin="#F0C49A", hair="#6B3E1F", rambut="kuncir", shirt="#E0883D", pants="#34405F", aks=["jam"]),
    dict(id="antrean", nama="Koordinator Antrean", dept="konten", skin="#C98E62", hair="#1B1B1F", rambut="keriting", shirt="#2E8F6E", pants="#34405F", aks=["clipboard"]),
    dict(id="sekretaris", nama="Sekretaris Jadwal", dept="konten", skin="#F2C29B", hair="#3A2418", rambut="kerudung", kerudung="#7C67AE", shirt="#B9A6E8", pants="#3A4256", aks=["kacamata"], rok=True),
    dict(id="sosmed", nama="Admin Sosmed", dept="konten", skin="#E8B48A", hair="#24180F", rambut="jambul", shirt="#D94F8A", pants="#2B3550", aks=["hp", "jam"]),
    # baris belakang
    dict(id="foto", nama="Pustakawan Foto", dept="aset", skin="#E8B48A", hair="#1B1B1F", rambut="pendek", shirt="#E9EEF8", pants="#5A4A32", outer="rompi", outer_col="#A68B5B", topi="bucket", topi_col="#7A6A4A", aks=["kamera_leher"]),
    dict(id="audio", nama="Pustakawan Audio", dept="aset", skin="#C98E62", hair="#24180F", rambut="berantakan", shirt="#3A8C5A", pants="#2B3550", aks=["headphone"]),
    dict(id="casting", nama="Casting Director", dept="aset", skin="#F0C49A", hair="#6B3E1F", rambut="jambul", shirt="#F4F1EA", pants="#1B1B1F", outer="jas", outer_col="#1B1B1F", aks=["kacamata_hitam"]),
    dict(id="ggambar", nama="Staf Gudang Gambar", dept="aset", skin="#E8B48A", hair="#1B1B1F", rambut="pendek", shirt="#5B6B8C", pants="#34405F", outer="rompi_safety", topi="kupluk", topi_col="#E0883D", aks=[]),
    dict(id="gpanel", nama="Staf Gudang Panel", dept="aset", skin="#C98E62", hair="#3A2418", rambut="keriting", shirt="#C7882F", pants="#5A4A32", outer="apron", outer_col="#7A5230", aks=[]),
    dict(id="gvideo", nama="Staf Gudang Video", dept="aset", skin="#F2C29B", hair="#1B1B1F", rambut="pendek", shirt="#2D5F8A", pants="#2B3550", topi="cap", topi_col="#2D5F8A", aks=["sabuk"]),
]

HZ = 1.02          # pusat kepala
FY = -0.285        # muka kepala
SH = 0.7           # bahu


def build(s):
    P = []
    skin, hair, shirt, pants = col(s["skin"], 0.03), col(s["hair"], 0.12), col(s["shirt"]), col(s["pants"])
    shoe = col(s.get("shoe", "#E9EEF8"), 0.04)
    sleeve = col(s.get("sleeve") or (s.get("outer_col") if s.get("outer") == "jas" else "#F4F1EA" if s.get("outer") == "jas_lab" else s["shirt"]))
    G = lambda n, size, loc, mat, grp, rot=(0, 0, 0): box(n, size, loc, mat, rot=rot, group=grp, parts=P)

    # kaki & sepatu
    for side, sx in (("L", 0.1), ("R", -0.1)):
        G("kaki", (0.16, 0.17, 0.26), (sx, 0, 0.2), pants, f"leg.{side}")
        G("sepatu", (0.18, 0.24, 0.08), (sx, -0.03, 0.04), shoe, f"leg.{side}")
    # badan
    G("badan", (0.42, 0.26, 0.42), (0, 0, 0.52), shirt, "spine")
    front = -0.13
    if s.get("rok"):
        G("rok", (0.46, 0.3, 0.16), (0, 0, 0.3), pants, "spine")
    outer = s.get("outer")
    if outer == "jas":
        oc = col(s["outer_col"])
        for sx in (-0.15, 0.15):
            G("jas", (0.15, 0.28, 0.43), (sx, 0, 0.52), oc, "spine")
        G("jas_belakang", (0.44, 0.06, 0.43), (0, 0.115, 0.52), oc, "spine")
        G("jas_kerah", (0.06, 0.02, 0.14), (-0.08, -0.145, 0.66), oc, "spine", rot=(0, -20, 0))
        G("jas_kerah", (0.06, 0.02, 0.14), (0.08, -0.145, 0.66), oc, "spine", rot=(0, 20, 0))
        front = -0.14
    elif outer == "jas_lab":
        lab = col("#F4F6FA", 0.03)
        for sx in (-0.14, 0.14):
            G("jas_lab", (0.17, 0.29, 0.62), (sx, 0, 0.44), lab, "spine")
        G("jas_lab_belakang", (0.45, 0.06, 0.62), (0, 0.12, 0.44), lab, "spine")
        G("saku", (0.1, 0.02, 0.06), (0.13, -0.15, 0.6), col("#9FB3D1"), "spine")
        G("pena_saku", (0.02, 0.02, 0.07), (0.1, -0.155, 0.64), col("#3F6FD0"), "spine")
        front = -0.145
    elif outer in ("rompi", "rompi_safety"):
        vc = col("#F2A33A") if outer == "rompi_safety" else col(s["outer_col"])
        for sx in (-0.15, 0.15):
            G("rompi", (0.14, 0.28, 0.38), (sx, 0, 0.53), vc, "spine")
        G("rompi_belakang", (0.44, 0.06, 0.38), (0, 0.115, 0.53), vc, "spine")
        if outer == "rompi_safety":
            for sx in (-0.15, 0.15):
                G("reflektor", (0.145, 0.01, 0.035), (sx, -0.145, 0.48), col("#E9EEF8", 0.0), "spine")
        else:
            for sx in (-0.15, 0.15):
                G("saku_rompi", (0.09, 0.02, 0.07), (sx, -0.145, 0.45), col("#7A6A4A"), "spine")
        front = -0.14
    elif outer == "apron":
        ac = col(s["outer_col"])
        G("apron", (0.36, 0.02, 0.5), (0, -0.14, 0.45), ac, "spine")
        G("apron_saku", (0.2, 0.02, 0.08), (0, -0.152, 0.4), col("#5A3A20"), "spine")
        front = -0.145
    # lengan & tangan
    for side, sx in (("L", 0.28), ("R", -0.28)):
        G("lengan", (0.14, 0.15, 0.3), (sx, 0, SH - 0.13), sleeve, f"arm.{side}")
        G("tangan", (0.13, 0.13, 0.1), (sx, 0, SH - 0.33), skin, f"arm.{side}")
    # leher & kartu ID (warna tali per departemen)
    G("leher", (0.16, 0.14, 0.06), (0, 0, 0.75), skin, "spine")
    tali = col(DEPT[s["dept"]], 0.04)
    if s["rambut"] == "kerudung":
        front = min(front, -0.185)
    for sx in (-0.07, 0.07):
        G("tali", (0.03, 0.02, 0.2), (sx, front - 0.015, 0.62), tali, "spine")
    G("id_card", (0.11, 0.02, 0.13), (0, front - 0.02, 0.47), col("#FFFFFF", 0.02), "spine")
    G("id_garis", (0.11, 0.022, 0.03), (0, front - 0.021, 0.52), tali, "spine")

    # kepala & wajah
    G("kepala", (0.62, 0.56, 0.54), (0, 0, HZ), skin, "head")
    eye, white, blush = M["eye"], M["white"], M["blush"]
    for sx in (-0.14, 0.14):
        G("mata", (0.09, 0.02, 0.13), (sx, FY, HZ - 0.03), eye, "head")
        G("kilau", (0.035, 0.02, 0.04), (sx + 0.02, FY - 0.004, HZ + 0.005), white, "head")
        G("pipi", (0.09, 0.02, 0.04), (sx * 1.45, FY, HZ - 0.12), blush, "head")
        G("alis", (0.1, 0.02, 0.025), (sx, FY, HZ + 0.07), hair, "head")
    G("mulut", (0.08, 0.02, 0.03), (0, FY, HZ - 0.15), eye, "head")

    # rambut
    style = s["rambut"]
    topi = s.get("topi")
    rnd = random.Random(s["id"])
    if style == "kerudung":
        kc = col(s["kerudung"], 0.05)
        kd = col(s["kerudung"], 0.05)
        G("kerudung_atas", (0.7, 0.64, 0.2), (0, 0.0, HZ + 0.33), kc, "head")
        G("kerudung_belakang", (0.7, 0.16, 0.74), (0, 0.27, HZ - 0.07), kc, "head")
        for sx in (-0.345, 0.345):
            G("kerudung_sisi", (0.09, 0.58, 0.66), (sx, 0.0, HZ - 0.06), kc, "head")
        G("kerudung_dahi", (0.62, 0.06, 0.1), (0, -0.29, HZ + 0.22), kc, "head")
        G("ciput", (0.5, 0.062, 0.03), (0, -0.29, HZ + 0.16), col("#F4F1EA", 0.02), "head")
        G("kerudung_dagu", (0.66, 0.34, 0.12), (0, -0.08, HZ - 0.33), kc, "head")
        G("kerudung_bahu", (0.52, 0.34, 0.14), (0, 0.0, 0.76), kd, "spine")
        G("kerudung_depan", (0.36, 0.04, 0.2), (0, -0.16, 0.64), kd, "spine")
        G("kerudung_depan_ujung", (0.22, 0.04, 0.08), (0, -0.16, 0.5), kd, "spine")
    elif style != "keriting" or topi:
        G("rambut_atas", (0.68, 0.62, 0.18), (0, 0.01, HZ + 0.32), hair, "head")
    if style != "kerudung":
        G("rambut_belakang", (0.68, 0.14, 0.56), (0, 0.26, HZ + 0.02), hair, "head")
        for sx in (-0.33, 0.33):
            G("rambut_samping", (0.08, 0.5, 0.42), (sx, 0.04, HZ + 0.07), hair, "head")
    if style == "kerudung":
        pass
    elif style == "rapi":
        G("poni", (0.42, 0.06, 0.12), (-0.12, -0.28, HZ + 0.25), hair, "head")
        G("poni", (0.2, 0.06, 0.07), (0.2, -0.28, HZ + 0.27), hair, "head")
    elif style in ("panjang", "bob"):
        long_ = style == "panjang"
        G("rambut_panjang", (0.7, 0.16, 0.8 if long_ else 0.6), (0, 0.27, HZ - (0.1 if long_ else 0.02)), hair, "head")
        for sx in (-0.34, 0.34):
            G("rambut_sisi", (0.1, 0.5, 0.62 if long_ else 0.5), (sx, 0.02, HZ - (0.04 if long_ else 0.0)), hair, "head")
        for i, (bx, bh) in enumerate([(-0.22, 0.16), (-0.06, 0.18), (0.1, 0.16), (0.24, 0.12)]):
            G("poni", (0.17, 0.06, bh), (bx, -0.28, HZ + 0.31 - bh / 2), hair, "head")
    else:
        for i, (bx, bh) in enumerate([(-0.24, 0.18), (-0.08, 0.12), (0.08, 0.2), (0.24, 0.14)]):
            G("poni", (0.17, 0.06, bh), (bx, -0.28, HZ + 0.31 - bh / 2), hair, "head")
    if style == "kuncir":
        G("ikat", (0.12, 0.1, 0.1), (0, 0.36, HZ + 0.14), col("#E04A4A"), "head")
        G("kuncir", (0.15, 0.15, 0.4), (0, 0.42, HZ - 0.08), hair, "head", rot=(-12, 0, 0))
    if style == "cepol":
        G("cepol", (0.28, 0.28, 0.22), (0, 0.1, HZ + 0.5), hair, "head")
        G("cepol_ikat", (0.3, 0.3, 0.05), (0, 0.1, HZ + 0.41), col("#3B5FB0"), "head")
    if style == "jambul" and not topi:
        G("jambul", (0.42, 0.3, 0.2), (0.04, -0.12, HZ + 0.46), hair, "head", rot=(-18, 0, 6))
    if style == "keriting" and not topi:
        for ix in range(3):
            for iy in range(3):
                q = rnd.uniform(0.24, 0.3)
                G("ikal", (q, q, q), (-0.22 + ix * 0.22, -0.18 + iy * 0.2, HZ + 0.36 + rnd.uniform(-0.02, 0.04)), hair, "head",
                  rot=(rnd.uniform(-10, 10), rnd.uniform(-10, 10), rnd.uniform(0, 30)))
    if style == "berantakan" and not topi:
        for i in range(7):
            q = rnd.uniform(0.12, 0.18)
            G("acak", (q, q, q * 1.4), (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.2, 0.22), HZ + 0.43), hair, "head",
              rot=(rnd.uniform(-25, 25), rnd.uniform(-25, 25), rnd.uniform(0, 45)))

    # topi
    if topi:
        tc = col(s.get("topi_col", "#1F2E5A"))
        if topi in ("cap", "cap_balik"):
            G("topi", (0.7, 0.64, 0.17), (0, 0.01, HZ + 0.4), tc, "head")
            G("topi_kancing", (0.08, 0.08, 0.04), (0, 0.01, HZ + 0.5), tc, "head")
            by = 0.42 if topi == "cap_balik" else -0.42
            G("topi_lidah", (0.5, 0.26, 0.035), (0, by, HZ + 0.33), tc, "head")
        elif topi == "baret":
            G("baret", (0.74, 0.66, 0.12), (0.04, 0.0, HZ + 0.42), tc, "head", rot=(0, 9, 0))
            G("baret_ekor", (0.04, 0.04, 0.07), (0.06, 0.0, HZ + 0.5), tc, "head")
        elif topi == "kupluk":
            G("kupluk", (0.7, 0.64, 0.24), (0, 0.01, HZ + 0.42), tc, "head")
            G("kupluk_lipat", (0.72, 0.66, 0.09), (0, 0.01, HZ + 0.3), col("#C76A26"), "head")
            G("pompom", (0.14, 0.14, 0.14), (0, 0.01, HZ + 0.6), col("#F4F1EA"), "head")
        elif topi == "satpam":
            G("satpam", (0.68, 0.62, 0.14), (0, 0.01, HZ + 0.38), tc, "head")
            G("satpam_atas", (0.76, 0.72, 0.08), (0, 0.0, HZ + 0.48), tc, "head")
            G("satpam_lidah", (0.52, 0.22, 0.03), (0, -0.4, HZ + 0.32), M["black"] if "black" in M else col("#16181F"), "head")
            G("lencana", (0.1, 0.02, 0.1), (0, -0.32, HZ + 0.42), col("#E8B64A"), "head")
        elif topi == "bucket":
            G("bucket", (0.68, 0.62, 0.18), (0, 0.01, HZ + 0.4), tc, "head")
            G("bucket_tepi", (0.86, 0.8, 0.035), (0, 0.01, HZ + 0.31), tc, "head")

    # aksesori
    for a in s.get("aks", []):
        if a == "kacamata":
            fr = col("#1A1420", 0.0)
            for sx in (-0.14, 0.14):
                G("kaca_atas", (0.17, 0.02, 0.022), (sx, FY - 0.012, HZ + 0.04), fr, "head")
                G("kaca_bawah", (0.17, 0.02, 0.022), (sx, FY - 0.012, HZ - 0.1), fr, "head")
                for ex in (-0.075, 0.075):
                    G("kaca_sisi", (0.022, 0.02, 0.16), (sx + ex, FY - 0.012, HZ - 0.03), fr, "head")
            G("kaca_jembatan", (0.1, 0.02, 0.02), (0, FY - 0.012, HZ + 0.0), fr, "head")
            for sx in (-0.318, 0.318):
                G("kaca_gagang", (0.02, 0.3, 0.02), (sx, -0.13, HZ + 0.02), fr, "head")
        elif a == "kacamata_hitam":
            fr = col("#121218", 0.0)
            for sx in (-0.14, 0.14):
                G("kaca_hitam", (0.19, 0.025, 0.12), (sx, FY - 0.014, HZ - 0.03), fr, "head")
            G("kaca_jembatan", (0.12, 0.02, 0.025), (0, FY - 0.014, HZ + 0.0), fr, "head")
            for sx in (-0.318, 0.318):
                G("kaca_gagang", (0.02, 0.3, 0.02), (sx, -0.13, HZ + 0.0), fr, "head")
        elif a == "headphone":
            hc, cc = col("#1B1B1F"), col("#E04A4A")
            G("hp_atas", (0.62, 0.1, 0.06), (0, 0.0, HZ + 0.44), hc, "head")
            for sx in (-0.36, 0.36):
                G("hp_sisi", (0.06, 0.1, 0.3), (sx, 0.0, HZ + 0.27), hc, "head")
                G("hp_cup", (0.1, 0.2, 0.2), (sx * 1.03, 0.0, HZ + 0.02), cc, "head")
        elif a == "headphone_leher":
            hc, cc = col("#1B1B1F"), col("#E8B64A")
            G("hp_leher", (0.34, 0.06, 0.05), (0, 0.11, 0.8), hc, "spine")
            for sx in (-0.17, 0.17):
                G("hp_cup", (0.09, 0.14, 0.14), (sx, -0.08, 0.78), cc, "spine")
        elif a == "dasi":
            dc = col("#C0392B")
            G("dasi_simpul", (0.08, 0.02, 0.05), (0, -0.14, 0.7), dc, "spine")
            G("dasi", (0.07, 0.015, 0.22), (0, -0.14, 0.56), dc, "spine")
        elif a in ("syal", "syal_kuning"):
            sc = col("#E8B64A" if a == "syal_kuning" else "#3BA3D0")
            G("syal", (0.46, 0.3, 0.09), (0, 0, 0.76), sc, "spine")
            G("syal_ujung", (0.09, 0.03, 0.22), (0.1, -0.16, 0.62), sc, "spine")
        elif a == "kamera_leher":
            G("tali_kamera", (0.02, 0.02, 0.2), (-0.09, -0.15, 0.64), col("#1B1B1F"), "spine")
            G("tali_kamera", (0.02, 0.02, 0.2), (0.09, -0.15, 0.64), col("#1B1B1F"), "spine")
            G("kamera", (0.2, 0.09, 0.12), (0, -0.19, 0.53), col("#1B1B1F"), "spine")
            G("lensa", (0.08, 0.05, 0.08), (0, -0.25, 0.53), col("#3A4256"), "spine")
            G("kaca_lensa", (0.05, 0.01, 0.05), (0, -0.278, 0.53), col("#7FB2FF", 0.0), "spine")
        elif a == "vr":
            G("vr", (0.52, 0.14, 0.14), (0, -0.28, HZ + 0.2), col("#2E2E3A"), "head")
            G("vr_lensa", (0.4, 0.02, 0.08), (0, -0.355, HZ + 0.2), col("#B59BFF", 0.0), "head")
            for sx in (-0.33, 0.33):
                G("vr_tali", (0.03, 0.5, 0.06), (sx, 0.0, HZ + 0.2), col("#2E2E3A"), "head")
        elif a == "clipboard":
            G("clipboard", (0.04, 0.22, 0.28), (-0.37, -0.08, 0.4), col("#8A5E3A"), "arm.R")
            G("clipboard_kertas", (0.045, 0.18, 0.22), (-0.37, -0.08, 0.39), col("#F4F1EA", 0.02), "arm.R")
            G("clipboard_jepit", (0.05, 0.08, 0.04), (-0.37, -0.08, 0.55), col("#9AA3B5"), "arm.R")
        elif a == "kunci":
            G("ring_kunci", (0.07, 0.02, 0.07), (0.16, -0.14, 0.31), col("#E8B64A"), "spine")
            G("kunci1", (0.025, 0.015, 0.09), (0.15, -0.145, 0.24), col("#E8B64A"), "spine", rot=(0, 15, 0))
            G("kunci2", (0.025, 0.015, 0.08), (0.18, -0.145, 0.25), col("#C9CED8"), "spine", rot=(0, -20, 0))
        elif a == "sabuk":
            G("sabuk", (0.44, 0.28, 0.05), (0, 0, 0.33), col("#1B1B1F"), "spine")
            G("gesper", (0.08, 0.02, 0.05), (0, -0.141, 0.33), col("#E8B64A"), "spine")
        elif a == "pena":
            G("pena", (0.02, 0.16, 0.02), (0.33, -0.12, HZ + 0.08), col("#3F6FD0"), "head", rot=(-20, 0, 0))
        elif a == "hp":
            G("hp", (0.1, 0.035, 0.18), (-0.33, -0.1, 0.36), col("#1B1B1F", 0.0), "arm.R")
            G("hp_layar", (0.08, 0.01, 0.15), (-0.33, -0.12, 0.36), M["screen"], "arm.R")
        elif a == "jam":
            G("jam_tangan", (0.15, 0.15, 0.04), (0.28, 0, SH - 0.27), col("#1B1B1F"), "arm.L")
            G("jam_muka", (0.05, 0.02, 0.03), (0.28, -0.076, SH - 0.27), col("#E8B64A"), "arm.L")

    mesh = join(P, "karyawan_" + s["id"])

    # rig seragam
    data = bpy.data.armatures.new("rig_" + s["id"])
    rig = bpy.data.objects.new("rig_" + s["id"], data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    r = eb.new("root"); r.head = (0, 0, 0); r.tail = (0, 0, 0.3)
    sp = eb.new("spine"); sp.head = (0, 0, 0.33); sp.tail = (0, 0, 0.75); sp.parent = r
    hd = eb.new("head"); hd.head = (0, 0, 0.75); hd.tail = (0, 0, 1.3); hd.parent = sp
    for side, sx in (("L", 0.28), ("R", -0.28)):
        b = eb.new(f"arm.{side}"); b.head = (sx, 0, SH); b.tail = (sx, 0, SH - 0.38); b.parent = sp
    for side, sx in (("L", 0.1), ("R", -0.1)):
        b = eb.new(f"leg.{side}"); b.head = (sx, 0, 0.33); b.tail = (sx, 0, 0.0); b.parent = r
    fwd = {b.name: (-1 if b.z_axis.y > 0 else 1) for b in eb}
    out = {b.name: (-1 if b.x_axis.x > 0 else 1) for b in eb}
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.parent = rig
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return rig, mesh, fwd, out


# ---------- studio foto per karakter ----------
FLOOR = material("panggung", painter=plank_painter("#B5824F", 77))
box("lantai", (6.0, 6.0, 0.1), (0, 0.5, -0.05), FLOOR)
box("dinding_foto", (6.0, 0.2, 4.0), (0, 1.2, 1.9), M["wall"])


def label(body, loc, size, color="#F2F5FC", emit=1.2):
    cu = bpy.data.curves.new(body, "FONT")
    cu.body = body; cu.size = size; cu.extrude = 0.005
    cu.align_x = "CENTER"; cu.align_y = "CENTER"
    ob = bpy.data.objects.new("label_" + body, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (rad(80), 0, 0)
    m = bpy.data.materials.new("label")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    c = [((ch + 0.055) / 1.055) ** 2.4 for ch in hex2rgb(color)]
    b.inputs["Base Color"].default_value = (*c, 1)
    b.inputs["Emission Color"].default_value = (*c, 1)
    b.inputs["Emission Strength"].default_value = emit
    cu.materials.append(m)
    return ob


PLATE = material("papan_label", color="#1B2550", var=0.03)
rigs = []
for s in STAFF:
    rig, mesh, fwd, out = build(s)
    pb = rig.pose.bones
    for side, deg in (("L", -7), ("R", 7)):
        b = pb["arm." + side]
        m = b.bone.matrix_local.to_3x3()
        b.rotation_quaternion = (m.inverted() @ Matrix.Rotation(rad(deg), 3, "Y") @ m).to_quaternion()
    plate = box("papan_" + s["id"], (1.5, 0.03, 0.2), (0, -0.55, 0.1), PLATE, rot=(-10, 0, 0))
    lb = label(s["nama"], (0, -0.575, 0.1), 0.1)
    rigs.append((s, rig, mesh, [rig, mesh, plate, lb]))

# ---------- cahaya & kamera ----------
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.012, 0.02, 0.05, 1)
bg.inputs["Strength"].default_value = 1.0
for name, kind, loc, energy, color_, rot, size in [
    ("kunci", "AREA", (2.0, -3.5, 3), 400, (1.0, 0.93, 0.85), (55, 0, 30), 3),
    ("isi", "AREA", (-3, -3, 2), 180, (0.65, 0.75, 1.0), (65, 0, -45), 3),
    ("belakang", "AREA", (0, 0.6, 3.5), 150, (1.0, 0.85, 0.65), (0, 0, 0), 3),
]:
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color_; ld.size = size
    ob = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = [rad(a) for a in rot]

cam_d = bpy.data.cameras.new("Kamera")
cam_d.type = "ORTHO"
cam_d.ortho_scale = 1.9
cam = bpy.data.objects.new("Kamera", cam_d)
bpy.context.collection.objects.link(cam)
cam.rotation_euler = (rad(78), 0, rad(18))
d = Vector((0, 0, 1)); d.rotate(cam.rotation_euler)
cam.location = Vector((0, -0.1, 0.72)) + d * 20
scene.camera = cam
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x, scene.render.resolution_y = 420, 520
foto = os.path.join(HERE, "foto_karyawan")
os.makedirs(foto, exist_ok=True)
for i, (s, rig, mesh, objs) in enumerate(rigs):
    for _, _, _, others in rigs:
        for o in others:
            o.hide_render = o not in objs
    scene.render.filepath = os.path.join(foto, f"{i:02d}_{s['id']}.png")
    bpy.ops.render.render(write_still=True)
for _, _, _, others in rigs:
    for o in others:
        o.hide_render = False

# ---------- ekspor: semua karakter di titik 0, pose netral ----------
bpy.ops.object.select_all(action="DESELECT")
for s, rig, mesh, _ in rigs:
    rig.location = (0, 0, 0)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
    rig.select_set(True)
    mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "karyawan.glb"), export_format="GLB", use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "karyawan.blend"))
print("SELESAI", len(rigs))
