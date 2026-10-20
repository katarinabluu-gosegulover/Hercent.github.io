(() => {
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const pointerPreference = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 761px)");
  const stage = document.querySelector("[data-analysis-stage]");
  if (stage) {
    const resetTilt = () => {
      stage.style.removeProperty("--tilt-x");
      stage.style.removeProperty("--tilt-y");
    };
    stage.addEventListener("pointermove", (event) => {
      if (motionPreference.matches || !pointerPreference.matches) return;
      const bounds = stage.getBoundingClientRect();
      const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
      const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
      stage.style.setProperty("--tilt-x", `${-y * 8}deg`);
      stage.style.setProperty("--tilt-y", `${x * 8}deg`);
    });
    stage.addEventListener("pointerleave", resetTilt);
    motionPreference.addEventListener("change", resetTilt);
    pointerPreference.addEventListener("change", resetTilt);
    window.addEventListener("blur", resetTilt);
  }

  // Content is always visible. Scroll accents only move it, never gate opacity.
  if ("IntersectionObserver" in window) {
    const activeAnimations = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        if (motionPreference.matches || !pointerPreference.matches || !target.animate) return;
        const animation = target.animate(
          [{ transform: "translateY(14px)" }, { transform: "translateY(0)" }],
          { duration: 550, easing: "cubic-bezier(.2,.7,.3,1)" }
        );
        activeAnimations.add(animation);
        const cleanup = () => activeAnimations.delete(animation);
        animation.onfinish = cleanup;
        animation.oncancel = cleanup;
      });
    }, { threshold: 0 });
    document.querySelectorAll(".case-study,.selected-section .section-heading,.path-card").forEach((element) => observer.observe(element));
    motionPreference.addEventListener("change", () => {
      if (motionPreference.matches) activeAnimations.forEach((animation) => animation.cancel());
    });
  }

  const root = document.documentElement;
  if (document.querySelector(".profile-cursor")) {
    let cursorEnabled = true;
    try { cursorEnabled = localStorage.getItem("hercent-cursor-enabled") !== "false"; } catch (_) {}
    const cursorControls = document.querySelectorAll("[data-cursor-toggle]");
    const renderCursor = () => {
      const enabled = cursorEnabled && !motionPreference.matches;
      root.classList.toggle("cursor-blink-enabled", enabled && !document.hidden);
      cursorControls.forEach((button) => {
        button.hidden = false;
        button.disabled = motionPreference.matches;
        button.setAttribute("aria-pressed", String(enabled));
        button.textContent = motionPreference.matches ? "동작 줄임" : enabled ? "커서 켬" : "커서 끔";
      });
    };
    cursorControls.forEach((button) => button.addEventListener("click", () => {
      cursorEnabled = !cursorEnabled;
      try { localStorage.setItem("hercent-cursor-enabled", String(cursorEnabled)); } catch (_) {}
      renderCursor();
    }));
    motionPreference.addEventListener("change", renderCursor);
    document.addEventListener("visibilitychange", renderCursor);
    renderCursor();
  }
  const toggle = document.querySelector("[data-theme-toggle]");
  const updateToggle = () => {
    if (!toggle) return;
    const dark = root.dataset.theme !== "light";
    toggle.setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
    toggle.setAttribute("aria-pressed", String(dark));
  };
  updateToggle();
  toggle?.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("hercent-theme", root.dataset.theme); } catch (_) {}
    updateToggle();
  });

  const search = document.querySelector("[data-post-search]");
  const focusSearch = () => {
    if (search) {
      search.focus();
      search.scrollIntoView({ block: "center", behavior: motionPreference.matches ? "instant" : "smooth" });
    }
  };
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && (target.isContentEditable || target.closest("input,textarea,select,[role='textbox'],[role='combobox']"))) return;
    const link = document.querySelector("[data-search-link]");
    if (!search && !link) return;
    event.preventDefault();
    if (search) focusSearch();
    else location.assign(`${link.href}#post-search`);
  });
  if (search) {
    const rows = Array.from(document.querySelectorAll(".post-list .post-row"));
    const entries = rows.map((row) => ({ row, text: row.textContent.normalize("NFKC").toLocaleLowerCase() }));
    const output = document.querySelector("[data-search-count]");
    const empty = document.querySelector("[data-search-empty]");
    const filter = () => {
      const words = search.value.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      entries.forEach(({ row, text }) => {
        row.hidden = !words.every((word) => text.includes(word));
        if (!row.hidden) count++;
      });
      if (output) output.textContent = `${count} / ${rows.length}개의 기록`;
      if (empty) empty.hidden = count !== 0;
    };
    search.addEventListener("input", filter);
    filter();
    if (location.hash === "#post-search") focusSearch();
  }

  // Keep every panel readable without JavaScript; enhance to tabs on initialization.
  document.querySelectorAll("[data-tab-group]").forEach((group, groupIndex) => {
    const triggers = Array.from(group.querySelectorAll("[data-tab-trigger]"));
    const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));
    if (!triggers.length || !panels.length) return;
    triggers.forEach((trigger, index) => {
      const panel = panels.find((item) => item.dataset.tabPanel === trigger.dataset.tabTrigger);
      if (!panel) return;
      trigger.id ||= `tab-${groupIndex}-${index}`;
      panel.id ||= `panel-${groupIndex}-${index}`;
      trigger.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", trigger.id);
    });
    const activate = (id, updateHash = true) => {
      if (!triggers.some((trigger) => trigger.dataset.tabTrigger === id)) return;
      triggers.forEach((trigger) => {
        const active = trigger.dataset.tabTrigger === id;
        trigger.classList.toggle("is-active", active);
        trigger.setAttribute("aria-selected", String(active));
        trigger.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== id; });
      if (updateHash && group.hasAttribute("data-tab-sync-hash")) {
        try { history.replaceState(null, "", `#${id}`); } catch (_) {}
      }
      document.dispatchEvent(new Event("hercent:tabchange"));
    };
    triggers.forEach((trigger, index) => {
      trigger.addEventListener("click", () => activate(trigger.dataset.tabTrigger));
      trigger.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % triggers.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + triggers.length) % triggers.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = triggers.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        triggers[next].focus();
        activate(triggers[next].dataset.tabTrigger);
      });
    });
    const syncFromHash = () => {
      if (!group.hasAttribute("data-tab-sync-hash")) return false;
      let hash;
      try { hash = decodeURIComponent(location.hash.slice(1)); } catch (_) { return false; }
      const anchor = document.getElementById(hash);
      const panel = anchor?.closest("[data-tab-panel]");
      const targetId = triggers.some((trigger) => trigger.dataset.tabTrigger === hash)
        ? hash : panel && group.contains(panel) ? panel.dataset.tabPanel : null;
      if (!targetId) return false;
      const revealAnchor = panel?.hidden && anchor !== panel;
      activate(targetId, false);
      if (revealAnchor) requestAnimationFrame(() => anchor.scrollIntoView({ behavior: "instant", block: "start" }));
      return true;
    };
    if (!syncFromHash()) activate(triggers[0].dataset.tabTrigger, false);
    window.addEventListener("hashchange", syncFromHash);
    document.addEventListener("hercent:headingsready", syncFromHash);
  });

  document.querySelectorAll("[data-document-deck]").forEach((viewer) => {
    const slides = Array.from(viewer.querySelectorAll("[data-document-slide]"));
    const prev = viewer.querySelector("[data-document-prev]");
    const next = viewer.querySelector("[data-document-next]");
    const current = viewer.querySelector("[data-document-current]");
    const total = viewer.querySelector("[data-document-total]");
    if (!slides.length || !prev || !next || !current) return;
    let page = 0;
    const render = () => {
      slides.forEach((slide, index) => { slide.hidden = index !== page; });
      current.textContent = String(page + 1);
      if (total) total.textContent = String(slides.length);
      prev.disabled = page === 0;
      next.disabled = page === slides.length - 1;
    };
    const move = (delta) => { page = Math.max(0, Math.min(slides.length - 1, page + delta)); render(); };
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    viewer.tabIndex = 0;
    viewer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    });
    render();
  });

})();
