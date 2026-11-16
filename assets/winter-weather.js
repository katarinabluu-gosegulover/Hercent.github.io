(() => {
  const hero = document.querySelector('[data-winter-scene]');
  const canvas = hero?.querySelector('.winter-weather');
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!ctx) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, flakes = [], frame = 0, last = 0, elapsed = 0, night = 0;
  const active = () => hero.classList.contains('ambient-running') && !document.hidden && !reduced.matches;
  const seedFlake = (initial = false) => ({
    x: Math.random() * width,
    y: initial ? height * (.38 + Math.random() * .62) : height * (.36 + Math.random() * .12),
    radius: .6 + Math.random() * 1.8,
    speed: 8 + Math.random() * 20,
    drift: 4 + Math.random() * 12,
    phase: Math.random() * Math.PI * 2,
    opacity: .25 + Math.random() * .5
  });
  const resize = () => {
    const bounds = hero.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, width <= 760 ? 1 : 1.5);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    flakes = Array.from({ length: width <= 760 ? 36 : 80 }, () => seedFlake(true));
  };
  const aurora = () => {
    if (night < .005) return;
    // Short vertical curtains follow a slowly changing spine, confined to the sky.
    ctx.globalCompositeOperation = 'screen';
    const step = width <= 760 ? 5 : 7;
    for (let band = 0; band < 2; band++) {
      for (let x = Math.floor(width * .28); x < width; x += step) {
        const u = x / width;
        const wave = Math.sin(u * 9 + elapsed * .18 + band * 1.7);
        const spine = height * (.12 + band * .06 + .035 * wave + .02 * Math.sin(u * 22 - elapsed * .12));
        const length = height * (.08 + .05 * (1 + Math.sin(u * 17 + elapsed * .21)) / 2);
        const strength = Math.sin((u - .28) / .72 * Math.PI) * night * (.12 + .05 * Math.sin(u * 31 + elapsed * .3));
        const gradient = ctx.createLinearGradient(x, spine - length, x, spine + length * .45);
        gradient.addColorStop(0, 'rgba(70,210,192,0)');
        gradient.addColorStop(.65, `rgba(87,235,183,${strength})`);
        gradient.addColorStop(.82, `rgba(132,250,214,${strength * 1.6})`);
        gradient.addColorStop(1, 'rgba(75,214,205,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, spine - length, step, length * 1.45);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  const snow = dt => {
    flakes.forEach((flake, index) => {
      flake.x += (flake.drift + Math.sin(elapsed * .6 + flake.phase) * 9) * dt;
      flake.y += flake.speed * dt;
      if (flake.y > height + 5 || flake.x > width + 5) { flakes[index] = seedFlake(); return; }
      const fade = Math.min(1, Math.max(0, (flake.y / height - .38) / .18));
      // Keep the headline area calmer while leaving the river visibly alive.
      const textMask = flake.x < width * .48 && flake.y < height * .72 ? .25 : 1;
      ctx.fillStyle = `rgba(238,249,255,${flake.opacity * fade * textMask})`;
      ctx.beginPath(); ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2); ctx.fill();
    });
  };
  const tick = timestamp => {
    frame = 0;
    if (!active()) return;
    if (!last) last = timestamp;
    const delta = timestamp - last;
    if (delta >= 1000 / 30) {
      const dt = Math.min(delta / 1000, .08); last = timestamp; elapsed += dt;
      const target = root.dataset.theme === 'dark' ? 1 : 0;
      night += (target - night) * Math.min(1, dt * 2.5);
      ctx.clearRect(0, 0, width, height); aurora(); snow(dt);
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (active()) { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } }
    else { cancelAnimationFrame(frame); frame = 0; last = 0; ctx.clearRect(0, 0, width, height); }
  };
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);
  document.addEventListener('winter:motion', sync);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  window.addEventListener('pageshow', sync);
  sync();
})();
