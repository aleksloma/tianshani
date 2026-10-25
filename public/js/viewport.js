// Round 11 §1.3: ტელეფონზე კლავიატურა მხოლოდ ხილულ viewport-ს (visualViewport) ამცირებს — fixed sheet კი განლაგების
// viewport-ზეა გაზომილი და კლავიატურის ქვეშ რჩება. ღია sheet-ზე ხილული viewport-ის ზომა/პოზიცია CSS ცვლადებად იწერება
// (--vvh, --vvt), sheet მათ მიჰყვება. DOM-ის გარეშე (unit ტესტისთვის): target-ს მხოლოდ style.setProperty/removeProperty სჭირდება.

const KEYS = ['--vvh', '--vvt'];

/** visualViewport → CSS ცვლადები. */
export function viewportVars(vv) {
  return { '--vvh': `${vv.height}px`, '--vvt': `${vv.offsetTop}px` };
}

/**
 * sheet-ის მიბმა visualViewport-ზე. toggle(true) — გამოწერა (resize, scroll) და ცვლადები მაშინვე; განახლება
 * requestAnimationFrame-ით (ერთი კადრში); toggle(false) / stop() — გამოწერის მოხსნა და ცვლადების წაშლა.
 * API არ არის (ძველი ბრაუზერი) → არაფერს აკეთებს, sheet CSS-ის 100dvh-ზე რჩება.
 */
export function createViewportSync({ target, vv = globalThis.visualViewport, raf = globalThis.requestAnimationFrame, onChange = () => {} }) {
  let on = false;
  let pending = false;
  const apply = () => {
    pending = false;
    if (!on) return;
    const vars = viewportVars(vv);
    for (const k of KEYS) target.style.setProperty(k, vars[k]);
    onChange(vars);
  };
  const schedule = () => {
    if (pending || !on) return;
    pending = true;
    raf(apply);
  };
  function stop() {
    if (!on) return;
    on = false;
    pending = false;
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    for (const k of KEYS) target.style.removeProperty(k);
  }
  function toggle(want) {
    if (!want) { stop(); return; }
    if (on || !vv) return;
    on = true;
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    apply();
  }
  return { toggle, stop, active: () => on };
}
