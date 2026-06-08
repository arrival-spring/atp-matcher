import en from '../locales/en.json';

const localeFiles = import.meta.glob('../locales/*.json', { eager: true });
const localesMetadata = [
    ...new Set([
        'en',
        ...Object.keys(localeFiles)
            .map(path => {
                const parts = path.split('/');
                const filename = parts[parts.length - 1];
                return filename.replace('.json', '');
            })
            .filter(code => code && code !== 'locales' && code !== 'en'),
    ]),
].sort();

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
    const savedLocale = localStorage.getItem(LOCAL_STORAGE_KEY);
    const browserLocales = navigator.languages || [navigator.language];

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

export const setLocale = async (locale) => {
    if (!translations[locale]) {
        try {
            const response = await fetch(`${window.basePath || ''}/locales/${locale}.json`);
            if (!response.ok) throw new Error('Failed to load locale');
            const data = await response.json();

            if (locale.includes('-')) {
                const baseLang = locale.split('-')[0];
                if (!translations[baseLang] && baseLang !== 'en') {
                    try {
                        const baseResponse = await fetch(`${window.basePath || ''}/locales/${baseLang}.json`);
                        if (baseResponse.ok) {
                            translations[baseLang] = await baseResponse.json();
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
                const baseTranslations = translations[baseLang] || translations['en'];
                translations[locale] = { ...baseTranslations, ...data };
            } else {
                translations[locale] = { ...translations['en'], ...data };
            }
        } catch (err) {
            console.error(`Could not load locale ${locale}, falling back to en`, err);
            locale = 'en';
        }
    }
    currentLocale = locale;
    localStorage.setItem(LOCAL_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    // Dispatch custom event to notify components
    window.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
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

    // Handle strong tags placeholder for complex cases if needed,
    // but for now we follow the requirement of simple placeholders.
    // The requirement was to let components handle strong tags when possible.

    return result;
};
