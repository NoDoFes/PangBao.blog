(function () {
  const article = document.getElementById('post-content');
  if (!article) return;

  // 优先用 data-md；没写就从 URL 推导。
  // 本地：essays/2026-10-01.html → 2026-10-01.md
  // Cloudflare：essays/2026-10-01（后缀被去掉）→ 2026-10-01.md
  let mdFile = article.dataset.md;
  if (!mdFile) {
    const path = location.pathname;
    let file = path.substring(path.lastIndexOf('/') + 1);
    file = file.replace(/\.html?$/i, '');   // 有 .html 就删，没有也无所谓
    mdFile = file + '.md';                  // 统一加 .md
  }

  // 注意：本地 Python http.server 返回 .md 时不带 charset=utf-8，
  // 浏览器会按 Latin-1 解析导致中文乱码。
  // 所以用 arrayBuffer 拿二进制，再用 TextDecoder 强制 UTF-8 解码。
  fetch(mdFile, { cache: 'no-cache' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + mdFile);
      return res.arrayBuffer();
    })
    .then(buf => new TextDecoder('utf-8').decode(buf))
    .then(md => {
      // ========== 解析 front matter ==========
      const { data, content } = parseFrontMatter(md);

      // 渲染正文
      article.innerHTML = marked.parse(content, { gfm: true, breaks: true });

      // 标题：优先正文 H1，其次 front matter，最后兜底
      const h1 = article.querySelector('h1');
      const title = h1 ? h1.textContent.trim() : (data.title || '未命名');
      if (h1) h1.remove(); // 用文章头里的标题替代

      // 日期：front matter > 文件名
      const date = data.date || extractDate(mdFile);

      // 标签：数组或逗号分隔字符串
      let tags = [];
      if (Array.isArray(data.tags)) tags = data.tags;
      else if (typeof data.tags === 'string' && data.tags) {
        tags = data.tags.split(',').map(s => s.trim()).filter(Boolean);
      }

      // 字数 + 阅读时长
      const wordCount = countWords(content);
      const readTime = Math.max(1, Math.round(wordCount / 300));

      // 构建并插入文章头
      const header = buildPostHeader({
        title,
        description: data.description || '',
        date,
        tags,
        wordCount,
        readTime
      });
      article.insertBefore(header, article.firstChild);

      // 页面标题
      document.title = title + ' · 胖宝基地';

      // ========== 入场动画：正文元素滚动出现 ==========
      revealContent(article);

      // ========== 生成右侧目录 ==========
      buildTOC(article);
      
    });

  // ---------- 解析 front matter ----------
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

      // 数组格式 [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, '');
      }

      data[key] = value;
    });

    return { data, content };
  }

  // ---------- 从文件名提取日期 ----------
  function extractDate(filename) {
    const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  // ---------- 统计字数（中文 + 英文 + 数字） ----------
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

  // ---------- 构建文章头部 ----------
  function buildPostHeader({ title, description, date, tags, wordCount, readTime }) {
    const header = document.createElement('header');
    header.className = 'post-header';

    // 标题
    const h1 = document.createElement('h1');
    h1.className = 'post-title';
    h1.textContent = title;
    header.appendChild(h1);

    // 描述
    if (description) {
      const desc = document.createElement('p');
      desc.className = 'post-description';
      desc.textContent = description;
      header.appendChild(desc);
    }

    // 元信息
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

  // ---------- 正文元素滚动出现 ----------
  function revealContent(container) {
    const items = container.querySelectorAll(
      'h2, h3, p, ul, ol, pre, blockquote, table, hr, img'
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
      tocContainer.style.display = 'none';
      return;
    }

    tocContainer.innerHTML = '';

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
        document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
      });

      tocContainer.appendChild(link);
    });
  }
})();