// კედლის ფონი ბზარის საფეხურის მიხედვით (FIXES_ROUND2 §7): wall.background_by_stage — მასივი crackStage-ის ინდექსით;
// null → უახლოესი წინა არა-null სურათი. სეზონის ცვლილებისას ~1.5 წმ cross-fade ორ ფენას შორის.

/** საფეხურისთვის სურათი: null-ზე უკან ვეძებთ უახლოეს არა-null-ს; არაფერი — null (პროცედურული ბათქაში). */
export function resolveBackground(list, stage) {
  if (!Array.isArray(list) || !list.length) return null;
  const s = Math.min(list.length - 1, Math.max(0, Number.parseInt(stage, 10) || 0));
  for (let i = s; i >= 0; i--) if (typeof list[i] === 'string' && list[i]) return list[i];
  return null;
}

/** DOM: ორი ფენა (#wall-photo-a / -b); ახალი სურათი ზედა ფენაზე ჩნდება opacity transition-ით. */
export function createWallBackground(list) {
  const wall = document.getElementById('wall');
  const layers = [document.getElementById('wall-photo-a'), document.getElementById('wall-photo-b')];
  let front = 0;
  let current = null;

  function set(stage, { instant = false } = {}) {
    const src = resolveBackground(list, stage);
    wall.classList.toggle('has-photo', Boolean(src));
    if (src === current) return;
    current = src;
    const next = layers[1 - front];
    const prev = layers[front];
    next.style.backgroundImage = src ? `url("${new URL(src, window.location.href).href}")` : 'none';
    next.dataset.src = src || '';
    if (instant) {
      next.style.transition = 'none';
      prev.style.transition = 'none';
    } else {
      next.style.transition = '';
      prev.style.transition = '';
    }
    next.classList.add('active');
    prev.classList.remove('active');
    front = 1 - front;
    wall.dataset.background = src || '';
  }

  return { set, current: () => current };
}
