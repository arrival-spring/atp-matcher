import en from '../locales/en.json';

const getLocalesMetadata = () => {
    const codes = new Set(['en']);

    try {
        // @ts-ignore
        const globbed = import.meta.glob('../locales/*.json', { eager: true });
        for (const p in globbed) {
            const filename = p.split('/').pop();
            const code = filename.slice(0, filename.lastIndexOf('.json'));
            if (code && code !== 'locales') {
                codes.add(code);
            }
        }
    } catch (e) {
        // Fallback for Node.js if needed, but in this project
        // the backend generation also uses tsx which might handle this differently
        // or we can rely on a hardcoded list if glob fails.
    }

    // Node.js fallback (Backend generation)
    if (codes.size <= 1 && typeof process !== 'undefined' && process.versions?.node) {
        try {
            // Use dynamic import/require only in Node
            const fs = require('fs');
            const path = require('path');
            const localesDir = path.join(process.cwd(), 'src', 'locales');
            if (fs.existsSync(localesDir)) {
                fs.readdirSync(localesDir).forEach(f => {
                    if (f.endsWith('.json')) {
                        const code = f.replace('.json', '');
                        if (code !== 'locales') codes.add(code);
                    }
                });
            }
        } catch (err) {
            // Ignore
        }
    }

    return Array.from(codes).sort();
};

const localesMetadata = getLocalesMetadata();

let currentLocale = 'en';
let translations = { en };

const LOCAL_STORAGE_KEY = 'atp_osm_sync_locale';

export const getAvailableLocales = () => {
    return localesMetadata.map(code => {
        const getDisplayName = (locale) => {
            try {
                const langNames = new Intl.DisplayNames([locale], { type: 'language' });
                const baseName = langNames.of(code);

                if (code.includes('-')) {
                    const regionCode = code.split('-')[1].toUpperCase();
                    const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
                    const regionName = regionNames.of(regionCode);

                    const baseLang = code.split('-')[0];
                    const baseLangName = langNames.of(baseLang);
                    return `${baseLangName} (${regionName})`;
                }
                return baseName;
            } catch (e) {
                return code;
            }
        };

        return {
            code,
            native: getDisplayName(code),
            localized: getDisplayName(currentLocale),
            english: getDisplayName('en')
        };
    });
};

export const initI18n = async () => {
    const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    const savedLocale = isBrowser ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const browserLocales = isBrowser ? (navigator.languages || [navigator.language]) : [];

    let localeToUse = 'en';

    const findSupportedLocale = (loc) => {
        if (localesMetadata.includes(loc)) return loc;
        const short = loc.split('-')[0];
        if (localesMetadata.includes(short)) return short;
        return null;
    };

    if (savedLocale) {
        localeToUse = findSupportedLocale(savedLocale) || 'en';
    } else {
        for (const loc of browserLocales) {
            const found = findSupportedLocale(loc);
            if (found) {
                localeToUse = found;
                break;
            }
        }
    }

    await setLocale(localeToUse);
};

const deepMerge = (target, source) => {
    const output = { ...target };
    if (source && typeof source === 'object') {
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
};

export const setLocale = async (locale) => {
    const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

    if (!translations[locale]) {
        try {
            // Use absolute URL if basePath is available
            const url = `${window.basePath || ''}/locales/${locale}.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load locale: ${response.status}`);
            const data = await response.json();

            if (locale.includes('-')) {
                const baseLang = locale.split('-')[0];
                if (!translations[baseLang] && baseLang !== 'en') {
                    try {
                        const baseUrl = `${window.basePath || ''}/locales/${baseLang}.json`;
                        const baseResponse = await fetch(baseUrl);
                        if (baseResponse.ok) {
                            translations[baseLang] = await baseResponse.json();
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
                const baseTranslations = translations[baseLang] || translations['en'];
                translations[locale] = deepMerge(baseTranslations, data);
            } else {
                translations[locale] = deepMerge(translations['en'], data);
            }
        } catch (err) {
            console.error(`Could not load locale ${locale}, falling back to en`, err);
            locale = 'en';
        }
    }

    currentLocale = locale;

    if (isBrowser) {
        localStorage.setItem(LOCAL_STORAGE_KEY, locale);
        document.documentElement.lang = locale;

        // Update SSR-rendered elements
        document.querySelectorAll('[data-t]').forEach(el => {
            const key = el.getAttribute('data-t');
            const paramsAttr = el.getAttribute('data-t-params');
            const params = paramsAttr ? JSON.parse(paramsAttr) : {};
            const translated = t(key, params);

            if (el.getAttribute('data-t-html') === 'true' || el.innerHTML.includes('<span') || el.innerHTML.includes('<strong')) {
                el.innerHTML = translated;
            } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translated;
            } else {
                el.textContent = translated;
            }
        });

        // Update document title if possible
        if (document.title.includes(' | ')) {
            // Keep the first part of the title if it exists (e.g. "Spider Name | App Name")
            const parts = document.title.split(' | ');
            document.title = `${parts[0]} | ${t('title')}`;
        } else {
            document.title = t('title');
        }

        // Dispatch custom event to notify components
        window.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
    }
};

export const getLocale = () => currentLocale;

export const t = (key, placeholders = {}) => {
    const keys = key.split('.');
    let value = translations[currentLocale];
    let fallbackValue = translations['en'];

    for (const k of keys) {
        value = value ? value[k] : undefined;
        fallbackValue = fallbackValue ? fallbackValue[k] : undefined;
    }

    let result = value !== undefined ? value : fallbackValue;

    if (result === undefined) return key;

    if (typeof result === 'string') {
        Object.entries(placeholders).forEach(([k, v]) => {
            result = result.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v);
        });
    }

    return result;
};
