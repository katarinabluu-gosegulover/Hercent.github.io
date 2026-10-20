(() => {
  const body = document.querySelector(".reading-article .article-body");
  if (!body) return;
  const article = body.closest(".reading-article");
  const sidebar = article.querySelector("[data-reading-sidebar]");
  const toc = article.querySelector("[data-reading-toc]");
  const list = article.querySelector("[data-toc-list]");
  const count = article.querySelector("[data-toc-count]");
  const progress = document.querySelector("[data-reading-progress]");
  const compact = matchMedia("(max-width: 1050px)");
  const languages = {
    py: "Python", python: "Python", bash: "Bash", sh: "Shell", shell: "Shell",
    shell_session: "Shell", console: "Console", js: "JavaScript", javascript: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript", html: "HTML", css: "CSS",
    c: "C", cpp: "C++", "c++": "C++", csharp: "C#", cs: "C#", java: "Java",
    go: "Go", rust: "Rust", ruby: "Ruby", rb: "Ruby", php: "PHP",
    solidity: "Solidity", sql: "SQL", json: "JSON", yaml: "YAML", yml: "YAML",
    asm: "Assembly", nasm: "Assembly", text: "Text", plaintext: "Text",
    powershell: "PowerShell", ps1: "PowerShell", diff: "Diff", toml: "TOML"
  };

  body.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code") || pre;
    let source = code;
    let language;
    while (source && source !== body) {
      language = String(source.className).match(/(?:^|\s)(?:language|lang)-([\w#+.-]+)/)?.[1];
      if (language) break;
      source = source.parentElement;
    }
    const label = languages[language?.toLowerCase()] || language || "Text";
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "code-toolbar";
    const name = document.createElement("span");
    name.className = "code-language";
    name.textContent = label;
    toolbar.append(name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "코드 복사";
    button.setAttribute("aria-label", `${label} 코드 복사`);
    button.setAttribute("aria-live", "polite");
    if (!navigator.clipboard?.writeText) {
      button.disabled = true;
      button.title = "이 환경에서는 코드를 직접 선택해 복사해 주세요.";
    }
    let resetTimer;
    button.addEventListener("click", async () => {
      clearTimeout(resetTimer);
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = "복사 완료";
      } catch (_) {
        button.textContent = "복사 실패 · 직접 선택";
      }
      resetTimer = setTimeout(() => { button.textContent = "코드 복사"; }, 2000);
    });
    toolbar.append(button);
    pre.before(wrapper);
    wrapper.append(toolbar, pre);
  });

  const headings = Array.from(body.querySelectorAll("h2,h3"));
  // Markdown includes can emit duplicate IDs across tabs. Preserve the first
  // anchor and give subsequent headings deterministic, collision-free suffixes.
  const headingSet = new Set(headings);
  const reservedIds = new Set(Array.from(document.querySelectorAll("[id]"))
    .filter((element) => !headingSet.has(element)).map((element) => element.id));
  headings.forEach((heading, index) => {
    const base = heading.id || `section-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (reservedIds.has(id)) id = `${base}-${suffix++}`;
    heading.id = id;
    heading.tabIndex = -1;
    reservedIds.add(id);
  });
  document.dispatchEvent(new Event("hercent:headingsready"));

  toc.open = !compact.matches;
  compact.addEventListener("change", () => { toc.open = !compact.matches; });
  let entries = [];
  let active = null;
  let frame = 0;
  let previousProgress = -1;
  const update = () => {
    frame = 0;
    const bounds = body.getBoundingClientRect();
    const range = bounds.height - innerHeight;
    const ratio = range > 0 ? Math.max(0, Math.min(1, -bounds.top / range)) : bounds.bottom <= innerHeight ? 1 : 0;
    const percent = Math.round(ratio * 100);
    progress.style.setProperty("--reading-progress", String(ratio));
    if (previousProgress !== percent) {
      progress.setAttribute("aria-valuenow", String(percent));
      previousProgress = percent;
    }
    let current = entries[0];
    for (const entry of entries) {
      if (entry.heading.getBoundingClientRect().top <= 120) current = entry;
      else break;
    }
    if (current === active) return;
    active?.link.removeAttribute("aria-current");
    current?.link.setAttribute("aria-current", "location");
    active = current;
    if (current && toc.open && !compact.matches) {
      const nav = list.parentElement;
      const linkBounds = current.link.getBoundingClientRect();
      const navBounds = nav.getBoundingClientRect();
      if (linkBounds.top < navBounds.top || linkBounds.bottom > navBounds.bottom) {
        nav.scrollTop += linkBounds.top - navBounds.top - nav.clientHeight / 2;
      }
    }
  };
  const scheduleUpdate = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const rebuild = () => {
    const visible = headings.filter((heading) => !heading.closest("[hidden]") && heading.getClientRects().length);
    list.replaceChildren();
    entries = visible.map((heading) => {
      const item = document.createElement("li");
      item.className = heading.tagName === "H3" ? "toc-subheading" : "";
      const link = document.createElement("a");
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = heading.textContent.trim();
      item.append(link);
      list.append(item);
      return { heading, link };
    });
    count.textContent = String(entries.length);
    sidebar.hidden = entries.length === 0;
    article.classList.toggle("has-reading-tools", entries.length > 0);
    active = null;
    scheduleUpdate();
  };
  progress.hidden = false;
  rebuild();
  document.addEventListener("hercent:tabchange", rebuild);
  addEventListener("scroll", scheduleUpdate, { passive: true });
  addEventListener("resize", scheduleUpdate);
  addEventListener("hashchange", scheduleUpdate);
  body.addEventListener("load", scheduleUpdate, true);
  body.addEventListener("toggle", rebuild, true);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleUpdate).observe(body);
  // Restore heading deep links after tab selection and toolbar insertion.
  let initialHeading;
  try { initialHeading = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) {}
  if (initialHeading && headingSet.has(initialHeading) && !initialHeading.closest("[hidden]")) {
    requestAnimationFrame(() => initialHeading.scrollIntoView({ behavior: "instant", block: "start" }));
  }
})();
