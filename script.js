/* ============================================================
   胖宝基地 · 通用脚本
   ============================================================ */
(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function sortArtworks(list) {
    return list
      .map((item, origIdx) => ({ item, origIdx }))
      .sort((a, b) => {
        const da = a.item.date || '';
        const db = b.item.date || '';
        if (!da && !db) return a.origIdx - b.origIdx;
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      })
      .map(x => x.item);
  }

  /* ============================================================
     1. 主题
     ============================================================ */
  const THEME_KEY = 'theme-preference';
  const html = document.documentElement;
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  let mediaListener = null;
  let themeTransitionTimer = null;

  const getPref = () => localStorage.getItem(THEME_KEY) || 'system';
  const getSysTheme = () => (darkMedia.matches ? 'dark' : 'light');
  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VT_DURATION = 500;
  const CSS_FALLBACK_DURATION = 450;

  function applyTheme(pref, origin) {
    const eff = pref === 'system' ? getSysTheme() : pref;
    const prevEff = html.getAttribute('data-theme');
    const willChange = prevEff !== eff;

    const commit = () => {
      html.setAttribute('data-theme', eff);
      $$('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.themeValue === pref);
      });
      localStorage.setItem(THEME_KEY, pref);
    };

    if (!willChange) { commit(); return; }
    if (prefersReduced()) { commit(); return; }

    const supportsVT = typeof document.startViewTransition === 'function';
    if (supportsVT && origin) {
      const x = origin.x;
      const y = origin.y;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      const transition = document.startViewTransition(commit);
      transition.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
          { duration: VT_DURATION, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
      return;
    }

    html.classList.add('theme-transition');
    commit();
    clearTimeout(themeTransitionTimer);
    themeTransitionTimer = setTimeout(() => html.classList.remove('theme-transition'), CSS_FALLBACK_DURATION);
  }

  function startSysListener() {
    if (mediaListener) return;
    mediaListener = () => { if (getPref() === 'system') applyTheme('system'); };
    darkMedia.addEventListener('change', mediaListener);
  }
  function stopSysListener() {
    if (!mediaListener) return;
    darkMedia.removeEventListener('change', mediaListener);
    mediaListener = null;
  }
  function initTheme() {
    const pref = getPref();
    const eff = pref === 'system' ? getSysTheme() : pref;
    html.setAttribute('data-theme', eff);
    $$('.theme-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.themeValue === pref));
    if (pref === 'system') startSysListener();
  }
  function setTheme(value, origin) {
    stopSysListener();
    applyTheme(value, origin);
    if (value === 'system') startSysListener();
  }

  /* ============================================================
     2. 顶栏滚动阴影
     ============================================================ */
  function initTopbarScroll() {
    const topbar = $('.topbar');
    if (!topbar) return;
    let ticking = false;
    const update = () => {
      topbar.classList.toggle('scrolled', window.scrollY > 20);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ============================================================
     3. 首页：文章列表
     ============================================================ */
  function createCoverEl(src, animate) {
    const img = document.createElement('img');
    img.className = 'article-item-cover' + (animate ? ' cover-loaded' : '');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';

    img.onerror = () => {
      img.remove();
      const parent = img.parentElement;
      if (parent) parent.classList.remove('has-cover'); 
    };
    return img;
  }

  function buildArticleList() {
    const container = $('#articleList');
    if (!container || !window.PB || !Array.isArray(PB.articles)) return;

    if (!PB.articles.length) {
      container.innerHTML = '<p class="section-empty">还没有文章，下次来就有了胖宝 🐾</p>';
      return;
    }

    const frag = document.createDocumentFragment();

    PB.articles.forEach((item, i) => {
      const a = document.createElement('a');
      a.className = 'article-item';
      a.href = 'article.html?md=' + encodeURI(item.md);
      a.style.setProperty('--i', i);

      // 直接使用 manage.py 生成好的 cover 字段
      if (item.cover) {
        a.classList.add('has-cover');
        a.appendChild(createCoverEl(item.cover, false));
      }

      const body = document.createElement('div');
      body.className = 'article-item-body';

      const title = document.createElement('div');
      title.className = 'article-item-title';
      title.textContent = item.title || '未命名';
      body.appendChild(title);

      if (item.desc) {
        const desc = document.createElement('div');
        desc.className = 'article-item-desc';
        desc.textContent = item.desc;
        body.appendChild(desc);
      }

      if (item.date) {
        const meta = document.createElement('div');
        meta.className = 'article-item-meta';
        meta.innerHTML = '<i class="far fa-calendar"></i> ' + item.date;
        body.appendChild(meta);
      }

      a.appendChild(body);

      const arrow = document.createElement('span');
      arrow.className = 'article-item-arrow';
      arrow.innerHTML = '<i class="fas fa-arrow-right"></i>';
      a.appendChild(arrow);

      frag.appendChild(a);
    });

    container.innerHTML = '';
    container.appendChild(frag);
  }

  /* ============================================================
     4. 首页：画作瀑布流
     ============================================================ */
  let masonryList = [];

  function buildMasonry() {
    const container = $('#masonry');
    const emptyEl = $('#masonryEmpty');
    if (!container || !window.PB || !Array.isArray(PB.artworks)) return;

    const list = sortArtworks(PB.artworks);
    if (!list.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    masonryList = list;

    const frag = document.createDocumentFragment();

    list.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'masonry-item';
      btn.style.setProperty('--i', i);
      btn.dataset.index = String(i);
      btn.setAttribute('aria-label', '查看：' + (item.title || '未命名'));

      const img = document.createElement('img');
      img.src = item.src;
      img.alt = item.title || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      
      const markLoaded = () => img.classList.add('loaded');
      if (img.complete && img.naturalWidth) markLoaded();
      else img.addEventListener('load', markLoaded, { once: true });
      img.addEventListener('error', markLoaded, { once: true });

      btn.appendChild(img);

      const overlay = document.createElement('div');
      overlay.className = 'masonry-overlay';
      const t = document.createElement('div');
      t.className = 'masonry-overlay-title';
      t.textContent = item.title || '';
      overlay.appendChild(t);

      const meta = document.createElement('div');
      meta.className = 'masonry-overlay-meta';
      if (item.date) {
        const d = document.createElement('span');
        d.textContent = item.date;
        meta.appendChild(d);
      }
      overlay.appendChild(meta);
      btn.appendChild(overlay);
      frag.appendChild(btn);
    });

    container.innerHTML = '';
    container.appendChild(frag);

    container.addEventListener('click', e => {
      const btn = e.target.closest('.masonry-item');
      if (!btn) return;
      openLightbox(parseInt(btn.dataset.index, 10));
    });
  }

  /* ============================================================
     5. 灯箱
     ============================================================ */
  const lb = {
    el: null, image: null, title: null, date: null, counter: null,
    prevBtn: null, nextBtn: null, index: 0, open: false, lastFocused: null, keyHandler: null
  };

  function ensureLightbox() {
    if (lb.el) return;
    lb.el = $('#lightbox');
    if (!lb.el) return;
    lb.image = $('#lbImage'); lb.title = $('#lbTitle'); lb.date = $('#lbDate');
    lb.counter = $('#lbCounter'); lb.prevBtn = lb.el.querySelector('[data-lb-prev]'); lb.nextBtn = lb.el.querySelector('[data-lb-next]');

    lb.el.addEventListener('click', e => {
      if (e.target.closest('[data-lb-close]')) closeLightbox();
      else if (e.target.closest('[data-lb-prev]')) gotoImage(lb.index - 1);
      else if (e.target.closest('[data-lb-next]')) gotoImage(lb.index + 1);
    });
  }

  function swapImage(src, alt) {
    lb.image.src = src;
    lb.image.alt = alt || '';
    const show = () => requestAnimationFrame(() => requestAnimationFrame(() => lb.image.classList.add('lb-in')));
    if (lb.image.complete && lb.image.naturalWidth) show();
    else { lb.image.addEventListener('load', show, { once: true }); lb.image.addEventListener('error', show, { once: true }); }
  }

  function openLightbox(index) {
    ensureLightbox();
    if (!lb.el || !masonryList.length) return;

    lb.index = Math.max(0, Math.min(index, masonryList.length - 1));
    lb.lastFocused = document.activeElement;
    lb.open = true;

    lb.image.classList.remove('lb-in');
    lb.el.removeAttribute('hidden');
    lb.el.setAttribute('aria-hidden', 'false');
    lb.el.classList.add('lightbox-open');
    document.body.classList.add('lightbox-lock');

    requestAnimationFrame(() => lb.el.classList.add('lightbox-visible'));

    if (!lb.keyHandler) {
      lb.keyHandler = e => {
        if (!lb.open) return;
        if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); gotoImage(lb.index - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); gotoImage(lb.index + 1); }
      };
      document.addEventListener('keydown', lb.keyHandler);
    }

    const item = masonryList[lb.index];
    void lb.image.offsetWidth;
    swapImage(item.src, item.title || '');
    renderCaption(item);
  }

  function closeLightbox() {
    if (!lb.open || !lb.el) return;
    lb.open = false;
    lb.image.classList.remove('lb-in');
    lb.el.classList.remove('lightbox-visible');
    document.body.classList.remove('lightbox-lock');

    const cleanup = () => {
      lb.el.classList.remove('lightbox-open');
      lb.el.setAttribute('hidden', '');
      lb.el.setAttribute('aria-hidden', 'true');
      lb.image.removeAttribute('src');
      lb.image.classList.remove('lb-in');
    };

    if (prefersReduced()) cleanup(); else setTimeout(cleanup, 480);

    if (lb.keyHandler) {
      document.removeEventListener('keydown', lb.keyHandler);
      lb.keyHandler = null;
    }
    if (lb.lastFocused && lb.lastFocused.focus) {
      try { lb.lastFocused.focus({ preventScroll: true }); } catch (_) {}
    }
    lb.lastFocused = null;
  }

  function gotoImage(i) {
    if (!masonryList.length) return;
    i = Math.max(0, Math.min(i, masonryList.length - 1));
    if (i === lb.index) return;
    lb.index = i;
    const item = masonryList[lb.index];
    lb.image.classList.remove('lb-in');
    setTimeout(() => { swapImage(item.src, item.title || ''); renderCaption(item); }, 180);
    updateLightboxMeta();
  }

  function renderCaption(item) {
    lb.title.textContent = item.title || '';
    lb.date.textContent = item.date ? '· ' + item.date : '';
    lb.date.hidden = !item.date;
    updateLightboxMeta();
  }

  function updateLightboxMeta() {
    lb.counter.textContent = (lb.index + 1) + ' / ' + masonryList.length;
    lb.prevBtn.disabled = lb.index === 0;
    lb.nextBtn.disabled = lb.index === masonryList.length - 1;
    try { history.replaceState(null, '', '#art-' + lb.index); } catch (_) {}
  }

  /* ============================================================
     6. 启动
     ============================================================ */
  function boot() {
    $$('.theme-btn').forEach(btn => {
      btn.addEventListener('click', (e) => setTheme(btn.dataset.themeValue, { x: e.clientX, y: e.clientY }));
    });
    initTheme();
    initTopbarScroll();

    if (document.getElementById('articleList')) {
      buildArticleList();
      $('#breadcrumb')?.querySelector('.crumb-home')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
    if (document.getElementById('masonry')) {
      buildMasonry();
      const m = location.hash.match(/^#art-(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (!isNaN(idx)) requestAnimationFrame(() => openLightbox(idx));
      }
    }

    document.addEventListener('click', e => { if (lb.open && e.target.matches('.lightbox-backdrop')) closeLightbox(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();