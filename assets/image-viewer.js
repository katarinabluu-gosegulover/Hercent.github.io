(() => {
  const body = document.querySelector('.reading-article .article-body');
  if (!body || typeof HTMLDialogElement === 'undefined') return;
  const images = [...body.querySelectorAll('img')].filter(img => !img.closest('a,button,[role="button"]'));
  if (!images.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', '본문 이미지 확대');
  dialog.innerHTML = '<div class="viewer-toolbar"><span>IMAGE / INSPECT</span><button type="button" data-size aria-pressed="false">원본 크기</button><button type="button" data-close autofocus>닫기 (Esc)</button></div><div class="viewer-stage" tabindex="0" role="region" aria-label="이미지 영역, 원본 크기에서는 스크롤 가능"><img alt=""></div><div class="viewer-footer"><button type="button" data-prev aria-label="이전 이미지">←</button><p aria-live="polite"></p><button type="button" data-next aria-label="다음 이미지">→</button></div>';
  document.body.append(dialog);
  const enlarged = dialog.querySelector('img');
  const caption = dialog.querySelector('p');
  const previous = dialog.querySelector('[data-prev]');
  const next = dialog.querySelector('[data-next]');
  const size = dialog.querySelector('[data-size]');
  const stage = dialog.querySelector('.viewer-stage');
  const resetSize = () => {
    stage.classList.remove('viewer-original');
    size.setAttribute('aria-pressed', 'false');
    size.textContent = '원본 크기';
    stage.scrollTo(0, 0);
  };
  let gallery = [], index = 0, opener, overflow;
  const render = () => {
    resetSize();
    const img = gallery[index];
    enlarged.src = img.currentSrc || img.src;
    enlarged.alt = img.alt;
    const text = img.closest('figure')?.querySelector('figcaption')?.textContent.trim() || img.alt || '본문 이미지';
    caption.textContent = `${index + 1} / ${gallery.length} · ${text}`;
    previous.disabled = index === 0;
    next.disabled = index === gallery.length - 1;
  };
  images.forEach((img, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-zoom';
    button.setAttribute('aria-label', `${img.alt || `본문 이미지 ${i + 1}`} 확대`);
    button.setAttribute('aria-haspopup', 'dialog');
    img.before(button);
    button.append(img);
    button.addEventListener('click', () => {
      gallery = images.filter(item => item.getClientRects().length && !item.closest('[hidden]'));
      index = gallery.indexOf(img);
      if (index < 0) return;
      opener = button;
      render();
      overflow = document.documentElement.style.overflow;
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    });
  });
  previous.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  size.addEventListener('click', () => {
    const original = stage.classList.toggle('viewer-original');
    size.setAttribute('aria-pressed', String(original));
    size.textContent = original ? '화면 맞춤' : '원본 크기';
    stage.scrollTo(0, 0);
  });
  next.addEventListener('click', () => { if (index < gallery.length - 1) { index++; render(); } });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.target === stage && stage.classList.contains('viewer-original')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      (event.key === 'ArrowLeft' ? previous : next).click();
    }
  });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = overflow;
    opener?.focus({ preventScroll: true });
  });
})();
