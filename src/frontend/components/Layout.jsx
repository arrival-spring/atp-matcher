import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t, getLocale } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import { TierProvider } from './TierContext';

/**
 * Navigation header component with logo, tier label, and optional spider name.
 */
function Header({ basePath, tier, spiderName, isIndex }) {
    const isAuto = tier === 'auto';
    const gradientClass = isAuto ? 'from-blue-400 to-teal-400' : 'from-amber-400 to-orange-400';

    const logo = isIndex
        ? h(
              'span',
              {
                  class: 'font-extrabold text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400 shrink-0',
              },
              t('title')
          )
        : h(
              'a',
              {
                  href: `${basePath}/`,
                  class: 'font-extrabold text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400 hover:opacity-80 transition-opacity shrink-0',
              },
              t('title')
          );

    const tierLabel =
        !isIndex &&
        (spiderName
            ? h(
                  'a',
                  {
                      href: `${basePath}/${tier}/`,
                      class: `font-bold text-lg md:text-xl bg-clip-text text-transparent bg-gradient-to-r ${gradientClass} hover:opacity-80 transition-opacity shrink-0`,
                  },
                  t(`nav.${tier}`)
              )
            : h(
                  'span',
                  {
                      class: `font-bold text-lg md:text-xl bg-clip-text text-transparent bg-gradient-to-r ${gradientClass} shrink-0`,
                  },
                  t(`nav.${tier}`)
              ));

    // For SEO/Accessibility:
    // On Index and Dashboard, the logo/tier combo is the H1.
    // On SpiderPage, the spiderName is the H1.
    const TitleContainer = spiderName ? 'div' : 'h1';

    return h('header', { class: 'mb-8' }, [
        h('div', { class: 'flex flex-col md:flex-row md:items-baseline gap-x-4 gap-y-1' }, [
            h(TitleContainer, { class: 'flex items-baseline gap-x-4' }, [logo, tierLabel]),
            spiderName && h('h1', { class: 'text-xl md:text-2xl font-bold text-gray-400 truncate' }, spiderName),
        ]),
    ]);
}

/**
 * The base layout component for all pages in the application.
 * Includes the HTML head, localized footer with data dates, and initializes the tier.
 *
 * @param {Object} props - The component props.
 * @param {string} props.title - The page title (displayed in the browser tab).
 * @param {string} props.basePath - The base path for links and assets.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {string} props.osmDate - The date of the latest OSM extract.
 * @param {string} [props.tier='auto'] - The spider's tier ('auto' or 'preview').
 * @param {string} [props.spiderName] - The name of the spider (optional).
 * @param {boolean} [props.isIndex=false] - Whether this is the index page.
 * @param {import('preact').ComponentChildren} props.children - Child components to be rendered within the layout.
 */
export function Layout({ title, basePath, atpDate, osmDate, tier = 'auto', spiderName, isIndex = false, children }) {
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
            h('div', { class: 'max-w-7xl mx-auto relative' }, [
                h(TierProvider, { tier }, [h(Header, { basePath, tier, spiderName, isIndex }), children]),
            ]),
            h('footer', { class: 'max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm' }, [
                h('div', { class: 'flex flex-wrap gap-x-8 gap-y-2' }, [
                    h('div', null, [h('strong', { 'data-t': 'footer.atpData' }, t('footer.atpData')), ' ', atpDate]),
                    h('div', null, [h('strong', { 'data-t': 'footer.osmData' }, t('footer.osmData')), ' ', osmDate]),
                ]),
            ]),
        ]),
    ]);
}
