(function() {
    // ---------- 主题切换逻辑 ----------
    const STORAGE_KEY = 'theme-preference';
    const html = document.documentElement;

    function getPreferredTheme() {
        return localStorage.getItem(STORAGE_KEY) || 'system';
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(themePreference) {
        let effectiveTheme = themePreference === 'system' ? getSystemTheme() : themePreference;
        html.setAttribute('data-theme', effectiveTheme);

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeValue === themePreference);
        });
        localStorage.setItem(STORAGE_KEY, themePreference);
    }

    let systemMediaListener = null;

    function startSystemListener() {
        if (systemMediaListener) return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        systemMediaListener = () => {
            if (getPreferredTheme() === 'system') applyTheme('system');
        };
        media.addEventListener('change', systemMediaListener);
    }

    function stopSystemListener() {
        if (systemMediaListener) {
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            media.removeEventListener('change', systemMediaListener);
            systemMediaListener = null;
        }
    }

    function initTheme() {
        const preference = getPreferredTheme();
        applyTheme(preference);
        preference === 'system' ? startSystemListener() : stopSystemListener();
    }

    function setTheme(value) {
        stopSystemListener();
        applyTheme(value);
        if (value === 'system') startSystemListener();
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            setTheme(this.dataset.themeValue);
        });
    });

    initTheme();

    // ---------- 点击"去联系胖宝"：平滑滚动 + 依次发光 ----------
    (function () {
        const trigger = document.getElementById('contactTrigger');
        const socialBar = document.getElementById('contact');
        if (!trigger || !socialBar) return;

        let timer = null;
        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            socialBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
            socialBar.classList.remove('highlight');
            void socialBar.offsetWidth;
            socialBar.classList.add('highlight');
            clearTimeout(timer);
            timer = setTimeout(() => socialBar.classList.remove('highlight'), 1800);
        });
    })();

    // ---------- 随笔展开加载（懒加载 + 缓存 + hover 预加载） ----------
    (function () {
        const cache = new Map();     // 已渲染过的 HTML
        const pending = new Map();   // 正在下载的 md 文本

        // 预加载：只下载 md 文本，不渲染
        function prefetch(mdPath) {
            if (cache.has(mdPath) || pending.has(mdPath)) return;
            const p = fetch(mdPath, { cache: 'no-cache' })
                .then(res => res.ok ? res.arrayBuffer() : Promise.reject(res.status))
                .then(buf => new TextDecoder('utf-8').decode(buf));
            pending.set(mdPath, p);
            p.catch(() => pending.delete(mdPath));
        }

        document.querySelectorAll('details.essay-item').forEach(details => {
            const body = details.querySelector('.essay-body');
            const summary = details.querySelector('summary');
            const mdPath = details.dataset.md;
            if (!body || !mdPath) return;

            let loaded = false;

            // hover / focus 预加载
            if (summary) {
                summary.addEventListener('mouseenter', () => prefetch(mdPath));
                summary.addEventListener('focus', () => prefetch(mdPath));
            }

            details.addEventListener('toggle', function () {
                if (!details.open || loaded) return;
                loaded = true;

                // 缓存命中：直接显示
                if (cache.has(mdPath)) {
                    body.innerHTML = cache.get(mdPath);
                    return;
                }

                if (!window.PB || !PB.renderPost) {
                    body.innerHTML = '<p class="post-error">渲染脚本未加载</p>';
                    return;
                }

                // 骨架屏
                body.innerHTML = `
                    <div class="essay-skeleton">
                        <div class="essay-skeleton-line"></div>
                        <div class="essay-skeleton-line"></div>
                        <div class="essay-skeleton-line"></div>
                    </div>
                `;

                PB.renderPost(body, mdPath, { showHeader: false, showTOC: false })
                    .then(() => cache.set(mdPath, body.innerHTML))
                    .catch(() => {});
            });
        });
    })();
})();