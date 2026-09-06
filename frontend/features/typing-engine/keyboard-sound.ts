const SOUND_SRC = "/keyboard-click.wav";
const VOLUME = 0.3;
/** 동시에 겹쳐 울릴 수 있도록 오디오 인스턴스를 돌려쓴다. */
const POOL_SIZE = 4;

let pool: HTMLAudioElement[] = [];
let cursor = 0;

function ensurePool() {
  if (typeof Audio === "undefined") return null;
  if (pool.length) return pool;

  pool = Array.from({ length: POOL_SIZE }, () => {
    const audio = new Audio(SOUND_SRC);
    audio.volume = VOLUME;
    audio.preload = "auto";
    return audio;
  });
  return pool;
}

/** 사운드 모드를 켤 때 미리 받아둔다. 첫 타건이 늦게 울리는 것을 막는다. */
export function preloadKeyboardSound() {
  ensurePool()?.forEach((audio) => audio.load());
}

export function playKeyboardSound() {
  const instances = ensurePool();
  if (!instances) return;

  const audio = instances[cursor];
  cursor = (cursor + 1) % instances.length;
  audio.currentTime = 0;
  // 사용자 제스처 전이거나 탭이 백그라운드면 재생이 거부된다. 타이핑을 막을 이유는 없다.
  void audio.play().catch(() => {});
}
