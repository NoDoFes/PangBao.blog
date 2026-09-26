(function () {
  const article = document.getElementById('post-content');
  if (!article) return;

  // 优先用 data-md；没写就从 URL 推导：essays/2026-10-01.html -> 2026-10-01.md
  let mdFile = article.dataset.md;
  if (!mdFile) {
    const path = location.pathname;
    const file = path.substring(path.lastIndexOf('/') + 1);
    mdFile = file.replace(/\.html?$/i, '.md');
  }

  fetch(mdFile)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + mdFile);
      return res.text();
    })
    .then(md => {
      article.innerHTML = marked.parse(md, { gfm: true, breaks: true });

      // 用 md 里第一个 H1 当页面标题
      const h1 = article.querySelector('h1');
      if (h1) document.title = h1.textContent.trim() + ' · 胖宝Essays';

      // ========== 入场动画：正文元素滚动出现 ==========
      revealContent(article);

      // ========== 生成右侧目录 ==========
      buildTOC(article);
    })
    .catch(err => {
      article.innerHTML = '<p class="post-error">文章加载失败：' + err.message + '</p>';
    });

  // ---------- 正文元素滚动出现 ----------
  function revealContent(container) {
    const items = container.querySelectorAll(
      'h1, h2, h3, p, ul, ol, pre, blockquote, table, hr, img'
    );

    // 不支持 IntersectionObserver 就直接全部显示
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
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    items.forEach(el => io.observe(el));
  }

  // ---------- 提取 H2, H3 生成目录 ----------
  function buildTOC(container) {
    const headings = container.querySelectorAll('h2, h3');
    const tocContainer = document.getElementById('toc-sidebar');

    if (!tocContainer) return;
    if (headings.length === 0) {
      tocContainer.style.display = 'none'; // 没有小标题就不显示侧边栏
      return;
    }

    tocContainer.innerHTML = ''; // 清空

    headings.forEach((heading, index) => {
      // 给正文标题加上 id，方便点击跳转
      const id = 'heading-' + index;
      heading.id = id;

      const link = document.createElement('a');
      link.href = '#' + id;
      link.className = 'toc-item' + (heading.tagName === 'H3' ? ' toc-h3' : '');

      link.innerHTML = `
        <span class="toc-dot"></span>
        <span class="toc-text">${heading.textContent}</span>
      `;

      // 点击跳转（平滑滚动）
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
      });

      tocContainer.appendChild(link);
    });
  }
})();