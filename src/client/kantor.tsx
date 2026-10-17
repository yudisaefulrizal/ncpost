// Halaman Kantor: diorama 3D tempat setiap menu NC Post menjadi satu karyawan.
// Aset dibuat di Blender (desain/kantor-3d) dan disajikan dari public/kantor.
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { api } from "./api";
import {
  DEPT_NAME,
  STAFF,
  STATUS_LABEL,
  jobsOf,
  labJobs,
  liveByStaff,
  type OfficeLab,
  latestJobs,
  newlyCompleted,
  staffStatus,
  type OfficeJob,
  type OfficeStatus,
} from "./kantor-status";
import { useOffice, targetState, postLabel, hhmm } from "./office-pages";
import { PLATFORM_LABEL } from "../server/social-plan";

const CLIP: Record<OfficeStatus, string> = {
  diam: "duduk_diam",
  bekerja: "mengetik",
  menunggu: "menunggu",
  selesai: "selesai",
  gagal: "gagal",
};
const TONE: Record<OfficeStatus, string> = {
  diam: "t-none",
  bekerja: "t-run",
  menunggu: "t-act",
  selesai: "t-ok",
  gagal: "t-block",
};
const BUBBLE: Record<OfficeStatus, string> = {
  diam: "",
  bekerja: "•••",
  menunggu: "antre",
  selesai: "✓",
  gagal: "!",
};
// Hasil job diantar lewat koridor: siapa yang berjalan dan ke mana.
const COURIER: Record<string, string[]> = {
  foto: ["konten_pintu", "koridor_konten", "koridor_aset", "aset_pintu"],
  audio: ["konten_pintu", "koridor_konten", "koridor_aset", "aset_pintu"],
  ggambar: ["konten_pintu", "koridor_konten", "koridor_aset", "aset_pintu"],
  gpanel: ["konten_pintu", "koridor_konten", "koridor_aset", "aset_pintu"],
  gvideo: ["konten_pintu", "koridor_konten", "koridor_aset", "aset_pintu"],
  sosmed: [
    "konten_pintu",
    "koridor_konten",
    "koridor_lobi",
    "lobi_pintu",
    "lobi_dalam",
    "pintu_masuk",
  ],
};
const POLL_MS = 4000;
const DONE_MS = 4000;
const WALK_SPEED = 1.6;

type Actor = {
  id: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  current?: THREE.AnimationAction;
  status: OfficeStatus;
  waving: boolean;
};
type Courier = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  path: THREE.Vector3[];
  seg: number;
  staff: string;
};

export function KantorPage({
  onOpenMenu,
}: {
  onOpenMenu: (menu: string, staff: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const bubbles = useRef<Record<string, HTMLDivElement | null>>({});
  const engine = useRef<{
    setStatus: (id: string, s: OfficeStatus) => void;
    wave: (id: string) => void;
    courier: (id: string) => void;
    focus: (id: string) => void;
    resetView: () => void;
  } | null>(null);
  const { office } = useOffice(30000);
  const [loading, setLoading] = useState("Memuat kantor…");
  const [jobs, setJobs] = useState<OfficeJob[]>([]);
  const [doneUntil, setDoneUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [jobError, setJobError] = useState("");
  // Proses langsung di atas kepala karyawan (WebSocket, tersambung ulang otomatis).
  const [liveText, setLiveText] = useState<Record<string, string>>({});
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`,
      );
      socket.onmessage = (e) => {
        try {
          setLiveText(liveByStaff(JSON.parse(e.data)));
        } catch {}
      };
      socket.onclose = () => {
        setLiveText({});
        if (!stopped) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  const statuses = Object.fromEntries(
    STAFF.map((s) => [s.id, staffStatus(s, jobs, doneUntil[s.id] ?? 0, now)]),
  ) as Record<string, OfficeStatus>;
  // Manajer terlihat bekerja sesaat setelah memposting atau memberi perintah.
  if (office && now - office.manager.lastActionAt < 120000)
    statuses.manajer = "bekerja";

  // ---------- adegan 3D ----------
  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1220");
    scene.add(new THREE.HemisphereLight("#cfdcff", "#4a3a28", 1.7));
    const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
    sun.position.set(9, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 16,
      bottom: -16,
      near: 1,
      far: 50,
    });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const target = new THREE.Vector3(-0.8, 0.5, -0.6);
    const dir = new THREE.Vector3(0.527, 0.574, 0.627).normalize();
    const home = () => {
      camera.position.copy(target).addScaledVector(dir, 40);
      camera.zoom = 1;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    };
    home();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.8;
    controls.maxZoom = 3.5;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.update();
    const az = controls.getAzimuthalAngle(),
      pol = controls.getPolarAngle();
    controls.minAzimuthAngle = az - 0.6;
    controls.maxAzimuthAngle = az + 0.6;
    controls.minPolarAngle = pol - 0.3;
    controls.maxPolarAngle = Math.min(pol + 0.2, 1.35);
    // Klik dari direktori: kamera meluncur ke karyawan itu.
    let focusGoal: THREE.Vector3 | null = null;
    const bounds = new THREE.Box3(
      new THREE.Vector3(-11, 0, -8),
      new THREE.Vector3(11, 2, 8),
    );
    controls.addEventListener("change", () =>
      bounds.clampPoint(controls.target, controls.target),
    );

    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      const aspect = w / h;
      const halfH = Math.max(9, 13.5 / aspect);
      Object.assign(camera, {
        left: -halfH * aspect,
        right: halfH * aspect,
        top: halfH,
        bottom: -halfH,
      });
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const actors = new Map<string, Actor>();
    const couriers: Courier[] = [];
    const points = new Map<string, THREE.Vector3>();
    let clips: THREE.AnimationClip[] = [];
    let staffModels: THREE.Object3D | null = null;
    let globe: THREE.Object3D[] = [];
    const pickables: THREE.Object3D[] = [];

    const clip = (name: string) => clips.find((c) => c.name === name)!;
    const play = (
      a: { mixer: THREE.AnimationMixer; current?: THREE.AnimationAction },
      name: string,
      once = false,
    ) => {
      const next = a.mixer.clipAction(clip(name));
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      if (a.current && a.current !== next)
        next.crossFadeFrom(a.current, 0.3, false);
      next.play();
      a.current = next;
      return next;
    };
    const makeStaff = (id: string) => {
      const src = staffModels!.getObjectByName("rig_" + id)!;
      const root = cloneSkinned(src);
      // karyawan.glb memuat 19 rig bernama tulang sama; loader memberi akhiran _n.
      root.traverse((o) => {
        if ((o as THREE.Bone).isBone) o.name = o.name.replace(/_\d+$/, "");
        o.castShadow = true;
        o.userData.staff = id;
      });
      return root;
    };

    const loader = new GLTFLoader();
    Promise.all(
      ["kantor", "karyawan", "animasi"].map((n) =>
        loader.loadAsync(`/kantor/${n}.glb`),
      ),
    )
      .then(([office, people, anim]) => {
        if (disposed) return;
        office.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
          if (o.name.startsWith("titik_"))
            points.set(
              o.name.slice(6),
              o.getWorldPosition(new THREE.Vector3()),
            );
        });
        scene.add(office.scene);
        globe = ["globe", "globe_inti"]
          .map((n) => office.scene.getObjectByName(n))
          .filter(Boolean) as THREE.Object3D[];
        staffModels = people.scene;
        clips = anim.animations;
        for (const s of STAFF) {
          const seat = office.scene.getObjectByName("kursi_" + s.id);
          if (!seat) continue;
          const root = makeStaff(s.id);
          seat.getWorldPosition(root.position);
          seat.getWorldQuaternion(root.quaternion);
          scene.add(root);
          pickables.push(root);
          const a: Actor = {
            id: s.id,
            root,
            mixer: new THREE.AnimationMixer(root),
            status: "diam",
            waving: false,
          };
          play(a, CLIP.diam).time = Math.random() * 2;
          actors.set(s.id, a);
        }
        setLoading("");
      })
      .catch(() => !disposed && setLoading("Aset kantor gagal dimuat."));

    engine.current = {
      setStatus(id, s) {
        const a = actors.get(id);
        if (!a || a.status === s) return;
        a.status = s;
        if (!a.waving) play(a, CLIP[s]);
      },
      wave(id) {
        const a = actors.get(id);
        if (!a || a.waving) return;
        a.waving = true;
        play(a, "berdiri", true);
        const steps: [string, number, boolean][] = [
          ["melambai", 650, false],
          ["duduk", 2650, true],
        ];
        for (const [name, at, once] of steps)
          setTimeout(() => !disposed && play(a, name, once), at);
        setTimeout(() => {
          if (disposed) return;
          a.waving = false;
          play(a, CLIP[a.status]);
        }, 3400);
      },
      courier(id) {
        const route = COURIER[id];
        if (!staffModels || !route || couriers.length >= 3) return;
        const path = route
          .map((p) => points.get(p))
          .filter(Boolean) as THREE.Vector3[];
        if (path.length < 2) return;
        const root = makeStaff(id);
        root.position.copy(path[0]);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.26, 0.28),
          new THREE.MeshStandardMaterial({ color: "#c99b62", roughness: 0.9 }),
        );
        box.position.set(0, 0.5, 0.38);
        box.castShadow = true;
        root.add(box);
        scene.add(root);
        const c: Courier = {
          root,
          mixer: new THREE.AnimationMixer(root),
          path,
          seg: 0,
          staff: id,
        };
        play(c, "jalan_bawa");
        couriers.push(c);
        const seated = actors.get(id);
        if (seated) seated.root.visible = false;
      },
      focus(id) {
        const a = actors.get(id);
        if (!a) return;
        focusGoal = a.root.position.clone().setY(0.6);
        camera.zoom = Math.max(camera.zoom, 1.9);
        camera.updateProjectionMatrix();
      },
      resetView() {
        focusGoal = null;
        controls.target.copy(target);
        home();
        controls.update();
      },
    };

    // klik karakter = pilih + melambai; seret = geser peta
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, true)[0];
      return (hit?.object.userData.staff as string) ?? null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) =>
      (down = { x: ev.clientX, y: ev.clientY });
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5)
        return;
      const id = pick(ev);
      setSelected(id);
      if (id) engine.current?.wave(id);
    };
    let lastHover = 0;
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons || performance.now() - lastHover < 80) return;
      lastHover = performance.now();
      const id = pick(ev);
      setHovered(id);
      renderer.domElement.style.cursor = id ? "pointer" : "grab";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    const timer = new THREE.Timer();
    const anchor = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.1);
      if (focusGoal) {
        const step = focusGoal.clone().sub(controls.target);
        if (step.length() < 0.02) focusGoal = null;
        else {
          step.multiplyScalar(Math.min(1, dt * 5));
          controls.target.add(step);
          camera.position.add(step);
        }
      }
      controls.update();
      for (const a of actors.values()) a.mixer.update(dt);
      for (const g of globe) g.rotation.y += dt * 0.6;
      for (let i = couriers.length - 1; i >= 0; i--) {
        const c = couriers[i];
        c.mixer.update(dt);
        const to = c.path[c.seg + 1];
        const delta = to.clone().sub(c.root.position);
        const step = WALK_SPEED * dt;
        if (delta.length() <= step) {
          c.root.position.copy(to);
          c.seg++;
          if (c.seg >= c.path.length - 1) {
            scene.remove(c.root);
            couriers.splice(i, 1);
            const seated = actors.get(c.staff);
            if (seated && !couriers.some((o) => o.staff === c.staff))
              seated.root.visible = true;
          }
        } else {
          c.root.position.addScaledVector(delta.normalize(), step);
          c.root.rotation.y = Math.atan2(delta.x, delta.z);
        }
      }
      const w = el.clientWidth,
        h = el.clientHeight;
      for (const [id, a] of actors) {
        const b = bubbles.current[id];
        if (!b) continue;
        anchor.copy(a.root.position).y += 1.75;
        anchor.project(camera);
        const visible = a.root.visible && anchor.z < 1;
        b.style.display = visible ? "" : "none";
        b.style.transform = `translate(${((anchor.x + 1) / 2) * w}px, ${((1 - anchor.y) / 2) * h}px) translate(-50%, -100%)`;
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      engine.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // ---------- status dari job ----------
  const prevStates = useRef(new Map<number, string>());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [jobs, labs] = await Promise.all([
          api("/jobs", "GET", undefined, null) as Promise<OfficeJob[]>,
          api("/news-labs", "GET", undefined, null).then(
            (r: { labs: OfficeLab[] }) => r.labs,
            () => [] as OfficeLab[],
          ),
        ]);
        const list = [...jobs, ...labJobs(labs)];
        if (!alive) return;
        const done = newlyCompleted(prevStates.current, list);
        if (done.length) {
          const t = Date.now() + DONE_MS;
          const marks: Record<string, number> = {};
          for (const j of done)
            for (const s of STAFF)
              if (!s.semua && s.handles?.(j.kind)) {
                marks[s.id] = t;
                engine.current?.courier(s.id);
              }
          setDoneUntil((d) => ({ ...d, ...marks }));
        }
        prevStates.current = new Map(list.map((j) => [j.id, j.state]));
        setJobs(list);
        setJobError("");
      } catch {
        if (alive) setJobError("Status job tidak bisa dibaca");
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    for (const s of STAFF) engine.current?.setStatus(s.id, statuses[s.id]);
  });

  const counts = (["bekerja", "menunggu", "gagal"] as OfficeStatus[]).map(
    (k) => [k, STAFF.filter((s) => statuses[s.id] === k).length] as const,
  );
  const sel = STAFF.find((s) => s.id === selected) ?? null;
  const selJobs = sel ? latestJobs(jobsOf(sel, jobs)).slice(0, 6) : [];
  const platforms = ["instagram", "tiktok", "youtube"] as const;
  // Capaian target dihitung server per jenis konten (kelebihan tidak menutupi kekurangan).
  const goal = office
    ? platforms.reduce(
        (acc, p) => ({
          done: acc.done + office.progress[p],
          target: acc.target + office.targets[p],
        }),
        { done: 0, target: 0 },
      )
    : null;
  const special: Record<string, { text: string; cls: string } | undefined> = {
    manajer:
      goal && goal.target
        ? {
            text: `${goal.done}/${goal.target}`,
            cls: goal.done >= goal.target ? "b-selesai" : "b-menunggu",
          }
        : undefined,
  };
  const pick = (id: string) => {
    setSelected(id);
    engine.current?.focus(id);
    engine.current?.wave(id);
  };
  const jobTone = (state: string) =>
    TONE[
      state === "running"
        ? "bekerja"
        : state === "queued"
          ? "menunggu"
          : state === "failed"
            ? "gagal"
            : state === "completed"
              ? "selesai"
              : "diam"
    ];

  return (
    <div className="kantor">
      <div className="kantor-bar">
        <div className="row-gap">
          {counts.map(([k, n]) => (
            <span key={k} className={"chip " + TONE[k]}>
              {STATUS_LABEL[k]} <b className="mono">{n}</b>
            </span>
          ))}
          {office && goal && goal.target > 0 && (
            <button
              className="chip kantor-target"
              onClick={() => onOpenMenu("Ruang Manajer", "manajer")}
              title="Buka Ruang Manajer"
            >
              Target hari ini
              {platforms
                .filter((p) => office.targets[p] > 0)
                .map((p) => (
                  <span
                    key={p}
                    className={
                      targetState(office.progress[p], office.targets[p]).tone
                    }
                  >
                    {PLATFORM_LABEL[p]} {office.progress[p]}/{office.targets[p]}
                  </span>
                ))}
            </button>
          )}
          {jobError && <span className="chip t-block">{jobError}</span>}
        </div>
        <div className="row-gap">
          <button
            className="btn btn-sec btn-sm"
            onClick={() => pick("resepsionis")}
          >
            Direktori
          </button>
          <button
            className="btn btn-sec btn-sm"
            onClick={() => setShowNames((v) => !v)}
          >
            {showNames ? "Sembunyikan nama" : "Tampilkan nama"}
          </button>
          <button
            className="btn btn-sec btn-sm"
            onClick={() => engine.current?.resetView()}
          >
            Atur ulang tampilan
          </button>
        </div>
      </div>
      <div className="kantor-body">
        <div className="kantor-view">
          <div ref={host} className="kantor-canvas" />
          <div className="kantor-overlay" aria-hidden="true">
            {STAFF.map((s) => {
              const st = statuses[s.id];
              const name = showNames || hovered === s.id || selected === s.id;
              const extra = special[s.id];
              return (
                <div
                  key={s.id}
                  ref={(n) => void (bubbles.current[s.id] = n)}
                  className="kantor-tag"
                >
                  {liveText[s.id] && (
                    <span className="kantor-live">{liveText[s.id]}</span>
                  )}
                  {BUBBLE[st] ? (
                    <span className={"kantor-bubble b-" + st}>
                      {BUBBLE[st]}
                    </span>
                  ) : (
                    extra && (
                      <span className={"kantor-bubble " + extra.cls}>
                        {extra.text}
                      </span>
                    )
                  )}
                  {name && <span className="kantor-name">{s.nama}</span>}
                </div>
              );
            })}
          </div>
          {loading && <div className="kantor-loading">{loading}</div>}
          <p className="kantor-hint">
            Seret untuk menggeser · gulir untuk zoom · klik karyawan untuk
            membuka pekerjaannya
          </p>
        </div>
        {sel && (
          <aside
            className="card kantor-panel"
            aria-label={"Detail " + sel.nama}
          >
            <div className="kantor-panel-head">
              <img
                src={`/kantor/foto/${sel.id}.webp`}
                alt=""
                width={84}
                height={104}
              />
              <div>
                <small className="muted">{DEPT_NAME[sel.dept]}</small>
                <h2 className="h3">{sel.nama}</h2>
                <span className={"chip " + TONE[statuses[sel.id]]}>
                  {STATUS_LABEL[statuses[sel.id]]}
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm kantor-close"
                aria-label="Tutup detail"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <p className="muted">{sel.tugas}</p>
            {sel.menu && (
              <button
                className="btn btn-pri"
                onClick={() => onOpenMenu(sel.menu!, sel.id)}
              >
                Buka {sel.menu}
              </button>
            )}
            {(sel.id === "manajer" || sel.id === "sosmed") && office && (
              <ul className="kantor-goals">
                {platforms.map((p) => {
                  const st = targetState(office.progress[p], office.targets[p]);
                  return (
                    <li key={p}>
                      <span>{PLATFORM_LABEL[p]}</span>
                      <b className="mono">
                        {office.targets[p]
                          ? `${office.progress[p]}/${office.targets[p]}`
                          : `${office.today[p]} terbit`}
                      </b>
                      <span className={"chip chip-xs " + st.tone}>
                        {st.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {sel.id === "manajer" &&
              office &&
              office.manager.log.length > 0 && (
                <ul className="manager-list">
                  {office.manager.log.slice(0, 3).map((l, i) => (
                    <li key={i}>
                      <span className="mono muted">{hhmm(l.at)}</span>
                      <span
                        className={
                          l.tone === "warn"
                            ? "warn"
                            : l.tone === "ok"
                              ? "ok-text"
                              : ""
                        }
                      >
                        {l.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            {sel.id === "sosmed" && office && office.recent.length > 0 && (
              <ul className="kantor-jobs">
                {office.recent.slice(0, 4).map((r, i) => (
                  <li key={i}>
                    <span className="chip chip-xs t-none">
                      {PLATFORM_LABEL[r.platform]}
                    </span>
                    <span className="kantor-job-title">{r.title}</span>
                    <span
                      className={
                        "chip chip-xs " + (r.sent ? "t-ok" : "t-block")
                      }
                    >
                      {postLabel(r)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {sel.id === "resepsionis" ? (
              <div className="kantor-directory">
                <p className="muted">Pilih karyawan untuk menemuinya:</p>
                {(Object.keys(DEPT_NAME) as (keyof typeof DEPT_NAME)[])
                  .filter((d) => d !== "lobi")
                  .map((d) => (
                    <div key={d}>
                      <small className="muted">{DEPT_NAME[d]}</small>
                      <ul>
                        {STAFF.filter((s) => s.dept === d).map((s) => (
                          <li key={s.id}>
                            <button
                              className="kantor-dir-btn"
                              onClick={() => pick(s.id)}
                            >
                              <span>{s.nama}</span>
                              <small className="muted">{s.menu}</small>
                              <span
                                className={
                                  "chip chip-xs " + TONE[statuses[s.id]]
                                }
                              >
                                {STATUS_LABEL[statuses[s.id]]}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            ) : sel.handles || sel.semua ? (
              selJobs.length ? (
                <ul className="kantor-jobs">
                  {selJobs.map((j) => (
                    <li key={j.id}>
                      <span className="mono">{j.kind}</span>
                      <span className="muted">
                        {j.title ?? `bagian #${j.chapter_id}`}
                      </span>
                      <span className={"chip chip-xs " + jobTone(j.state)}>
                        {j.state}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Belum ada job terbaru.</p>
              )
            ) : (
              sel.id !== "manajer" && (
                <p className="muted">
                  Menu ini tidak menjalankan job, jadi statusnya selalu diam.
                </p>
              )
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
