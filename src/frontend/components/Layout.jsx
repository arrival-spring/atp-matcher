import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t, getLocale } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeProvider } from './ThemeContext';

/**
 * The base layout component for all pages in the application.
 * Includes the HTML head, localized footer with data dates, and initializes the theme.
 *
 * @param {Object} props - The component props.
 * @param {string} props.title - The page title (displayed in the browser tab).
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} [props.theme='auto'] - The tier theme ('auto' or 'preview').
 * @param {import('preact').ComponentChildren} props.children - Child components to be rendered within the layout.
 */
export function Layout({ title, basePath, atpDate, osmDate, theme = 'auto', children }) {
    const [currentLocale, setCurrentLocale] = useState(getLocale());

    useEffect(() => {
        const handleLocaleChange = e => setCurrentLocale(e.detail);
        window.addEventListener('localeChanged', handleLocaleChange);
        return () => window.removeEventListener('localeChanged', handleLocaleChange);
    }, []);

    return h('html', { lang: currentLocale, class: 'dark' }, [
        h('head', null, [
            h('meta', { charset: 'UTF-8' }),
            h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
            h('title', null, `${title} | ${t('title')}`),
            h('link', {
                rel: 'icon',
                href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔄</text></svg>',
            }),
            h('link', { href: `${basePath}/style.css`, rel: 'stylesheet' }),
            h('script', { dangerouslySetInnerHTML: { __html: `window.basePath = ${JSON.stringify(basePath)};` } }),
        ]),
        h('body', { class: 'bg-gray-950 text-gray-100 min-h-screen p-4 md:p-8 relative' }, [
            h('div', { id: 'language-switcher-root' }),
            h('div', { class: 'max-w-7xl mx-auto relative' }, [h(ThemeProvider, { theme }, children)]),
            h('footer', { class: 'max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm' }, [
                h('div', { class: 'flex flex-wrap gap-x-8 gap-y-2' }, [
                    h('div', null, [h('strong', { 'data-t': 'footer.atpData' }, t('footer.atpData')), ' ', atpDate]),
                    h('div', null, [h('strong', { 'data-t': 'footer.osmData' }, t('footer.osmData')), ' ', osmDate]),
                ]),
            ]),
        ]),
    ]);
}
