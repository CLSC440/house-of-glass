function applySmartTheme() {
    const isAutoEnabled = localStorage.getItem('autoThemeEnabled') !== 'false';
    const manualTheme = localStorage.getItem('darkMode');
    const overrideTime = localStorage.getItem('themeOverrideTime');
    const now = Date.now();

    if (!isAutoEnabled) {
        if (manualTheme === 'true') document.documentElement.classList.add('dark');
        else if (manualTheme === 'false') document.documentElement.classList.remove('dark');
        return;
    }

    if (overrideTime && (now - overrideTime > 600000)) {
        localStorage.removeItem('darkMode');
        localStorage.removeItem('themeOverrideTime');
    } else if (manualTheme !== null) {
        if (manualTheme === 'true') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return;
    }

    const hour = new Date().getHours();
    if (hour < 6 || hour >= 18) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

applySmartTheme();