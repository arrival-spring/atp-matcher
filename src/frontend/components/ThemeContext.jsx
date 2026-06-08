import { h, createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const ThemeContext = createContext({
    theme: 'auto',
    linkClass: (isVisited) => isVisited ? 'text-gray-600' : 'text-blue-400',
    hoverLinkClass: 'hover:text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700',
    borderClass: 'border-blue-500',
    spinnerClass: 'border-blue-600',
});

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ theme, children }) {
    const isAuto = theme === 'auto';
    const value = {
        theme,
        linkClass: (isVisited) => {
            if (isVisited) return 'text-gray-600';
            return isAuto ? 'text-blue-400' : 'text-amber-600';
        },
        hoverLinkClass: isAuto ? 'hover:text-blue-300' : 'hover:text-amber-500',
        buttonClass: isAuto ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700',
        borderClass: isAuto ? 'border-emerald-500' : 'border-amber-500',
        spinnerClass: isAuto ? 'border-emerald-600' : 'border-amber-600',
    };

    return h(ThemeContext.Provider, { value, children });
}
