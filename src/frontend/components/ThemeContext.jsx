import { h, createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const ThemeContext = createContext({
    theme: 'auto',
    linkClass: isVisited => (isVisited ? 'text-gray-600' : 'text-emerald-500'),
    hoverLinkClass: 'hover:text-emerald-400',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    borderClass: 'border-emerald-500',
    spinnerClass: 'border-emerald-600',
});

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ theme, children }) {
    const isAuto = theme === 'auto';
    const value = {
        theme,
        linkClass: isVisited => {
            if (isVisited) return 'text-gray-600';
            return isAuto ? 'text-emerald-500' : 'text-amber-600';
        },
        hoverLinkClass: isAuto ? 'hover:text-emerald-400' : 'hover:text-amber-500',
        buttonClass: isAuto ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700',
        borderClass: isAuto ? 'border-emerald-500' : 'border-amber-500',
        spinnerClass: isAuto ? 'border-emerald-600' : 'border-amber-600',
    };

    return h(ThemeContext.Provider, { value, children });
}
