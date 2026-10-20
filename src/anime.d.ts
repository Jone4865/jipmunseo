// anime.js 3.2.2 — 쓰는 것만 적어요(motion.ts)
declare module "animejs/lib/anime.es.js" {
  interface AnimeParams { targets?: unknown; duration?: number; delay?: number | ((el: unknown, i: number) => number); easing?: string; update?: () => void; complete?: () => void; [prop: string]: unknown }
  interface AnimeInstance { finished: Promise<void>; pause(): void }
  const anime: ((p: AnimeParams) => AnimeInstance) & { remove(targets: unknown): void };
  export default anime;
}
