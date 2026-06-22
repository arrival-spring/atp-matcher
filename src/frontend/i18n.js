import en from '../locales/en.json';

/**
 * Initial list of supported locale codes.
 * This is updated during initialization if more locales are discovered.
 * @type {string[]}
 */
let LOCALES_METADATA = ['en'];

/**
 * Scans the locales directory using Vite's glob import to identify available language codes.
 * This works synchronously during the build/bundling process.
 */
function discoverLocalesFromGlob() {
    try {
        // @ts-ignore
        const globbed = import.meta.glob('../locales/*.json', { eager: true });
        for (const p in globbed) {
            const filename = p.split('/').pop();
            const code = filename.slice(0, filename.lastIndexOf('.json'));
            if (code && code !== 'locales') {
                if (!LOCALES_METADATA.includes(code)) {
                    LOCALES_METADATA.push(code);
                }
            }
        }
        LOCALES_METADATA.sort();
    } catch (e) {
        // Ignore if glob is not available (e.g. in pure Node environment)
    }
}

// Initial discovery via glob (if available)
discoverLocalesFromGlob();

let currentLocale = 'en';
let translations = { en };

const LOCAL_STORAGE_KEY = 'atp_osm_sync_locale';

/**
 * Returns a list of available locales with their display names in various formats.
 *
 * @returns {Object[]} An array of locale objects containing code, native name, localised name and English name.
 */
export function getAvailableLocales() {
    return LOCALES_METADATA.map(code => {
        const getDisplayName = locale => {
            try {
                const langNames = new Intl.DisplayNames([locale], { type: 'language' });
                const name = langNames.of(code);
                const langCode = code.split('-')[0];

                // If the name is just the code or appears to be a fallback (e.g. "nn (Norway)"),
                // try to get the name for the base language instead.
                const isFallback =
                    name === code ||
                    name === langCode ||
                    name.startsWith(`${code} `) ||
                    name.startsWith(`${langCode} `) ||
                    name.includes(`(${code})`) ||
                    name.includes(`(${langCode})`);

                if (isFallback && code.includes('-')) {
                    const baseName = langNames.of(langCode);
                    const isBaseFallback =
                        baseName === langCode ||
                        baseName.startsWith(`${langCode} `) ||
                        baseName.includes(`(${langCode})`);
                    if (!isBaseFallback) {
                        return baseName;
                    }
                }
                return name;
            } catch (e) {
                return code;
            }
        };

        return {
            code,
            native: getDisplayName(code),
            localised: getDisplayName(currentLocale),
            english: getDisplayName('en'),
        };
    });
}

/**
 * Initialises the internationalization system.
 * Detects the preferred locale from localStorage or browser settings and loads the corresponding translations.
 *
 * @param {string[]} [supportedLocales] - Optional array of supported locale codes.
 * @returns {Promise<void>}
 */
export async function initI18n(supportedLocales) {
    const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

    if (supportedLocales && Array.isArray(supportedLocales)) {
        LOCALES_METADATA = Array.from(new Set([...LOCALES_METADATA, ...supportedLocales])).sort();
    } else if (isBrowser && LOCALES_METADATA.length <= 1) {
        try {
            const response = await fetch(`${window.basePath || ''}/locales/index.json`);
            if (response.ok) {
                const codes = await response.json();
                if (Array.isArray(codes)) {
                    LOCALES_METADATA = Array.from(new Set([...LOCALES_METADATA, ...codes])).sort();
                }
            }
        } catch (e) {
            // Fallback to what we have
        }
    }
    const savedLocale = isBrowser ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const browserLocales = isBrowser ? navigator.languages || [navigator.language] : [];

    let localeToUse = 'en';

    const findSupportedLocale = loc => {
        if (LOCALES_METADATA.includes(loc)) return loc;
        const short = loc.split('-')[0];
        if (LOCALES_METADATA.includes(short)) return short;
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
}

/**
 * Performs a deep merge of two objects.
 * Used for merging sub-locales with their parent main locales.
 *
 * @param {Object} target - The target object to merge into.
 * @param {Object} source - The source object to merge from.
 * @returns {Object} The merged object.
 */
function deepMerge(target, source) {
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
}

/**
 * Changes the current locale and loads its translation file.
 * In the browser, it also updates the DOM elements marked with 'data-t' attributes.
 *
 * @param {string} locale - The locale code to set.
 * @returns {Promise<void>}
 */
export async function setLocale(locale) {
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

            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translated;
                return;
            }

            // Handle elements with nested structure that we want to preserve (like stats in IndexPage)
            const statsParts = translated.split(/({{\s*[xy]\s*}})/);
            if (statsParts.length > 1) {
                let xIdx = 0;
                let yIdx = 0;
                const placeholders = el.querySelectorAll('[data-t-ignore]');
                el.childNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-t-ignore')) {
                        // Keep the placeholder as is
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        // This is tricky as we need to replace text nodes while keeping elements in place.
                        // For simplicity in this specific project's IndexPage, we can reconstruct the innerHTML
                        // but that might lose Preact's event listeners.
                        // However, IndexPage cards are just links.
                    }
                });

                // Simpler approach for the specific stats use case:
                const xSpan = el.querySelector('span.text-4xl');
                const ySpan = el.querySelector('span.text-xl');

                if (xSpan && ySpan) {
                    const xVal = xSpan.textContent;
                    const yVal = ySpan.textContent;
                    el.innerHTML = translated
                        .replace(
                            /{{\s*x\s*}}/,
                            `<span class="text-4xl font-bold text-white" data-t-ignore>${xVal}</span>`
                        )
                        .replace(/{{\s*y\s*}}/, `<span class="text-xl" data-t-ignore>${yVal}</span>`);
                    return;
                }
            }

            if (
                el.getAttribute('data-t-html') === 'true' ||
                el.innerHTML.includes('<span') ||
                el.innerHTML.includes('<strong')
            ) {
                el.innerHTML = translated;
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
}

/**
 * Returns the currently active locale code.
 *
 * @returns {string} The active locale code.
 */
export function getLocale() {
    return currentLocale;
}

/**
 * Translates a key into the current locale.
 * Supports dot-notation for nested keys and {{variable}} placeholders.
 * Falls back to the 'en' locale if the key is missing from the current locale.
 *
 * @param {string} key - The translation key (e.g., 'spider.status.matching').
 * @param {Object} [placeholders={}] - Optional object containing values for placeholders.
 * @returns {string} The translated string or the key itself if not found.
 */
export function t(key, placeholders = {}) {
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
}
