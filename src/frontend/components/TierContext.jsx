import { h, createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const TierContext = createContext({
    tier: 'auto',
    linkClass: isVisited => (isVisited ? 'text-gray-600' : 'text-emerald-500'),
    hoverLinkClass: 'hover:text-emerald-400',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    borderClass: 'border-emerald-500',
    spinnerClass: 'border-emerald-600',
});

/**
 * Hook to access the current tier context.
 *
 * @returns {Object} The current tier context values.
 */
export function useTier() {
    return useContext(TierContext);
}

/**
 * Provider component that sets the tier for its children.
 *
 * @param {Object} props - The component props.
 * @param {string} props.tier - The spider's tier ('auto' or 'preview').
 * @param {import('preact').ComponentChildren} props.children - Child components.
 */
export function TierProvider({ tier, children }) {
    const isAuto = tier === 'auto';
    const value = {
        tier,
        linkClass: isVisited => {
            if (isVisited) return 'text-gray-600';
            return isAuto ? 'text-emerald-500' : 'text-amber-600';
        },
        hoverLinkClass: isAuto ? 'hover:text-emerald-400' : 'hover:text-amber-500',
        buttonClass: isAuto ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700',
        borderClass: isAuto ? 'border-emerald-500' : 'border-amber-500',
        spinnerClass: isAuto ? 'border-emerald-600' : 'border-amber-600',
    };

    return h(TierContext.Provider, { value, children });
}
