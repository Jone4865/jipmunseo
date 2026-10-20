// 움직임(anime.js 3.2.2, QA 5바퀴) — 두 군데만: 결과가 나오면 확인 표시를 도장처럼 찍고, 줄인 비율을 0부터 세어 올려요.
// 처음 화면 무게를 늘리지 않게 결과가 처음 나올 때 따로 받아요. 움직임을 줄인 기기면 아무것도 하지 않아요.
// 둘 다 모양(transform)과 글자만 바꿔서 단추 자리는 움직이지 않아요(알약은 다 센 폭으로 먼저 잡아 둬요).
type Anime = typeof import("animejs/lib/anime.es.js").default;

let animeP: Promise<Anime> | null = null;
const loadAnime = (): Promise<Anime> => (animeP ||= import("animejs/lib/anime.es.js").then((m) => m.default).catch((e) => { animeP = null; throw e; }));
export const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** '52% 줄었어요' → 52. 세어 올릴 글이 아니면 null */
export function countUpTarget(text: string): number | null {
  const m = /^(\d{1,3})% 줄었어요$/.exec(text.trim());
  const n = m ? Number(m[1]) : NaN;
  return n >= 2 && n <= 100 ? n : null;
}

/** 결과 상자 하나에: 제목 앞 확인 표시를 '쾅' 찍고 테두리·체크를 그려요. 줄인 비율 알약은 0부터 */
export function stampResult(res: HTMLElement): void {
  if (reducedMotion()) return;
  const svg = res.querySelector<SVGSVGElement>("h2 svg");
  const pill = res.querySelector<HTMLElement>("h2 .pill.good");
  const target = pill ? countUpTarget(pill.textContent || "") : null;
  if (!svg && target === null) return;
  // 받는 동안 다 보였다가 다시 사라지지 않게 먼저 숨겨 둬요
  if (svg) svg.style.opacity = "0";
  const final = pill?.textContent || "";
  if (pill && target !== null) { pill.style.minWidth = `${Math.ceil(pill.getBoundingClientRect().width)}px`; pill.textContent = final.replace(/^\d+/, "0"); }
  const restore = () => { if (svg) svg.style.opacity = ""; if (pill) pill.textContent = final; };
  loadAnime().then((anime) => {
    if (!res.isConnected) return restore();
    if (svg) {
      svg.style.opacity = "";
      svg.style.transformOrigin = "50% 50%";
      anime({ targets: svg, scale: [1.9, 0.9, 1], rotate: [-16, 0], opacity: [0, 1], duration: 420, easing: "easeOutQuad" });
      const lines = svg.querySelectorAll<SVGGeometryElement>("circle, path");
      lines.forEach((el) => { const len = el.getTotalLength?.() || 60; el.style.strokeDasharray = String(len); el.style.strokeDashoffset = String(len); });
      anime({ targets: lines, strokeDashoffset: 0, duration: 300, delay: (_: unknown, i: number) => 120 + i * 140, easing: "easeOutCubic",
        complete: () => lines.forEach((el) => { el.style.strokeDasharray = ""; el.style.strokeDashoffset = ""; }) });
    }
    if (pill && target !== null) {
      const o = { n: 0 };
      anime({ targets: o, n: target, duration: 650, delay: 180, easing: "easeOutQuad", round: 1,
        update: () => { if (pill.isConnected) pill.textContent = final.replace(/^\d+/, String(o.n)); },
        complete: () => { pill.textContent = final; } });
    }
  }).catch(restore);
}
