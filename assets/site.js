const THEME_KEY = "hercent-theme";
const root = document.documentElement;
const body = document.body;
const themeToggle = document.querySelector("[data-theme-toggle]");
const forcedTheme = body?.dataset.forceTheme;
const siteScript =
  document.currentScript ||
  Array.from(document.scripts).find(
    (script) => script.src.includes("/assets/site.js") || script.src.endsWith("assets/site.js")
  );
const assetBaseUrl = siteScript?.src ? new URL(".", siteScript.src) : new URL("./assets/", window.location.href);

const getPreferredTheme = () => {
  if (forcedTheme === "light" || forcedTheme === "dark") {
    return forcedTheme;
  }

  const savedTheme = localStorage.getItem(THEME_KEY);

  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme) => {
  root.dataset.theme = theme;

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
    );
    themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
};

applyTheme(getPreferredTheme());

if (themeToggle && !forcedTheme) {
  themeToggle.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });
} else if (themeToggle && forcedTheme) {
  themeToggle.hidden = true;
}

const initSpaceBackdrop = () => {
  if (!body || body.classList.contains("error-page") || document.querySelector(".space-backdrop")) {
    return;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  canvas.className = "space-backdrop";
  canvas.setAttribute("aria-hidden", "true");
  body.prepend(canvas);

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let stars = [];
  let animationFrame = 0;
  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const pickStarTone = () => {
    const roll = Math.random();

    if (roll < 0.68) {
      return {
        dark: [248, 250, 252],
        light: [255, 255, 255]
      };
    }

    if (roll < 0.86) {
      return {
        dark: [191, 219, 254],
        light: [219, 234, 254]
      };
    }

    if (roll < 0.96) {
      return {
        dark: [254, 240, 138],
        light: [255, 247, 214]
      };
    }

    return {
      dark: [226, 232, 240],
      light: [241, 245, 249]
    };
  };
  const toRgba = (tone, alpha) => `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${alpha})`;
  const createStar = () => {
    const layerRoll = Math.random();
    let radius = 0;
    let alpha = 0;
    let glow = 0;
    let twinkleStrength = 0;
    let driftScale = 0;

    if (layerRoll < 0.76) {
      radius = randomBetween(0.14, 0.52);
      alpha = randomBetween(0.10, 0.30);
      twinkleStrength = randomBetween(0.02, 0.07);
      driftScale = 0.010;
    } else if (layerRoll < 0.95) {
      radius = randomBetween(0.50, 1.04);
      alpha = randomBetween(0.24, 0.50);
      glow = randomBetween(0.6, 1.4);
      twinkleStrength = randomBetween(0.05, 0.11);
      driftScale = 0.018;
    } else {
      radius = randomBetween(1.05, 1.85);
      alpha = randomBetween(0.42, 0.80);
      glow = randomBetween(1.4, 2.8);
      twinkleStrength = randomBetween(0.08, 0.16);
      driftScale = 0.028;
    }

    const tone = pickStarTone();

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius,
      alpha,
      glow,
      speed: randomBetween(0.00008, 0.00028),
      driftX: (Math.random() - 0.5) * driftScale,
      driftY: (Math.random() - 0.5) * driftScale * 0.35,
      phase: Math.random() * Math.PI * 2,
      twinkleStrength,
      flare: radius > 1.2 && Math.random() > 0.6,
      darkTone: tone.dark,
      lightTone: tone.light
    };
  };

  const createStars = () => {
    const count = Math.max(180, Math.round((width * height) / 7600));

    stars = Array.from({ length: count }, createStar).sort((left, right) => left.radius - right.radius);
  };

  const resizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    createStars();
  };

  const drawBackdrop = (time = 0) => {
    const isDark = root.dataset.theme === "dark";

    context.clearRect(0, 0, width, height);

    stars.forEach((star) => {
      const twinkle = 1 + Math.sin(time * star.speed + star.phase) * star.twinkleStrength;
      const alpha = Math.max(0.04, star.alpha * twinkle * (isDark ? 1 : 0.78));
      const tone = isDark ? star.darkTone : star.lightTone;

      star.x += star.driftX;
      star.y += star.driftY;

      if (star.x < -12) {
        star.x = width + 12;
      } else if (star.x > width + 12) {
        star.x = -12;
      }

      if (star.y < -12) {
        star.y = height + 12;
      } else if (star.y > height + 12) {
        star.y = -12;
      }

      if (star.glow > 0) {
        context.beginPath();
        context.fillStyle = toRgba(tone, alpha * (isDark ? 0.16 : 0.10));
        context.arc(star.x, star.y, star.radius * (2.2 + star.glow), 0, Math.PI * 2);
        context.fill();
      }

      context.beginPath();
      context.fillStyle = toRgba(tone, alpha);
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();

      if (star.flare) {
        context.beginPath();
        context.strokeStyle = toRgba([255, 255, 255], alpha * (isDark ? 0.16 : 0.10));
        context.lineWidth = 0.55;
        context.moveTo(star.x - star.radius * 3.2, star.y);
        context.lineTo(star.x + star.radius * 3.2, star.y);
        context.moveTo(star.x, star.y - star.radius * 3.2);
        context.lineTo(star.x, star.y + star.radius * 3.2);
        context.stroke();
      }
    });
  };

  const animate = (time) => {
    drawBackdrop(time);
    animationFrame = window.requestAnimationFrame(animate);
  };

  resizeCanvas();
  drawBackdrop();

  if (!prefersReducedMotion) {
    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("beforeunload", () => {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
  });
};

initSpaceBackdrop();

const initBlackHoleBackdrop = () => {
  if (!body || body.classList.contains("error-page") || document.querySelector(".space-blackhole-shell")) {
    return;
  }

  const shell = document.createElement("div");
  shell.className = "space-blackhole-shell";
  shell.setAttribute("aria-hidden", "true");

  const glow = document.createElement("div");
  glow.className = "space-blackhole-glow";

  const video = document.createElement("video");
  video.className = "space-blackhole-video";
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";

  const source = document.createElement("source");
  source.src = new URL("blackhole.webm", assetBaseUrl).href;
  source.type = "video/webm";

  video.append(source);
  shell.append(glow, video);

  const backdrop = document.querySelector(".space-backdrop");

  if (backdrop) {
    backdrop.insertAdjacentElement("afterend", shell);
  } else {
    body.prepend(shell);
  }

  const playPromise = video.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {});
  }
};

initBlackHoleBackdrop();

const initTabbedWriteups = () => {
  const groups = document.querySelectorAll("[data-tab-group]");

  groups.forEach((group) => {
    const triggers = Array.from(group.querySelectorAll("[data-tab-trigger]"));
    const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));

    if (triggers.length === 0 || panels.length === 0) {
      return;
    }

    const activateTab = (targetId) => {
      triggers.forEach((trigger) => {
        const isActive = trigger.dataset.tabTrigger === targetId;
        trigger.classList.toggle("is-active", isActive);
        trigger.setAttribute("aria-selected", isActive ? "true" : "false");
        trigger.tabIndex = isActive ? 0 : -1;
      });

      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== targetId;
      });
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => activateTab(trigger.dataset.tabTrigger));
    });

    activateTab(triggers[0].dataset.tabTrigger);
  });
};

initTabbedWriteups();

const initDocumentViewers = () => {
  const viewers = document.querySelectorAll("[data-document-viewer]");

  viewers.forEach((viewer) => {
    const frame = viewer.querySelector("[data-document-frame]");
    const prevButton = viewer.querySelector("[data-document-prev]");
    const nextButton = viewer.querySelector("[data-document-next]");
    const currentTarget = viewer.querySelector("[data-document-current]");
    const totalTarget = viewer.querySelector("[data-document-total]");
    const pdfSrc = viewer.dataset.documentSrc;
    const totalPages = Number.parseInt(viewer.dataset.documentPages || "0", 10);

    if (!frame || !prevButton || !nextButton || !currentTarget || !pdfSrc) {
      return;
    }

    let currentPage = 1;
    const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 0;

    const render = () => {
      const pageFragment = `#page=${currentPage}&view=FitH`;
      frame.src = `${pdfSrc}${pageFragment}`;
      currentTarget.textContent = String(currentPage);

      if (totalTarget) {
        totalTarget.textContent = safeTotalPages > 0 ? String(safeTotalPages) : "-";
      }

      prevButton.disabled = currentPage <= 1;
      nextButton.disabled = safeTotalPages > 0 && currentPage >= safeTotalPages;
    };

    const movePage = (delta) => {
      const nextPage = currentPage + delta;

      if (nextPage < 1) {
        return;
      }

      if (safeTotalPages > 0 && nextPage > safeTotalPages) {
        return;
      }

      currentPage = nextPage;
      render();
    };

    prevButton.addEventListener("click", () => movePage(-1));
    nextButton.addEventListener("click", () => movePage(1));

    viewer.tabIndex = 0;
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePage(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        movePage(1);
      }
    });

    render();
  });
};

initDocumentViewers();

const yearTarget = document.querySelector("[data-year]");

if (yearTarget) {
  yearTarget.textContent = new Date().getFullYear();
}

const revealItems = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15
    }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
