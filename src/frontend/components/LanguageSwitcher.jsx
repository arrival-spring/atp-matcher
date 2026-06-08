import { h } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { t, getAvailableLocales, getLocale, setLocale } from '../i18n';
import { useTheme } from './ThemeContext';

export function LanguageSwitcher() {
    const { linkClass, theme } = useTheme();
    const isAuto = theme === 'auto';
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [currentLocale, setCurrentLocale] = useState(getLocale());
    const searchInputRef = useRef(null);

    useEffect(() => {
        const handleLocaleChange = (e) => setCurrentLocale(e.detail);
        window.addEventListener('localeChanged', handleLocaleChange);
        return () => window.removeEventListener('localeChanged', handleLocaleChange);
    }, []);

    useEffect(() => {
        if (isMenuOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isMenuOpen]);

    const locales = useMemo(() => getAvailableLocales(), [currentLocale]);
    const filteredLocales = useMemo(() => {
        const s = search.toLowerCase();
        return locales.filter(meta =>
            meta.code.toLowerCase().includes(s) ||
            meta.native.toLowerCase().includes(s) ||
            meta.localized.toLowerCase().includes(s) ||
            meta.english.toLowerCase().includes(s)
        );
    }, [locales, search]);

    return h('div', { class: 'absolute top-4 right-4 z-50' }, [
        h('button', {
            onClick: (e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
            },
            class: 'p-1.5 rounded-full hover:bg-gray-800 transition-colors text-xl leading-none cursor-pointer bg-gray-900 shadow-lg border border-gray-700',
            title: 'Switch Language'
        }, '🌐'),
        isMenuOpen && h('div', {
            class: 'fixed inset-0 z-40 cursor-default',
            onClick: () => setIsMenuOpen(false)
        }),
        isMenuOpen && h('div', {
            class: 'absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50',
            onClick: (e) => e.stopPropagation()
        }, [
            h('div', { class: 'p-2 border-b border-gray-700' }, [
                h('input', {
                    ref: searchInputRef,
                    type: 'text',
                    class: `w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 ${isAuto ? 'focus:ring-emerald-500' : 'focus:ring-amber-500'}`,
                    placeholder: t('locales.searchPlaceholder'),
                    value: search,
                    onInput: (e) => setSearch(e.target.value)
                })
            ]),
            h('div', { class: 'max-h-64 overflow-y-auto' },
                filteredLocales.length > 0 ?
                filteredLocales.map(meta =>
                    h('button', {
                        key: meta.code,
                        onClick: () => {
                            setLocale(meta.code);
                            setIsMenuOpen(false);
                            setSearch('');
                        },
                        class: `w-full text-left px-4 py-2 hover:bg-gray-800 transition-colors flex items-center justify-between ${currentLocale === meta.code ? `${linkClass(false)} font-bold` : 'text-gray-300'}`
                    }, [
                        h('span', null, meta.native),
                        currentLocale === meta.code && h('span', null, '✓')
                    ])
                ) :
                h('div', { class: 'px-4 py-3 text-sm text-gray-500 italic' }, t('locales.noResults'))
            )
        ])
    ]);
}
