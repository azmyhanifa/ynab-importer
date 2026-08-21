/** Keep a throwaway input focused during a tap so iOS will show the keyboard on a later-mounted field. */
export function iosFocusHandoff(getInput: () => HTMLInputElement | null) {
  if (typeof document === 'undefined') return;

  const temp = document.createElement('input');
  temp.type = 'text';
  temp.inputMode = 'text';
  temp.autocomplete = 'off';
  temp.setAttribute('autocomplete', 'off');
  temp.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;font-size:16px;border:0;padding:0;margin:0;opacity:0.01;';
  document.body.appendChild(temp);
  temp.focus();

  const started = Date.now();
  const tryFocus = () => {
    const el = getInput();
    if (el) {
      el.focus({ preventScroll: true });
      try {
        el.click();
      } catch {
        /* ignore */
      }
      temp.remove();
      return;
    }
    if (Date.now() - started > 900) {
      temp.remove();
      return;
    }
    requestAnimationFrame(tryFocus);
  };

  requestAnimationFrame(tryFocus);
}
