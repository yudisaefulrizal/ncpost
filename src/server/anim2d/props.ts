// Pustaka ilustrasi vektor flat Nus 2D Studio (koordinat -50..50, pusat 0,0).
// Tiap prop menerima palet {a,b,c,f,w,sun,skin,bg}: a/b/c warna aksen,
// f = garis luar, w = putih. Gaya lembut: tanpa garis tepi.
export type Pal = Record<string, string>;
const st = (_f: string, _w = 3.5) => "";
const person = (
  P: Pal,
  x = 0,
  y = 0,
  k = 1,
  shirt = P.a,
  hair = "#2B2140",
) => `<g transform="translate(${x},${y}) scale(${k})">
    <rect x="-10" y="18" width="9" height="26" rx="4" fill="#3B4A7A" ${st(P.f)}/><rect x="1" y="18" width="9" height="26" rx="4" fill="#3B4A7A" ${st(P.f)}/>
    <rect x="-17" y="-16" width="34" height="42" rx="14" fill="${shirt}" ${st(P.f)}/>
    <circle cx="0" cy="-30" r="12" fill="${P.skin}" ${st(P.f)}/><path d="M-12 -34 Q0 -52 12 -34 Q0 -41 -12 -34Z" fill="${hair}" ${st(P.f, 3)}/></g>`;
const rays = (n: number, r1: number, r2: number, col: string, w = 4) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<line x1="0" y1="${-r1}" x2="0" y2="${-r2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" transform="rotate(${(360 / n) * i})"/>`,
  ).join("");
const win = (
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  w: number,
  h: number,
  fill: string,
) => {
  let s = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      s += `<rect x="${x0 + c * dx}" y="${y0 + r * dy}" width="${w}" height="${h}" rx="1.5" fill="${fill}" opacity=".9"/>`;
  return s;
};
export const PROPS: Record<string, (P: Pal) => string> = {
  person: (P: Pal) => person(P),
  people: (P: Pal) =>
    person(P, -26, 6, 0.62, P.b) +
    person(P, 26, 6, 0.62, P.c) +
    person(P, 0, 0, 0.78, P.a),
  building: (P: Pal) =>
    `<rect x="-24" y="-44" width="48" height="88" rx="4" fill="${P.a}" ${st(P.f)}/>${win(3, 5, -16, -36, 14, 15, 9, 9, P.w)}<rect x="-6" y="26" width="12" height="18" fill="${P.b}" ${st(P.f, 3)}/>`,
  city: (P: Pal) =>
    `<rect x="-42" y="-10" width="26" height="52" rx="3" fill="${P.b}" ${st(P.f)}/><rect x="-16" y="-40" width="30" height="82" rx="3" fill="${P.a}" ${st(P.f)}/><rect x="12" y="-22" width="28" height="64" rx="3" fill="${P.c}" ${st(P.f)}/>${win(2, 3, -36, -2, 11, 13, 7, 7, P.w)}${win(2, 5, -9, -32, 14, 14, 8, 8, P.w)}${win(2, 4, 18, -14, 10, 14, 7, 7, P.w)}`,
  house: (P: Pal) =>
    `<rect x="-30" y="-6" width="60" height="46" fill="${P.w}" ${st(P.f)}/><polygon points="-38,-4 0,-38 38,-4" fill="${P.a}" ${st(P.f)}/><rect x="-7" y="14" width="14" height="26" fill="${P.b}" ${st(P.f, 3)}/><rect x="14" y="4" width="12" height="12" fill="${P.b}" ${st(P.f, 3)}/><rect x="-26" y="4" width="12" height="12" fill="${P.b}" ${st(P.f, 3)}/>`,
  server: (P: Pal) =>
    [0, 1, 2]
      .map(
        (i) =>
          `<rect x="-34" y="${-40 + i * 27}" width="68" height="23" rx="6" fill="${P.a}" ${st(P.f)}/><rect x="-26" y="${-32 + i * 27}" width="30" height="7" rx="3" fill="${P.w}" opacity=".85"/><circle cx="22" cy="${-28.5 + i * 27}" r="3.5" fill="${P.sun}"/><circle cx="12" cy="${-28.5 + i * 27}" r="3.5" fill="${P.b}"/>`,
      )
      .join(""),
  tree: (P: Pal) =>
    `<rect x="-5" y="8" width="10" height="32" rx="3" fill="#8B5A2B" ${st(P.f)}/><circle cx="-15" cy="2" r="17" fill="#2F9E5E" ${st(P.f)}/><circle cx="15" cy="2" r="17" fill="#2F9E5E" ${st(P.f)}/><circle cx="0" cy="-14" r="22" fill="#3DB872" ${st(P.f)}/>`,
  sun: (P: Pal) =>
    `${rays(8, 28, 40, P.sun)}<circle r="22" fill="${P.sun}" ${st(P.f)}/>`,
  earth: (P: Pal) =>
    `<circle r="38" fill="#3A8FE0" ${st(P.f, 4)}/><path d="M-22 -16 q10 -14 24 -5 q6 10 -6 16 q-14 4 -18 -11z" fill="#3CC47C" ${st(P.f, 2.5)}/><path d="M8 8 q14 -6 20 6 q-2 14 -16 12 q-10 -8 -4 -18z" fill="#3CC47C" ${st(P.f, 2.5)}/><path d="M-26 14 q8 -4 12 4 q-4 8 -12 4z" fill="#3CC47C" ${st(P.f, 2.5)}/>`,
  laptop: (P: Pal) =>
    `<rect x="-32" y="-34" width="64" height="44" rx="5" fill="${P.f}"/><rect x="-27" y="-29" width="54" height="34" rx="2" fill="${P.a}"/><polyline points="-20,-2 -8,-14 0,-6 14,-20" fill="none" stroke="${P.w}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M-42 14 L42 14 L36 26 L-36 26Z" fill="${P.w}" ${st(P.f)}/>`,
  phone: (P: Pal) =>
    `<rect x="-19" y="-38" width="38" height="76" rx="9" fill="${P.f}"/><rect x="-14" y="-31" width="28" height="58" rx="3" fill="${P.a}"/><circle cx="0" cy="32" r="3" fill="${P.w}"/><rect x="-8" y="-18" width="16" height="16" rx="8" fill="${P.w}" opacity=".9"/><rect x="-9" y="5" width="18" height="4" rx="2" fill="${P.w}" opacity=".8"/>`,
  coin: (P: Pal) =>
    `<circle r="32" fill="${P.sun}" ${st(P.f, 4)}/><circle r="23" fill="none" stroke="${P.f}" stroke-width="2.5" opacity=".5"/><text y="12" text-anchor="middle" font-size="34" font-weight="800" fill="${P.f}" font-family="Poppins">$</text>`,
  gear: (P: Pal) =>
    `${Array.from({ length: 8 }, (_, i) => `<rect x="-7" y="-40" width="14" height="16" rx="3" fill="${P.a}" ${st(P.f, 3)} transform="rotate(${i * 45})"/>`).join("")}<circle r="28" fill="${P.a}" ${st(P.f)}/><circle r="10" fill="${P.bg}" ${st(P.f, 3)}/>`,
  bulb: (P: Pal) =>
    `${rays(8, 32, 42, P.sun, 3.5)}<circle cy="-8" r="22" fill="${P.sun}" ${st(P.f)}/><rect x="-10" y="12" width="20" height="14" rx="3" fill="${P.w}" ${st(P.f, 3)}/><rect x="-7" y="26" width="14" height="8" rx="3" fill="${P.f}"/>`,
  rocket: (P: Pal) =>
    `<path d="M-8 24 L0 46 L8 24Z" fill="${P.sun}" ${st(P.f, 3)}/><path d="M-14 4 L-32 28 L-14 24Z" fill="${P.a}" ${st(P.f)}/><path d="M14 4 L32 28 L14 24Z" fill="${P.a}" ${st(P.f)}/><path d="M0 -46 C18 -28 20 0 15 24 L-15 24 C-20 0 -18 -28 0 -46Z" fill="${P.w}" ${st(P.f)}/><circle cy="-12" r="8" fill="${P.b}" ${st(P.f)}/>`,
  chart: (P: Pal) =>
    `<rect x="-38" y="12" width="14" height="26" rx="2" fill="${P.a}" ${st(P.f, 3)}/><rect x="-18" y="-2" width="14" height="40" rx="2" fill="${P.b}" ${st(P.f, 3)}/><rect x="2" y="-18" width="14" height="56" rx="2" fill="${P.c}" ${st(P.f, 3)}/><rect x="22" y="-34" width="14" height="72" rx="2" fill="${P.a}" ${st(P.f, 3)}/>`,
  flag: (P: Pal) =>
    `<rect x="-24" y="-44" width="6" height="88" rx="2" fill="${P.slate}"/><path d="M-18 -42 Q6 -54 32 -40 L32 -10 Q6 -24 -18 -12Z" fill="${P.a}" ${st(P.f)}/>`,
  factory: (P: Pal) =>
    `<rect x="14" y="-40" width="12" height="40" fill="${P.b}" ${st(P.f)}/><circle cx="20" cy="-46" r="8" fill="${P.w}" opacity=".95" ${st(P.f, 2.5)}/><circle cx="28" cy="-56" r="6" fill="${P.w}" opacity=".9" ${st(P.f, 2.5)}/><polygon points="-38,38 -38,-8 -18,-22 -18,-8 2,-22 2,-8 22,-22 38,-8 38,38" fill="${P.a}" ${st(P.f)}/>${win(4, 1, -30, 6, 17, 0, 10, 10, P.w)}`,
  tower: (P: Pal) =>
    `<g stroke="#8E9DB3" stroke-width="4" stroke-linecap="round" fill="none"><path d="M-16 44 L0 -26 L16 44"/><path d="M-11 22 L11 22 M-7 4 L7 4 M-12 22 L7 4 M12 22 L-7 4 M-15 40 L11 22 M15 40 L-11 22"/></g><line x1="0" y1="-26" x2="0" y2="-38" stroke="#8E9DB3" stroke-width="4" stroke-linecap="round"/><circle cy="-40" r="5" fill="${P.a}"/><g fill="none" stroke="${P.a}" stroke-width="4" stroke-linecap="round"><path d="M-14 -50 A20 20 0 0 1 14 -50" transform="translate(0 6)"/><path d="M-24 -56 A32 32 0 0 1 24 -56" transform="translate(0 8)"/></g>`,
  shield: (P: Pal) =>
    `<path d="M0 -42 L32 -30 L32 4 C32 24 14 36 0 44 C-14 36 -32 24 -32 4 L-32 -30Z" fill="${P.a}" ${st(P.f)}/><path d="M-14 2 L-4 12 L16 -10" fill="none" stroke="${P.w}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  book: (P: Pal) =>
    `<path d="M0 -22 C-12 -32 -30 -32 -42 -26 L-42 28 C-30 22 -12 22 0 32Z" fill="${P.w}" ${st(P.f)}/><path d="M0 -22 C12 -32 30 -32 42 -26 L42 28 C30 22 12 22 0 32Z" fill="${P.w}" ${st(P.f)}/><path d="M-34 -14 Q-18 -18 -8 -12 M-34 -2 Q-18 -6 -8 0 M-34 10 Q-18 6 -8 12" stroke="${P.a}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M34 -14 Q18 -18 8 -12 M34 -2 Q18 -6 8 0" stroke="${P.b}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  magnifier: (P: Pal) =>
    `<line x1="12" y1="12" x2="36" y2="36" stroke="${P.slate}" stroke-width="13" stroke-linecap="round"/><line x1="12" y1="12" x2="36" y2="36" stroke="${P.a}" stroke-width="6" stroke-linecap="round"/><circle cx="-8" cy="-8" r="26" fill="${P.w}" fill-opacity=".7" ${st(P.f, 5)}/>`,
  heart: (P: Pal) =>
    `<path d="M0 34 C-46 2 -30 -36 0 -14 C30 -36 46 2 0 34Z" fill="${P.a}" ${st(P.f)}/>`,
  scale: (P: Pal) =>
    `<rect x="-3" y="-34" width="6" height="70" fill="${P.slate}"/><rect x="-22" y="34" width="44" height="8" rx="3" fill="${P.slate}"/><line x1="-34" y1="-30" x2="34" y2="-30" stroke="${P.slate}" stroke-width="5" stroke-linecap="round"/><path d="M-42 -4 L-26 -4 L-34 -28Z M26 -4 L42 -4 L34 -28Z" fill="none" ${st(P.f, 2.5)}/><path d="M-44 -4 Q-34 10 -24 -4Z" fill="${P.a}" ${st(P.f, 3)}/><path d="M24 -4 Q34 10 44 -4Z" fill="${P.b}" ${st(P.f, 3)}/>`,

  // ---- prop bergaya lembut (warna natural, tanpa garis tepi) ----
  calendar: (P: Pal) =>
    `<rect x="-36" y="-38" width="72" height="80" rx="9" fill="${P.paper}"/><path d="M-36 -29 a9 9 0 0 1 9 -9 h54 a9 9 0 0 1 9 9 v15 h-72z" fill="${P.slateDark}"/><circle cx="-18" cy="-39" r="3.5" fill="${P.dark}"/><circle cx="18" cy="-39" r="3.5" fill="${P.dark}"/><text x="0" y="-20" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Poppins">${P.txt2 || ""}</text><text x="0" y="${(P.txt || "").length > 2 ? 26 : 29}" text-anchor="middle" font-size="${(P.txt || "").length > 2 ? 24 : 40}" font-weight="800" fill="${P.dark}" font-family="Poppins">${P.txt || ""}</text>`,
  money: (P: Pal) =>
    [3, 2, 1, 0]
      .map(
        (i) =>
          `<rect x="-34" y="${-14 + i * 10}" width="68" height="26" rx="5" fill="#D9576B"/><rect x="-7" y="${-14 + i * 10}" width="14" height="26" fill="#F6E7EA"/>`,
      )
      .join("") +
    `<circle cx="0" cy="-1" r="6" fill="#F6E7EA" opacity=".0"/><rect x="-26" y="-9" width="14" height="5" rx="2" fill="#F6E7EA" opacity=".8"/>`,
  helicopter: (P: Pal) =>
    `<rect x="14" y="-8" width="36" height="7" rx="3" fill="#E4E7EE"/><circle cx="50" cy="-5" r="7" fill="none" stroke="#9AA6BA" stroke-width="2.5"/><ellipse cx="-6" cy="2" rx="30" ry="19" fill="#fff"/><path d="M-35 5 C-20 26 12 26 24 5 L23 12 C10 30 -22 30 -34 12Z" fill="#E5484D"/><path d="M-32 -1 a24 16 0 0 1 24 -14 l0 14z" fill="#7CC4F5"/><rect x="-8" y="-24" width="4" height="8" fill="#4B5568"/><line x1="-46" y1="-25" x2="34" y2="-25" stroke="#4B5568" stroke-width="3.5" stroke-linecap="round"/><path d="M-26 26 H12 M-20 20 V26 M6 20 V26" stroke="#4B5568" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  bucket: (P: Pal) =>
    `<path d="M-14 -22 Q0 -42 14 -22" fill="none" stroke="#8892A6" stroke-width="3"/><path d="M-20 -14 L20 -14 L14 28 L-14 28Z" fill="#FF9F43"/><rect x="-23" y="-19" width="46" height="8" rx="4" fill="#FFB866"/><path d="M-12 -4 L-9 22" stroke="#E5802A" stroke-width="3" opacity=".6"/>`,
  fire: (P: Pal) =>
    `<path d="M0 -44 C14 -24 30 -14 28 8 C26 28 12 38 0 38 C-14 38 -28 28 -28 8 C-28 -6 -18 -12 -14 -24 C-8 -14 -4 -22 0 -44Z" fill="#FF6A1A"/><path d="M0 -8 C8 4 16 10 14 22 C12 32 6 36 0 36 C-8 36 -14 32 -14 22 C-14 10 -6 2 0 -8Z" fill="#FFC93C"/>`,
  drop: (P: Pal) =>
    `<path d="M0 -40 C14 -16 28 -2 28 14 C28 30 16 40 0 40 C-16 40 -28 30 -28 14 C-28 -2 -14 -16 0 -40Z" fill="#4FB3FF"/><ellipse cx="-10" cy="14" rx="5" ry="9" fill="#fff" opacity=".45" transform="rotate(15 -10 14)"/>`,
  raincloud: (P: Pal) =>
    `<path d="M-30 10 C-48 10 -48 -12 -28 -14 C-26 -36 6 -42 14 -22 C34 -32 52 -10 40 8 C48 12 40 14 34 12Z" fill="#8A97AD"/>${[-20, 0, 20].map((x, i) => `<line x1="${x}" y1="${22 + i * 4}" x2="${x - 6}" y2="${36 + i * 4}" stroke="#4FB3FF" stroke-width="4" stroke-linecap="round"/>`).join("")}`,
  document: (P: Pal) =>
    `<path d="M-28 -40 H12 L30 -22 V40 a6 6 0 0 1 -6 6 H-22 a6 6 0 0 1 -6 -6Z" fill="${P.paper}"/><path d="M12 -40 V-24 a2 2 0 0 0 2 2 H30Z" fill="#C9C3B8"/><text x="-20" y="-12" font-size="10" font-weight="800" fill="${P.dark}" font-family="Poppins">${P.txt || ""}</text><g stroke="#9AA3B2" stroke-width="3.5" stroke-linecap="round"><line x1="-20" y1="2" x2="20" y2="2"/><line x1="-20" y1="12" x2="20" y2="12"/><line x1="-20" y1="22" x2="8" y2="22"/></g>`,
  lock: (P: Pal) =>
    `<path d="M-14 -4 V-16 a14 14 0 0 1 28 0 V-4" fill="none" stroke="#C9D1DD" stroke-width="9" stroke-linecap="round"/><rect x="-26" y="-6" width="52" height="42" rx="9" fill="#FFD23F"/><circle cx="0" cy="12" r="5.5" fill="${P.dark}"/><rect x="-2.5" y="14" width="5" height="12" rx="2" fill="${P.dark}"/>`,
  clock: (P: Pal) =>
    `<circle r="36" fill="#8E9DB3"/><circle r="30" fill="${P.paper}"/><g stroke="${P.dark}" stroke-linecap="round"><line x1="0" y1="0" x2="0" y2="-20" stroke-width="5"/><line x1="0" y1="0" x2="14" y2="6" stroke-width="5"/></g><circle r="3.5" fill="${P.dark}"/>${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-26" x2="0" y2="-23" stroke="${P.dark}" stroke-width="2" transform="rotate(${i * 30})"/>`).join("")}`,
  megaphone: (P: Pal) =>
    `<path d="M-32 -10 L16 -32 L16 32 L-32 10Z" fill="#FF6B4A"/><rect x="-40" y="-12" width="12" height="24" rx="4" fill="#E5484D"/><rect x="14" y="-34" width="8" height="68" rx="4" fill="#FFB1A0"/><path d="M-26 10 L-18 34 L-8 34 L-12 14Z" fill="#4B5568"/><g stroke="#FFD23F" stroke-width="4" stroke-linecap="round" fill="none"><path d="M30 -14 q8 14 0 28"/><path d="M38 -24 q14 24 0 48"/></g>`,
  trophy: (P: Pal) =>
    `<path d="M-22 -36 H22 V-12 a22 22 0 0 1 -44 0Z" fill="#FFC93C"/><path d="M-22 -30 H-34 a10 14 0 0 0 12 22 M22 -30 H34 a10 14 0 0 1 -12 22" fill="none" stroke="#FFC93C" stroke-width="6"/><rect x="-5" y="8" width="10" height="16" fill="#E0A800"/><rect x="-18" y="24" width="36" height="12" rx="4" fill="#E0A800"/><path d="M0 -28 l4 9 10 1 -8 7 2 10 -8 -5 -8 5 2 -10 -8 -7 10 -1z" fill="#FFF3C4" opacity=".8"/>`,
  truck: (P: Pal) =>
    `<rect x="-46" y="-26" width="58" height="42" rx="5" fill="${P.paper}"/><path d="M12 -16 H30 L44 -2 V16 H12Z" fill="#FF8A3D"/><path d="M18 -10 H29 L38 0 H18Z" fill="#7CC4F5"/><circle cx="-26" cy="18" r="9" fill="#2A3142"/><circle cx="28" cy="18" r="9" fill="#2A3142"/><circle cx="-26" cy="18" r="3.5" fill="#8E9DB3"/><circle cx="28" cy="18" r="3.5" fill="#8E9DB3"/>`,
  plane: (P: Pal) =>
    `<ellipse cx="0" cy="0" rx="42" ry="9" fill="#fff"/><path d="M-34 -4 L-44 -22 L-30 -22 L-18 -4Z" fill="#E4E7EE"/><path d="M-6 2 L12 28 L22 28 L12 2Z" fill="#C9D1DD"/><path d="M-6 -2 L10 -26 L20 -26 L12 -2Z" fill="#E4E7EE"/><g fill="#5BB5F0">${[-18, -8, 2, 12, 22].map((x) => `<circle cx="${x}" cy="-2" r="2.2"/>`).join("")}</g><path d="M30 -3 Q40 -2 40 2 Q34 3 28 2Z" fill="#7CC4F5"/>`,
  camera: (P: Pal) =>
    `<rect x="-36" y="-20" width="72" height="50" rx="9" fill="#8E9DB3"/><rect x="-22" y="-30" width="22" height="12" rx="4" fill="#8E9DB3"/><circle cx="0" cy="5" r="19" fill="#2A3142"/><circle cx="0" cy="5" r="11" fill="#4FB3FF"/><circle cx="-4" cy="1" r="3" fill="#fff" opacity=".7"/><circle cx="26" cy="-10" r="3.5" fill="#FFD23F"/>`,
  lunchbox: (P: Pal) =>
    `<rect x="-42" y="-28" width="84" height="56" rx="11" fill="#A9B6C8"/><rect x="-36" y="-22" width="44" height="44" rx="8" fill="#C9D3E0"/><rect x="12" y="-22" width="24" height="20" rx="6" fill="#C9D3E0"/><rect x="12" y="2" width="24" height="20" rx="6" fill="#C9D3E0"/><path d="M-32 14 a16 16 0 0 1 32 0z" fill="#fff"/><path d="M14 -10 a10 8 0 0 1 20 0z" fill="#3DAE6B"/><circle cx="24" cy="12" r="6" fill="#fff"/><circle cx="24" cy="12" r="3" fill="#FFB800"/>`,
  memo: (P: Pal) =>
    `<rect x="-36" y="-30" width="72" height="60" rx="3" fill="${P.paper}"/><line x1="-26" y1="-14" x2="26" y2="-14" stroke="#9AA3B2" stroke-width="3.5" stroke-linecap="round"/><line x1="-26" y1="0" x2="26" y2="0" stroke="#9AA3B2" stroke-width="3.5" stroke-linecap="round"/><line x1="-26" y1="14" x2="6" y2="14" stroke="#9AA3B2" stroke-width="3.5" stroke-linecap="round"/>`,
};
