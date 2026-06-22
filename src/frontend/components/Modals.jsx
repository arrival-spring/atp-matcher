import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { useTier } from './TierContext';

/**
 * A modal component for displaying warnings when a tag mismatch is detected.
 * Includes a mandatory waiting period (progress bar) before the user can confirm they understand.
 *
 * @param {Object} props - The component props.
 * @param {string} props.title - The modal title.
 * @param {string} props.message - The warning message (can contain HTML).
 * @param {Function} props.onUnderstand - Callback when the 'Understand' button is clicked.
 * @param {Function} props.onBack - Callback when the 'Back' or 'Take me back' button is clicked.
 * @param {boolean} [props.showImportBtn] - Whether to show the JOSM import button after confirmation.
 */
export function MismatchModal({ title, message, onUnderstand, onBack, showImportBtn }) {
    const [progress, setProgress] = useState(0);
    const [canConfirm, setCanConfirm] = useState(false);
    const [isImport, setIsImport] = useState(false);
    const { buttonClass } = useTier();

    useEffect(() => {
        const start = Date.now();
        const duration = 2000;
        const interval = setInterval(() => {
            const elapsed = Date.now() - start;
            const p = Math.min(100, (elapsed / duration) * 100);
            setProgress(p);
            if (p === 100) {
                setCanConfirm(true);
                clearInterval(interval);
            }
        }, 16);
        return () => clearInterval(interval);
    }, []);

    const handleConfirm = () => {
        if (showImportBtn && !isImport) {
            setIsImport(true);
        } else {
            onUnderstand();
        }
    };

    return (
        <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
            <div class="p-8">
                <div class="flex items-center gap-4 mb-6 text-orange-400">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        ></path>
                    </svg>
                    <h3 class="text-2xl font-bold">{title}</h3>
                </div>
                <div class="text-lg text-gray-200 mb-8 leading-relaxed">
                    {typeof message === 'string' ? <p>{message}</p> : message}
                </div>
                <div class="flex justify-end gap-4">
                    <button
                        onClick={onBack}
                        class="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-600 font-medium cursor-pointer"
                    >
                        {showImportBtn ? t('dashboard.pagination.previous') : t('spider.modals.takeMeBack')}
                    </button>
                    {!isImport && (
                        <button
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            class="relative px-6 py-3 bg-gray-700 text-white rounded-lg font-medium overflow-hidden group disabled:opacity-100"
                        >
                            <div
                                class={`absolute inset-0 ${buttonClass} transition-all duration-100`}
                                style={{ width: `${progress}%` }}
                            />
                            <span class="relative z-10">{t('spider.modals.understand')}</span>
                        </button>
                    )}
                    {isImport && (
                        <button
                            onClick={onUnderstand}
                            class={`px-6 py-3 ${buttonClass} text-white rounded-lg transition-colors font-medium cursor-pointer`}
                        >
                            {t('spider.actions.openUnmapped')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * A modal component displayed when JOSM remote control fails to respond.
 *
 * @param {Object} props - The component props.
 * @param {Function} props.onClose - Callback to close the modal.
 */
export function JosmErrorModal({ onClose }) {
    const { buttonClass } = useTier();
    return (
        <div
            id="josm-modal"
            class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50"
        >
            <div class="p-8">
                <div class="flex items-center gap-4 mb-6 text-red-400">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        ></path>
                    </svg>
                    <h3 class="text-2xl font-bold">{t('spider.modals.josmError.title')}</h3>
                </div>
                <p class="text-lg text-gray-200 mb-8 leading-relaxed">{t('spider.modals.josmError.message')}</p>
                <div class="flex justify-end">
                    <button
                        onClick={onClose}
                        class={`px-6 py-3 ${buttonClass} text-white rounded-lg transition-colors font-medium cursor-pointer`}
                    >
                        {t('spider.modals.understand')}
                    </button>
                </div>
            </div>
        </div>
    );
}
