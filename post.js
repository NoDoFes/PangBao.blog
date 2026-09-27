window.PB = window.PB || {};

(function () {

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
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
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

  function revealContent(container) {
    const items = container.querySelectorAll('h2, h3, p, ul, ol, pre, blockquote, table, hr, img');
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('revealed'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach(el => io.observe(el));
  }

  function buildTOC(container) {
    if (!container) return;
    const headings = container.querySelectorAll('h2, h3');
    const tocContainer = document.getElementById('toc-sidebar');

    if (!tocContainer) return;

    if (headings.length === 0) {
      tocContainer.innerHTML = '';
      tocContainer.style.display = 'none';
      return;
    }

    tocContainer.innerHTML = '';
    // 清掉内联 display，让 CSS 媒体查询接管
    tocContainer.style.display = '';

    headings.forEach((heading, index) => {
      const id = 'heading-' + index;
      heading.id = id;

      const link = document.createElement('a');
      link.href = '#' + id;
      link.className = 'toc-item' + (heading.tagName === 'H3' ? ' toc-h3' : '');
      link.innerHTML = `
        <span class="toc-dot"></span>
        <span class="toc-text">${heading.textContent}</span>
      `;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const top = document.getElementById(id).getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      });
      tocContainer.appendChild(link);
    });
  }

  function initBackToTop() {
    if (document.querySelector('.back-to-top')) return;

    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(btn);

    let ticking = false;
    const update = () => {
      btn.classList.toggle('visible', window.scrollY > 200);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

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
          const header = buildPostHeader({
            title,
            description: data.description || '',
            date, tags, wordCount, readTime
          });
          container.insertBefore(header, container.firstChild);
        }

        document.title = title + ' · 胖宝基地';

        revealContent(container);
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

  // ---------- 回到顶部按钮（所有页面都启用） ----------
  initBackToTop();

  // ---------- 子页面自动初始化 ----------
  if (document.getElementById('post-content')) {
    const article = document.getElementById('post-content');
    let mdFile = article.dataset.md;
    if (!mdFile) {
      let file = location.pathname.substring(location.pathname.lastIndexOf('/') + 1);
      file = file.replace(/\.html?$/i, '');
      mdFile = file + '.md';
    }
    renderPost(article, mdFile);
  }
})();