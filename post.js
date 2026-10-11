/* ============================================================
   胖宝基地 · 文章渲染脚本（article.html 使用）
   ============================================================ */
window.PB = window.PB || {};

(function () {
  'use strict';

  /* ---------------- 工具 ---------------- */

  function parseFrontMatter(text) {
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
    if (!match) return { data: {}, content: text };
    const yaml = match[1];
    const content = text.slice(match[0].length);
    const data = {};
    yaml.split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!m) return;
      const key = m[1];
      let value = m[2].trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, '');
      }
      data[key] = value;
    });
    return { data, content };
  }

  function extractDate(filename) {
    const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function countWords(md) {
    const noCode = md.replace(/```[\s\S]*?```/g, '');
    const noInlineCode = noCode.replace(/`[^`]*`/g, '');
    const noUrl = noInlineCode.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    const plain = noUrl.replace(/[#*_>~`\-|]/g, ' ');
    const chinese = (plain.match(/[\u4e00-\u9fa5]/g) || []).length;
    const english = (plain.match(/[a-zA-Z]+/g) || []).length;
    const numbers = (plain.match(/\d+/g) || []).length;
    return chinese + english + numbers;
  }

  /* ---------------- 文章头 ---------------- */

  function buildPostHeader({ title, description, date, tags, wordCount, readTime }) {
    const header = document.createElement('header');
    header.className = 'post-header';

    const h1 = document.createElement('h1');
    h1.className = 'post-title';
    h1.textContent = title;
    header.appendChild(h1);

    if (description) {
      const desc = document.createElement('p');
      desc.className = 'post-description';
      desc.textContent = description;
      header.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'post-meta';

    if (date) {
      const el = document.createElement('span');
      el.className = 'post-meta-item';
      el.innerHTML = '<i class="far fa-calendar"></i> ' + date;
      meta.appendChild(el);
    }
    if (tags.length) {
      const el = document.createElement('span');
      el.className = 'post-meta-item post-tags';
      el.innerHTML = '<i class="fas fa-tags"></i> ' +
        tags.map(t => `<a href="#" class="post-tag">#${t}</a>`).join(' ');
      meta.appendChild(el);
    }
    if (wordCount) {
      const el = document.createElement('span');
      el.className = 'post-meta-item';
      el.innerHTML = '<i class="far fa-file-alt"></i> ' + wordCount + ' 字';
      meta.appendChild(el);
    }
    if (readTime) {
      const el = document.createElement('span');
      el.className = 'post-meta-item';
      el.innerHTML = '<i class="far fa-clock"></i> 约 ' + readTime + ' 分钟';
      meta.appendChild(el);
    }

    header.appendChild(meta);
    return header;
  }

  /* ---------------- 右侧目录 ---------------- */

  let tocScrollHandler = null;

  function buildTOC(container) {
    const tocContainer = document.getElementById('toc-sidebar');
    if (!tocContainer) return;

    const headings = Array.from(container.querySelectorAll('h2, h3'));
    if (!headings.length) {
      tocContainer.innerHTML = '';
      tocContainer.style.display = 'none';
      return;
    }
    tocContainer.innerHTML = '';
    tocContainer.style.display = '';

    headings.forEach((heading, index) => {
      const id = heading.id || ('heading-' + index);
      heading.id = id;

      const link = document.createElement('a');
      link.href = '#' + id;
      link.className = 'toc-item' + (heading.tagName === 'H3' ? ' toc-h3' : '');
      link.dataset.target = id;
      link.innerHTML = '<span class="toc-dot"></span><span class="toc-text"></span>';
      link.querySelector('.toc-text').textContent = heading.textContent;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        const top = heading.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top, behavior: 'smooth' });
        history.replaceState(null, '', '#' + id);
      });
      tocContainer.appendChild(link);
    });

    startTOCHighlight(headings, tocContainer);
  }

  function startTOCHighlight(headings, tocContainer) {
    if (tocScrollHandler) {
      window.removeEventListener('scroll', tocScrollHandler);
      tocScrollHandler = null;
    }
    let ticking = false;
    const update = () => {
      const scrollTop = window.scrollY;
      let currentId = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= 120) currentId = h.id;
        else break;
      }
      if (currentId === null &&
          window.innerHeight + scrollTop >= document.documentElement.scrollHeight - 4) {
        currentId = headings[headings.length - 1].id;
      }
      tocContainer.querySelectorAll('.toc-item').forEach(item => {
        item.classList.toggle('active', item.dataset.target === currentId);
      });
      ticking = false;
    };
    tocScrollHandler = () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    };
    window.addEventListener('scroll', tocScrollHandler, { passive: true });
    update();
  }

  /* ---------------- 阅读进度 ---------------- */

  function initReadProgress() {
    const bar = document.getElementById('readProgressBar');
    if (!bar) return;
    let ticking = false;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------------- 回到顶部 ---------------- */

  function initBackToTop() {
    if (document.querySelector('.back-to-top')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(btn);

    let ticking = false;
    const update = () => {
      btn.classList.toggle('visible', window.scrollY > 300);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---------------- 面包屑（扁平版） ---------------- */

  function buildArticleBreadcrumb(mdPath) {
    const bc = document.getElementById('breadcrumb');
    if (!bc || !window.PB || !Array.isArray(PB.articles)) return;
    bc.innerHTML = '';

    const home = document.createElement('a');
    home.className = 'crumb crumb-home';
    home.href = 'index.html';
    home.innerHTML = '<i class="fas fa-home"></i> 首页';
    bc.appendChild(home);

    const item = PB.articles.find(x => x.md === mdPath);
    if (!item) return;

    bc.insertAdjacentHTML('beforeend', '<span class="crumb-sep">›</span>');
    const t = document.createElement('span');
    t.className = 'crumb crumb-file';
    t.textContent = item.title;
    bc.appendChild(t);
  }

  /* ---------------- 上一篇 / 下一篇（扁平版） ---------------- */

  function buildPostNav(currentMd) {
    const nav = document.getElementById('postNav');
    if (!nav || !window.PB || !Array.isArray(PB.articles)) return;

    const all = PB.articles;
    const idx = all.findIndex(i => i.md === currentMd);
    if (idx < 0 || all.length <= 1) { nav.style.display = 'none'; return; }

    const prev = idx > 0 ? all[idx - 1] : null;
    const next = idx < all.length - 1 ? all[idx + 1] : null;
    nav.innerHTML = '';

    if (prev) {
      const a = document.createElement('a');
      a.className = 'post-nav-item post-nav-prev';
      a.href = 'article.html?md=' + encodeURI(prev.md);
      a.innerHTML = '<span class="post-nav-label"><i class="fas fa-arrow-left"></i> 上一篇</span><span class="post-nav-title"></span>';
      a.querySelector('.post-nav-title').textContent = prev.title;
      nav.appendChild(a);
    } else {
      const s = document.createElement('span');
      s.className = 'post-nav-item post-nav-empty';
      nav.appendChild(s);
    }

    if (next) {
      const a = document.createElement('a');
      a.className = 'post-nav-item post-nav-next';
      a.href = 'article.html?md=' + encodeURI(next.md);
      a.innerHTML = '<span class="post-nav-label">下一篇 <i class="fas fa-arrow-right"></i></span><span class="post-nav-title"></span>';
      a.querySelector('.post-nav-title').textContent = next.title;
      nav.appendChild(a);
    } else {
      const s = document.createElement('span');
      s.className = 'post-nav-item post-nav-empty';
      nav.appendChild(s);
    }
  }

  /* ---------------- 左侧文章列表（扁平版） ---------------- */

  function buildArticleListSidebar(currentMd) {
    const el = document.getElementById('articleListSidebar');
    if (!el) return false;
    if (!window.PB || !Array.isArray(PB.articles)) return false;

    if (!PB.articles.length) {
      el.innerHTML = '';
      el.removeAttribute('data-ready');
      return true;
    }

    const frag = document.createDocumentFragment();

    const title = document.createElement('div');
    title.className = 'als-title';
    title.innerHTML = '<i class="fas fa-book-open"></i> 全部文章';
    frag.appendChild(title);

    const group = document.createElement('div');
    group.className = 'als-group';

    PB.articles.forEach(item => {
      const a = document.createElement('a');
      a.className = 'als-item';
      a.href = 'article.html?md=' + encodeURI(item.md);
      a.textContent = item.title;
      a.title = item.title;
      if (item.md === currentMd) a.classList.add('active');
      group.appendChild(a);
    });

    frag.appendChild(group);
    el.innerHTML = '';
    el.appendChild(frag);
    el.setAttribute('data-ready', '1');

    requestAnimationFrame(() => {
      const active = el.querySelector('.als-item.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    });

    return true;
  }

  /* ---------------- 主渲染 ---------------- */

  function renderPost(container, mdPath, options) {
    options = options || {};
    const showHeader = options.showHeader !== false;
    const showTOC = options.showTOC !== false;

    return fetch(mdPath, { cache: 'no-cache' })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + mdPath);
        return res.arrayBuffer();
      })
      .then(buf => new TextDecoder('utf-8').decode(buf))
      .then(md => {
        const { data, content } = parseFrontMatter(md);
        container.innerHTML = marked.parse(content, { gfm: true, breaks: true });

        /* ★ 修正 md 中相对路径的图片：
           md 在 essays/xxx/xxx.md，article.html 在根目录
           所以 md 里的 ![](sketch.jpg) 需要改成 essays/xxx/sketch.jpg */
        const mdDir = mdPath.substring(0, mdPath.lastIndexOf('/'));
        if (mdDir) {
          container.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (!src) return;
            if (/^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:')) return;
            img.setAttribute('src', mdDir + '/' + src);
          });
        }

        const h1 = container.querySelector('h1');
        const title = h1 ? h1.textContent.trim() : (data.title || '未命名');
        if (h1) h1.remove();

        const date = data.date || extractDate(mdPath);
        let tags = [];
        if (Array.isArray(data.tags)) tags = data.tags;
        else if (typeof data.tags === 'string' && data.tags) {
          tags = data.tags.split(',').map(s => s.trim()).filter(Boolean);
        }

        const wordCount = countWords(content);
        const readTime = Math.max(1, Math.round(wordCount / 300));

        if (showHeader) {
          container.insertBefore(
            buildPostHeader({
              title, description: data.description || '',
              date, tags, wordCount, readTime
            }),
            container.firstChild
          );
        }

        document.title = title + ' · 胖宝基地';
        if (showTOC) buildTOC(container);
        return title;
      })
      .catch(err => {
        container.innerHTML = '<p class="post-error">文章加载失败：' + err.message + '</p>';
        throw err;
      });
  }

  PB.renderPost = renderPost;
  PB.buildTOC = buildTOC;

  /* ============================================================
     启动（article.html）
     ============================================================ */
  function boot() {
    const article = document.getElementById('post-content');
    if (!article) return;

    let mdFile = article.dataset.md;
    if (!mdFile) mdFile = new URLSearchParams(location.search).get('md');
    if (!mdFile) {
      let file = location.pathname.substring(location.pathname.lastIndexOf('/') + 1);
      file = file.replace(/\.html?$/i, '');
      mdFile = file + '.md';
    }

    initReadProgress();
    initBackToTop();
    buildArticleBreadcrumb(mdFile);
    buildPostNav(mdFile);

    let tries = 0;
    (function tryBuildSidebar() {
      const ok = buildArticleListSidebar(mdFile);
      if (!ok && tries++ < 40) setTimeout(tryBuildSidebar, 50);
    })();

    renderPost(article, mdFile).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();