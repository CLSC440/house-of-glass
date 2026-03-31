(function () {
  const supported = ["en", "ar"];
  const defaultLang = "en";

  function getLang() {
    const path = window.location.pathname;
    const isAuthPage = path.includes("login.html") || path.includes("signup.html");
    
    // Force English for all pages except login and signup
    if (!isAuthPage) return defaultLang;

    const saved = localStorage.getItem("lang");
    if (saved && supported.includes(saved)) return saved;
    return defaultLang;
  }

  function setLang(lang) {
    if (!supported.includes(lang)) return;
    localStorage.setItem("lang", lang);
  }

  async function loadLocale(lang) {
    const urls = [`/locales/${lang}.json`, `locales/${lang}.json`];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) return await res.json();
      } catch (e) {
        // try next
      }
    }
    if (window.LOCALES && window.LOCALES[lang]) {
      return window.LOCALES[lang];
    }
    return null;
  }

  function applyDir(lang) {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("rtl", lang === "ar");
  }

  function applyText(dict) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = dict[key];
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (dict[key]) el.setAttribute("placeholder", dict[key]);
    });
  }

  function updateToggleLabel(lang) {
    const toggle = document.getElementById("langToggle");
    if (!toggle) return;
    toggle.textContent = lang === "ar" ? "EN" : "AR";
  }

  async function applyLanguage(lang) {
    const dict = await loadLocale(lang);
    applyDir(lang);
    if (dict) applyText(dict);
    updateToggleLabel(lang);
    if (!dict) console.error("Locale load failed");
  }

  window.initI18n = async function () {
    const lang = getLang();
    await applyLanguage(lang);

    const toggle = document.getElementById("langToggle");
    if (toggle) {
      toggle.addEventListener("click", async () => {
        const current = getLang();
        const next = current === "en" ? "ar" : "en";
        setLang(next);
        await applyLanguage(next);
      });
    }
  };

  window.applyI18n = async function () {
    const lang = getLang();
    await applyLanguage(lang);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (window.initI18n) window.initI18n();
    });
  } else {
    if (window.initI18n) window.initI18n();
  }
})();
