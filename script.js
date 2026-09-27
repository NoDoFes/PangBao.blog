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

        const openNodes = Array.from(document.querySelectorAll(
            'details.tree-folder[open], details.essay-file[open]'
        )).filter(n => {
            if (n.classList.contains('collapsing')) return false;
            let p = n.parentElement;
            while (p && p !== document.body) {
                if (p.matches && p.matches('details.tree-folder') && !p.open) {
                    return false;
                }
                p = p.parentElement;
            }
            return true;
        });

        if (!el.querySelector('.crumb-home')) {
            el.innerHTML = '<span class="crumb crumb-home"><i class="fas fa-home"></i> 首页</span>';
        }

        if (!openNodes.length) {
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

        const deepest = openNodes.find(n =>
            !openNodes.some(other => other !== n && n.contains(other))
        ) || openNodes[0];

        const labels = [];
        let cur = deepest;
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

    function onFolderCrumbClick(folderEl) {
        const opened = Array.from(folderEl.querySelectorAll('details.essay-file[open]'));

        if (!opened.length) {
            folderEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (window.scrollY < 10) {
            collapseAll(opened);
            return;
        }

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            collapseAll(opened);
        };

        window.addEventListener('scrollend', finish, { once: true });
        setTimeout(finish, 1000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function collapseAll(opened) {
        Promise.all(opened.map(collapseWithAnimation)).then(() => {
            refreshBreadcrumb();
        });
    }

    function collapseWithAnimation(fileEl) {
        return new Promise(resolve => {
            const body = fileEl.querySelector('.essay-body');
            if (!body || !fileEl.open) {
                fileEl.open = false;
                resolve();
                return;
            }

            fileEl.classList.add('collapsing');

            body.style.overflow = 'hidden';
            body.style.maxHeight = body.scrollHeight + 'px';
            body.style.transition = 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, transform 0.25s ease, padding 0.25s ease, margin 0.25s ease';

            requestAnimationFrame(() => {
                body.style.maxHeight = '0px';
                body.style.opacity = '0';
                body.style.transform = 'translateY(-6px)';
                body.style.paddingTop = '0';
                body.style.paddingBottom = '0';
                body.style.marginTop = '0';
                body.style.marginBottom = '0';
            });

            setTimeout(() => {
                fileEl.open = false;
                fileEl.classList.remove('collapsing');
                body.style.cssText = '';
                resolve();
            }, 320);
        });
    }

    /* ============================================
       点面包屑"首页"
       ============================================ */
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.crumb-home')) return;

        const openedFiles = Array.from(document.querySelectorAll('details.essay-file[open]'));
        const openedFolders = Array.from(document.querySelectorAll('details.tree-folder[open]'));

        if (!openedFiles.length && !openedFolders.length) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;

            Promise.all(openedFiles.map(collapseWithAnimation)).then(() => {
                const sortedFolders = openedFolders.sort((a, b) =>
                    b.querySelectorAll('details').length - a.querySelectorAll('details').length
                );
                sortedFolders.forEach(f => { f.open = false; });

                clearTOC();
                refreshBreadcrumb();
            });
        };

        window.addEventListener('scrollend', finish, { once: true });
        setTimeout(finish, 1000);
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
       拦截 essay-file 的关闭，走收起动画
       用捕获阶段，先于浏览器默认的 toggle 行为
       ============================================ */
    document.addEventListener('click', (e) => {
        const summary = e.target.closest('details.essay-file > summary');
        if (!summary) return;
        const details = summary.parentElement;
        if (!details || !details.matches('details.essay-file')) return;
        if (!details.open) return;                               // 关闭中，正常打开
        if (details.classList.contains('collapsing')) return;    // 动画中，忽略

        // 拦截默认行为，手动关闭并播动画
        e.preventDefault();
        e.stopPropagation();

        // 立即打上 collapsing，让 refreshBreadcrumb 过滤掉它
        details.classList.add('collapsing');
        refreshBreadcrumb();

        collapseWithAnimation(details).then(() => {
            refreshBreadcrumb();
            const stillOpen = document.querySelector('details.essay-file[open]');
            if (stillOpen) {
                const otherBody = stillOpen.querySelector('.essay-body');
                if (otherBody && window.PB && PB.buildTOC) PB.buildTOC(otherBody);
            } else {
                clearTOC();
            }
        });
    }, true);

    /* ============================================
       toggle 总控（处理打开 + 切换文章）
       ============================================ */
    document.addEventListener('toggle', (e) => {
        const details = e.target;
        if (!details || !details.matches) return;
        if (!details.matches('details.tree-folder, details.essay-file')) return;

        if (details.classList.contains('collapsing')) return;

        if (details.matches('details.essay-file')) {
            if (details.open) {
                const others = Array.from(document.querySelectorAll('details.essay-file[open]'))
                    .filter(d => d !== details && !d.classList.contains('collapsing'));

                if (others.length) {
                    refreshBreadcrumb();
                    others.forEach(d => d.classList.add('collapsing'));
                    others.forEach(collapseWithAnimation);
                    loadEssay(details);
                    return;
                }

                refreshBreadcrumb();
                loadEssay(details);
            }
            // 关闭分支已被 click 拦截处理，这里不再需要
            return;
        }

        if (!details.open) {
            const inside = Array.from(details.querySelectorAll('details.essay-file[open]'));
            inside.forEach(d => {
                if (d.classList.contains('collapsing')) return;
                d.classList.add('collapsing');
                d.open = false;
                d.classList.remove('collapsing');
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