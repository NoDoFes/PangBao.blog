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
        let effectiveTheme;
        if (themePreference === 'system') {
            effectiveTheme = getSystemTheme();
        } else {
            effectiveTheme = themePreference;
        }
        html.setAttribute('data-theme', effectiveTheme);

        document.querySelectorAll('.theme-btn').forEach(btn => {
            const val = btn.dataset.themeValue;
            btn.classList.toggle('active', val === themePreference);
        });

        localStorage.setItem(STORAGE_KEY, themePreference);
    }

    let systemMediaListener = null;

    function startSystemListener() {
        if (systemMediaListener) return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        systemMediaListener = (e) => {
            if (getPreferredTheme() === 'system') {
                applyTheme('system');
            }
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
        if (preference === 'system') {
            startSystemListener();
        } else {
            stopSystemListener();
        }
    }

    function setTheme(value) {
        stopSystemListener();
        applyTheme(value);
        if (value === 'system') {
            startSystemListener();
        }
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const value = this.dataset.themeValue;
            setTheme(value);
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

            // 平滑滚动到社交栏
            socialBar.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 移除 → 强制重排 → 再加，保证连续点击都能重播动画
            socialBar.classList.remove('highlight');
            void socialBar.offsetWidth;
            socialBar.classList.add('highlight');

            // 等三个动画都跑完再移除类，避免干扰鼠标 hover
            clearTimeout(timer);
            timer = setTimeout(() => {
                socialBar.classList.remove('highlight');
            }, 1800);
        });
    })();

})();