(() => {
  const controls = [...document.querySelectorAll('[data-motion-toggle]')];
  if (!controls.length) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const regions = [...document.querySelectorAll('[data-analysis-stage],.research-map')];
  const visible = new Set();
  let enabled = true;
  try { enabled = localStorage.getItem('hercent-ambient-enabled') !== 'false'; } catch (_) {}
  const render = () => {
    const allowed = enabled && !preference.matches;
    root.classList.toggle('ambient-enabled', allowed);
    regions.forEach(region => region.classList.toggle('ambient-running', allowed && !document.hidden && visible.has(region)));
    controls.forEach(button => {
      button.hidden = false;
      button.disabled = preference.matches;
      button.setAttribute('aria-pressed', String(allowed));
      button.textContent = preference.matches ? '동작 줄임' : enabled ? '모션 켬' : '모션 끔';
    });
  };
  controls.forEach(button => button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('hercent-ambient-enabled', String(enabled)); } catch (_) {}
    render();
  }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      render();
    });
    regions.forEach(region => observer.observe(region));
  }
  preference.addEventListener('change', render);
  document.addEventListener('visibilitychange', render);
  const map = document.querySelector('.research-map');
  if (map) {
    const nodes = [...map.querySelectorAll('.map-node')];
    let hovered = null;
    const highlight = () => {
      const focused = nodes.find(node => node.contains(document.activeElement));
      const index = nodes.indexOf(focused || hovered);
      map.querySelectorAll('[data-map-route]').forEach(route => route.classList.toggle('route-active', Number(route.dataset.mapRoute) === index));
    };
    nodes.forEach(node => {
      node.addEventListener('pointerenter', () => { hovered = node; highlight(); });
      node.addEventListener('pointerleave', () => { hovered = null; highlight(); });
    });
    map.addEventListener('focusin', highlight);
    map.addEventListener('focusout', () => queueMicrotask(highlight));
  }
  render();
})();
