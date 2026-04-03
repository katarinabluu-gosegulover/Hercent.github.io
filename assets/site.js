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

  const createStars = () => {
    const count = Math.max(90, Math.round((width * height) / 12000));

    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.4 + 0.2,
      alpha: Math.random() * 0.45 + 0.2,
      speed: Math.random() * 0.0006 + 0.0002,
      drift: (Math.random() - 0.5) * 0.04,
      phase: Math.random() * Math.PI * 2
    }));
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
      const twinkle = 0.55 + Math.sin(time * star.speed + star.phase) * 0.45;
      const alpha = star.alpha * twinkle;

      star.x += star.drift;

      if (star.x < -6) {
        star.x = width + 6;
      } else if (star.x > width + 6) {
        star.x = -6;
      }

      context.beginPath();
      context.fillStyle = isDark
        ? `rgba(226, 232, 240, ${alpha})`
        : `rgba(255, 255, 255, ${Math.min(alpha + 0.08, 0.75)})`;
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();

      if (star.radius > 1.1) {
        context.beginPath();
        context.fillStyle = isDark
          ? `rgba(96, 165, 250, ${alpha * 0.35})`
          : `rgba(147, 197, 253, ${alpha * 0.3})`;
        context.arc(star.x, star.y, star.radius * 2.4, 0, Math.PI * 2);
        context.fill();
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
