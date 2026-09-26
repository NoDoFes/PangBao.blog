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
})();