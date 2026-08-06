/**
 * App-Shell: Tabumschaltung und Ladeindikator.
 * Feature-Module bauen ihren eigenen DOM in ihren Sidebar-Container.
 */

/** Verdrahtet die Tabs "3D-Modell" / "2D-Pläne". */
export function initTabs(onTabChange?: (tabId: string) => void): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#app-tabs .tab-btn'),
  );
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('#app-main .tab-panel'),
  );

  function activate(tabId: string): void {
    for (const btn of buttons) {
      const on = btn.dataset.tab === tabId;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    for (const panel of panels) {
      const on = panel.id === tabId;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    }
    onTabChange?.(tabId);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => activate(btn.dataset.tab ?? 'tab-model'));
  }
}

/** Text des Ladeindikators aktualisieren. */
export function setLoading(text: string): void {
  const box = document.getElementById('loading');
  const label = document.getElementById('loading-text');
  if (!box || !label) return;
  box.hidden = false;
  box.classList.remove('is-error');
  label.textContent = text;
}

/** Ladeindikator ausblenden. */
export function hideLoading(): void {
  const box = document.getElementById('loading');
  if (box) box.hidden = true;
}

/** Ladeindikator in eine dauerhaft sichtbare Fehlermeldung verwandeln. */
export function showLoadError(text: string): void {
  const box = document.getElementById('loading');
  const label = document.getElementById('loading-text');
  if (!box || !label) return;
  box.hidden = false;
  box.classList.add('is-error');
  label.textContent = text;
}
