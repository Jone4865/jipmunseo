// 손가락·마우스 누름 거르기 — 화면이 바뀐 바로 뒤, 같은 자리의 두 번째 누름이 바뀐 화면의 다른 단추에 닿지 않게 해요(QA 4바퀴, 2026-10-20).
// 예전에는 목록의 '빼기'를 두 번 톡톡 누르면 그 자리로 올라온 다음 파일까지 빠지고, '모두 지우기'·'다른 PDF'를 두 번 누르면 다시 커진
// 파일 넣는 곳에 닿아 파일 고르기 창이 열리고, '다른 형식으로 저장'을 두 번 누르면 밑에서 올라온 '텍스트' 카드가 골라졌어요.
// 자판(Enter·Space)으로 누른 것과 스크립트가 만든 누름은 그대로 둬요. 갓생 js/tap.ts 와 같은 방식이에요.

/** 누름 이벤트에서 보는 것만 — 사람이 누른 것(isTrusted)인지, 손가락·마우스(detail 1 이상)인지 자판(detail 0)인지, 어디를 눌렀는지 */
export interface TapLike { isTrusted: boolean; detail: number; target?: EventTarget | null; clientX?: number; clientY?: number }
/** 화면 위 한 점(clientX·clientY) */
export interface TapPoint { x: number; y: number }
/** contains 만 있으면 돼요(시험에서 DOM 없이 쓰려고) */
export interface TapScope { contains(other: Node | null): boolean }

export interface TapGuard {
  /**
   * 지금부터 ms 동안 손가락·마우스 누름을 받지 않아요(이미 더 길게 잡혀 있으면 그대로).
   * scope 를 주면 그 안의 누름만 걸러요 — 목록 줄이 옮겨졌을 때 목록 밖의 '합치기'·'이름순' 같은 단추까지 0.9초 막지 않게(QA 5바퀴)
   * at 을 주면 그 점 둘레(TAP_SLOP_PX)의 누름도 걸러요 — 마지막 줄을 빼서 목록이 짧아지면 그 자리로 목록 밖의 '합치기'·다른 도구 링크가
   * 올라와서, 두 번 톡톡의 두 번째 누름이 합치기를 시작하거나 다른 도구로 넘어갔어요(버그 6차)
   */
  hold(ms?: number, scope?: TapScope | null, at?: TapPoint | null): void;
  /** 받지 않는 동안인지(target·점을 주면 그 자리에 걸린 것만 봐요) */
  active(target?: EventTarget | null, x?: number, y?: number): boolean;
  /** 이 누름을 거를지 */
  blocks(e: TapLike): boolean;
}

/**
 * 거르는 시간(ms) — 두 번 톡톡의 두 번째 누름은 0.4초 간격도 0.8초 간격도 걸러요(0.6초로 해 보니 0.8초 간격의 두 번째 누름이
 * 다음 파일을 빼고 파일 고르기 창을 열었어요). 바뀐 자리를 보고 누르는 다음 동작은 거의 늦지 않아요
 */
export const TAP_HOLD_MS = 900;
/** 같은 자리로 보는 거리(px) — 손가락 두 번 톡톡은 몇 px 안에 떨어져요. 옆 단추(가운데끼리 52px 남짓)는 바로 받아요 */
export const TAP_SLOP_PX = 32;

export function makeTapGuard(now: () => number = Date.now): TapGuard {
  // 화면 전체(scope 없음) 하나와 목록마다 하나씩
  let all = 0;
  const scoped = new Map<TapScope, number>();
  let spots: { x: number; y: number; until: number }[] = [];
  const nearSpot = (x?: number, y?: number): boolean => {
    const t = now();
    spots = spots.filter((s) => s.until > t);
    return x !== undefined && y !== undefined && spots.some((s) => Math.hypot(s.x - x, s.y - y) <= TAP_SLOP_PX);
  };
  const inScope = (target: EventTarget | null | undefined): boolean => {
    const t = now();
    for (const [sc, until] of scoped) {
      if (until <= t) { scoped.delete(sc); continue; }
      if (target && sc.contains(target as Node)) return true;
    }
    return false;
  };
  const active = (target?: EventTarget | null, x?: number, y?: number): boolean => now() < all || inScope(target) || nearSpot(x, y);
  return {
    hold(ms = TAP_HOLD_MS, scope = null, at = null) {
      const until = now() + ms;
      if (!scope && !at) all = Math.max(all, until);
      if (scope) scoped.set(scope, Math.max(scoped.get(scope) ?? 0, until));
      if (at) spots.push({ x: at.x, y: at.y, until });
    },
    active,
    blocks(e) { return e.isTrusted && e.detail !== 0 && active(e.target, e.clientX, e.clientY); },
  };
}

/** 이 페이지의 거르개 하나 */
export const taps = makeTapGuard();
/** 화면이 바뀌는 동작 뒤에 불러요 */
export const holdTaps = (ms?: number, scope?: TapScope | null, at?: TapPoint | null): void => taps.hold(ms, scope, at);

/** 문서에 한 번 걸어요(app.ts). 누르는 순간(pointerdown)도 막아 포커스가 밑의 칸으로 옮겨 가거나 칠하기가 시작되지 않게 */
export function installTapGuard(doc: Document): void {
  doc.addEventListener("click", (e) => {
    if (!taps.blocks(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  doc.addEventListener("pointerdown", (e) => {
    if (!e.isTrusted || !taps.active(e.target, e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
