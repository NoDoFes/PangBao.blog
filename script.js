(function () {
    'use strict';

    /* ============================================
       主题切换
       ============================================ */
    const STORAGE_KEY = 'theme-preference';
    const html = document.documentElement;

    const getPreferredTheme = () => localStorage.getItem(STORAGE_KEY) || 'system';
    const getSystemTheme = () =>
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    function applyTheme(pref) {
        const eff = pref === 'system' ? getSystemTheme() : pref;
        html.setAttribute('data-theme', eff);
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeValue === pref);
        });
        localStorage.setItem(STORAGE_KEY, pref);
    }

    let mediaListener = null;
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

    function startSystemListener() {
        if (mediaListener) return;
        mediaListener = () => {
            if (getPreferredTheme() === 'system') applyTheme('system');
        };
        darkMedia.addEventListener('change', mediaListener);
    }

    function stopSystemListener() {
        if (!mediaListener) return;
        darkMedia.removeEventListener('change', mediaListener);
        mediaListener = null;
    }

    function initTheme() {
        const pref = getPreferredTheme();
        applyTheme(pref);
        if (pref === 'system') startSystemListener();
    }

    function setTheme(value) {
        stopSystemListener();
        applyTheme(value);
        if (value === 'system') startSystemListener();
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => setTheme(btn.dataset.themeValue));
    });

    initTheme();

    /* ============================================
       导航栏滚动
       ============================================ */
    const topbar = document.querySelector('.topbar');
    if (topbar) {
        let ticking = false;
        const update = () => {
            topbar.classList.toggle('scrolled', window.scrollY > 20);
            ticking = false;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        }, { passive: true });
        update();
    }

    /* ============================================
       面包屑
       ============================================ */
    function refreshBreadcrumb() {
        const el = document.getElementById('breadcrumb');
        if (!el) return;

        // 找目标：优先"唯一打开的文章"，否则最深的打开文件夹
        let target = document.querySelector('details.essay-file[open]');

        if (!target) {
            const openFolders = Array.from(document.querySelectorAll('details.tree-folder[open]'));
            if (openFolders.length) {
                target = openFolders.find(n =>
                    !openFolders.some(other => other !== n && n.contains(other))
                ) || openFolders[0];
            }
        }

        // 保证首页存在
        if (!el.querySelector('.crumb-home')) {
            el.innerHTML = '<span class="crumb crumb-home"><i class="fas fa-home"></i> 首页</span>';
        }

        // 无目标 → 清空动态部分
        if (!target) {
            Array.from(el.children).forEach(n => {
                if (
                    (n.classList.contains('crumb-dynamic') ||
                     n.classList.contains('crumb-dynamic-sep')) &&
                    !n.classList.contains('crumb-leaving')
                ) {
                    removeWithAnim(n);
                }
            });
            return;
        }

        // 收集路径
        const labels = [];
        let cur = target;
        while (cur && cur !== document.body) {
            if (cur.matches && cur.matches('details.tree-folder, details.essay-file')) {
                const lbl = cur.querySelector(':scope > summary .tree-label');
                if (lbl) {
                    labels.unshift({
                        text: lbl.textContent.trim(),
                        isFile: cur.matches('details.essay-file'),
                        sourceEl: cur
                    });
                }
            }
            cur = cur.parentElement;
        }

        const targets = labels.map((item, i) => ({
            text: item.text,
            isFile: item.isFile,
            depth: Math.min(i, 3),
            sourceEl: item.sourceEl
        }));

        const existing = Array.from(el.querySelectorAll('.crumb.crumb-dynamic'))
            .filter(n => !n.classList.contains('crumb-leaving'));

        let commonLen = 0;
        for (let i = 0; i < Math.min(existing.length, targets.length); i++) {
            if (existing[i].dataset.text === targets[i].text) commonLen++;
            else break;
        }

        const isReplace = existing.length > commonLen && targets.length > commonLen;

        for (let i = existing.length - 1; i >= commonLen; i--) {
            const c = existing[i];
            const sep = c.previousElementSibling;

            if (isReplace) {
                c.remove();
                if (sep && sep.classList.contains('crumb-dynamic-sep')) sep.remove();
            } else {
                removeWithAnim(c);
                if (sep && sep.classList.contains('crumb-dynamic-sep') &&
                    !sep.classList.contains('crumb-leaving')) {
                    removeWithAnim(sep);
                }
            }
        }

        for (let i = commonLen; i < targets.length; i++) {
            const t = targets[i];

            const sep = document.createElement('span');
            sep.className = 'crumb-sep crumb-dynamic-sep crumb-enter-init';
            sep.textContent = '›';
            el.appendChild(sep);
            enterWithAnim(sep);

            const c = document.createElement('span');
            c.className = 'crumb crumb-dynamic crumb-enter-init';
            c.dataset.text = t.text;
            if (t.isFile) {
                c.classList.add('crumb-file');
            } else {
                c.classList.add(`crumb-depth-${t.depth}`, 'crumb-folder');
            }
            c.textContent = t.text;

            if (!t.isFile) {
                c.style.cursor = 'pointer';
                c.addEventListener('click', () => onFolderCrumbClick(t.sourceEl));
            }
            el.appendChild(c);
            enterWithAnim(c);
        }

        el.scrollLeft = el.scrollWidth;
    }

    function enterWithAnim(node) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                node.classList.remove('crumb-enter-init');
            });
        });
    }

    function removeWithAnim(node) {
        if (!node.isConnected) return;
        if (node.classList.contains('crumb-enter-init')) {
            node.remove();
            return;
        }
        if (node.classList.contains('crumb-leaving')) return;

        node.classList.add('crumb-leaving');
        setTimeout(() => {
            if (node.isConnected) node.remove();
        }, 320);
    }

    /* ============================================
       关闭文章：克隆 body 播动画，原 DOM 立即关闭
       ============================================ */
    function closeEssayWithAnim(fileEl) {
        if (!fileEl || !fileEl.open) return;

        const body = fileEl.querySelector('.essay-body');
        if (!body) {
            fileEl.open = false;
            return;
        }

        const rect = body.getBoundingClientRect();
        const computed = getComputedStyle(body);

        const clone = body.cloneNode(true);
        clone.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            max-height: ${rect.height}px;
            margin: 0;
            padding: ${computed.padding};
            background: ${computed.backgroundColor};
            border: ${computed.border};
            border-radius: ${computed.borderRadius};
            box-sizing: border-box;
            overflow: hidden;
            opacity: 1;
            transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.22s ease,
                        padding 0.22s ease;
            z-index: 50;
            pointer-events: none;
        `;
        document.body.appendChild(clone);

        // 立即关闭原文章（DOM 状态干净，面包屑立刻反映）
        fileEl.open = false;

        requestAnimationFrame(() => {
            clone.style.maxHeight = '0px';
            clone.style.opacity = '0';
            clone.style.paddingTop = '0';
            clone.style.paddingBottom = '0';
        });

        setTimeout(() => clone.remove(), 320);
    }

    /* ============================================
       点文件夹面包屑
       ============================================ */
    function onFolderCrumbClick(folderEl) {
        const opened = Array.from(folderEl.querySelectorAll('details.essay-file[open]'));
        opened.forEach(d => closeEssayWithAnim(d));

        refreshBreadcrumb();
        clearTOC();
        folderEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ============================================
       点面包屑"首页"
       ============================================ */
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.crumb-home')) return;

        document.querySelectorAll('details.essay-file[open]').forEach(d => closeEssayWithAnim(d));
        document.querySelectorAll('details.tree-folder[open]').forEach(f => f.open = false);

        clearTOC();
        refreshBreadcrumb();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ============================================
       随笔懒加载
       ============================================ */
    const htmlCache = new Map();
    const pending = new Map();

    function prefetchText(mdPath) {
        if (htmlCache.has(mdPath) || pending.has(mdPath)) return pending.get(mdPath);
        const p = fetch(mdPath, { cache: 'no-cache' })
            .then(res => res.ok ? res.arrayBuffer() : Promise.reject(res.status))
            .then(buf => new TextDecoder('utf-8').decode(buf));
        pending.set(mdPath, p);
        p.catch(() => pending.delete(mdPath));
        return p;
    }

    function loadEssay(details) {
        const body = details.querySelector('.essay-body');
        const mdPath = details.dataset.md;
        if (!body || !mdPath) return;

        if (details.dataset.loaded === '1') {
            if (window.PB && PB.buildTOC) PB.buildTOC(body);
            return;
        }
        details.dataset.loaded = '1';

        if (htmlCache.has(mdPath)) {
            body.innerHTML = htmlCache.get(mdPath);
            if (window.PB && PB.buildTOC) PB.buildTOC(body);
            return;
        }

        if (!window.PB || !PB.renderPost) {
            body.innerHTML = '<p class="post-error">渲染脚本未加载</p>';
            return;
        }

        body.innerHTML = `
            <div class="essay-skeleton">
                <div class="essay-skeleton-line"></div>
                <div class="essay-skeleton-line"></div>
                <div class="essay-skeleton-line"></div>
            </div>`;

        PB.renderPost(body, mdPath, { showHeader: false })
            .then(() => htmlCache.set(mdPath, body.innerHTML))
            .catch(() => {});
    }

    function clearTOC() {
        const toc = document.getElementById('toc-sidebar');
        if (!toc) return;
        toc.innerHTML = '';
        toc.style.display = 'none';
    }

    document.querySelectorAll('details.essay-file').forEach(details => {
        const summary = details.querySelector('summary');
        const mdPath = details.dataset.md;
        if (!summary || !mdPath) return;
        const doPrefetch = () => prefetchText(mdPath).catch(() => {});
        summary.addEventListener('mouseenter', doPrefetch, { passive: true });
        summary.addEventListener('focus', doPrefetch);
    });

    /* ============================================
       手动接管 essay-file 的点击（捕获阶段）
       完全由我们决定"关旧、开新"的顺序
       ============================================ */
    document.addEventListener('click', (e) => {
        const summary = e.target.closest('details.essay-file > summary');
        if (!summary) return;
        const details = summary.parentElement;

        // 阻止浏览器的默认 toggle 行为
        e.preventDefault();

        // 正在关闭动画中，忽略
        if (details.classList.contains('closing')) return;

        if (details.open) {
            /* ---------- 场景 1：关闭当前文章 ---------- */
            closeEssayWithAnim(details);
            refreshBreadcrumb();

            const stillOpen = document.querySelector('details.essay-file[open]');
            if (!stillOpen) clearTOC();
        } else {
            /* ---------- 场景 2：打开新文章（先关旧，再开新） ---------- */
            // 1) 立即关闭其他所有打开的文章
            document.querySelectorAll('details.essay-file[open]').forEach(d => {
                if (d !== details) closeEssayWithAnim(d);
            });

            // 2) 打开新文章
            details.open = true;

            // 3) 刷新面包屑 + 加载内容
            refreshBreadcrumb();
            loadEssay(details);
        }
    }, true);

    /* ============================================
       toggle：只处理文件夹
       essay-file 的开关已完全由上面接管
       ============================================ */
    document.addEventListener('toggle', (e) => {
        const details = e.target;
        if (!details || !details.matches) return;
        if (!details.matches('details.tree-folder')) return;

        // 文件夹关闭 → 内部所有文章立即关闭
        if (!details.open) {
            details.querySelectorAll('details.essay-file[open]').forEach(f => {
                f.open = false;
            });
            clearTOC();
        }

        refreshBreadcrumb();
    }, true);

    refreshBreadcrumb();

    /* ============================================
       页面切换动画
       ============================================ */
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        const target = link.getAttribute('target');

        if (
            target === '_blank' ||
            link.hasAttribute('download') ||
            !href ||
            href.startsWith('#') ||
            href.startsWith('http://') ||
            href.startsWith('https://') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            href.startsWith('javascript:')
        ) return;

        e.preventDefault();
        document.body.classList.add('page-leaving');

        setTimeout(() => {
            location.href = href;
        }, 260);
    });

    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            document.body.classList.remove('page-leaving');
            document.body.style.animation = 'none';
            void document.body.offsetHeight;
            document.body.style.animation = '';
        }
    });

})();