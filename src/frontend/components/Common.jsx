import { h, Fragment } from 'preact';
import { markLinkVisited, handleJosmLink } from '../utils';
import { t } from '../i18n';
import { useTheme } from './ThemeContext';
import { getMissingDays, formatMissingDays } from '../../utils';

/**
 * A label component that displays the status of a tag or item.
 *
 * @param {Object} props - The component props.
 * @param {string} props.status - The status string (e.g., 'matching', 'mismatch').
 */
export function StatusLabel({ status }) {
    if (!status) return null;
    const isSpecial = status.includes('(');
    let label;
    if (isSpecial) {
        const [baseStatus, extra] = status.split(' (');
        label = `${t(`spider.status.${baseStatus}`)} (${extra}`;
    } else {
        label = t(`spider.status.${status}`);
    }
    return (
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 border border-gray-700 text-gray-300 inline-block align-middle ml-2">
            {label}
        </span>
    );
}

/**
 * Displays a tag value. Websites are rendered as links.
 * Shows a warning for opening_hours if missing days are detected.
 *
 * @param {Object} props - The component props.
 * @param {string} props.value - The value of the tag.
 * @param {string} props.tag - The key of the tag.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {boolean} [props.showOpeningHoursWarning=false] - Whether to show missing days warnings.
 */
export function TagValue({ value, tag, visitedSet, showOpeningHoursWarning }) {
    const { linkClass } = useTheme();
    if (!value) return null;

    let warning = null;
    if (showOpeningHoursWarning && tag === 'opening_hours') {
        const missing = getMissingDays(value);
        if (missing && missing.length > 0) {
            const formatted = formatMissingDays(missing);
            warning = (
                <span class="mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-900/50 border border-amber-700 text-amber-200 inline-block">
                    {t('spider.table.missingDaysWarning', { days: formatted })}
                </span>
            );
        }
    }

    if ((tag === 'website' || tag === 'contact:website') && value) {
        const isVisited = visitedSet.has(value);
        return (
            <a
                href={value}
                target="_blank"
                class={`${linkClass(isVisited)} hover:underline break-all`}
                onClick={e => e.stopPropagation()}
            >
                {value}
            </a>
        );
    }

    if (warning) {
        return (
            <div class="flex flex-col items-start">
                <code class="text-sm break-all">{value}</code>
                {warning}
            </div>
        );
    }

    return <code class="text-sm break-all">{value}</code>;
}

/**
 * Renders a list of tag key-value pairs with links for website tags.
 *
 * @param {Object} props - The component props.
 * @param {Object} props.tags - An object containing tag key-value pairs.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {boolean} [props.showOpeningHoursWarning=false] - Whether to show missing days warnings.
 */
export function TagsWithLinks({ tags, visitedSet, showOpeningHoursWarning }) {
    if (!tags) return null;
    return Object.entries(tags).map(([k, v]) => (
        <div key={k}>
            <span class="text-gray-500">{k}=</span>
            <TagValue value={v} tag={k} visitedSet={visitedSet} showOpeningHoursWarning={showOpeningHoursWarning} />
        </div>
    ));
}

/**
 * Displays the current value for a spider tag, along with stability indicators
 * and a history of previous values if they differ from the current one.
 *
 * @param {Object} props - The component props.
 * @param {string} props.value - The current value.
 * @param {Object[]} [props.history=[]] - Array of historical values and dates.
 * @param {string} props.tag - The tag name.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {boolean} [props.isStable=false] - Whether the value is considered stable.
 * @param {boolean} [props.isNewValue=false] - Whether the value is new in this run.
 */
export function SpiderValue({ value, history, tag, visitedSet, isStable, isNewValue }) {
    if (!value) return null;

    let indicator = null;
    if (isStable) {
        indicator = (
            <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>{t('spider.tooltips.stableValue')}</title>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
            </svg>
        );
    } else if (isNewValue) {
        indicator = (
            <svg class="w-4 h-4 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <title>{t('spider.tooltips.newValue')}</title>
                <path d="M12 2l1.5 4.5H18l-3.75 2.75L15.75 14 12 11.25 8.25 14l1.5-4.75L6 6.5h4.5L12 2z" />
            </svg>
        );
    }

    // Include runs where item exists but value might be missing
    const relevantHistory = history ? history.filter(h => h.itemExists) : [];
    const hasVariation = relevantHistory.some(h => h.value !== value);
    const showHistory = relevantHistory.length > 0 && hasVariation;

    return (
        <div class="space-y-1">
            <div class="flex items-start gap-2 font-bold text-white">
                {indicator && <div class="mt-0.5">{indicator}</div>}
                <TagValue value={value} tag={tag} visitedSet={visitedSet} showOpeningHoursWarning={true} />
            </div>
            {showHistory && (
                <div class="pl-2 border-l border-gray-700 space-y-2">
                    {(() => {
                        const reversed = [...relevantHistory].reverse();
                        const groups = [];
                        reversed.forEach(h => {
                            const lastGroup = groups[groups.length - 1];
                            if (lastGroup && lastGroup.value === h.value) {
                                lastGroup.dates.push(h.date);
                            } else {
                                groups.push({ value: h.value, dates: [h.date] });
                            }
                        });

                        return groups.map((group, i) => (
                            <div key={i} class="text-xs text-gray-400 flex items-center gap-3">
                                <div class="font-mono shrink-0 flex flex-col">
                                    {group.dates.map(date => (
                                        <span key={date}>{date}</span>
                                    ))}
                                </div>
                                <div class="text-gray-300 flex-grow">
                                    {group.value ? (
                                        <TagValue
                                            value={group.value}
                                            tag={tag}
                                            visitedSet={visitedSet}
                                            showOpeningHoursWarning={true}
                                        />
                                    ) : (
                                        <i class="opacity-50">{t('spider.table.noValue')}</i>
                                    )}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            )}
        </div>
    );
}

/**
 * Displays OSM identification and provides links to OpenStreetMap and JOSM remote control.
 *
 * @param {Object} props - The component props.
 * @param {string|number} props.osmId - The OSM ID (with type prefix, e.g., 'n123').
 * @param {Object} [props.suggestedFixes={}] - An object of tag fixes to be applied via JOSM.
 * @param {Set<string>} props.visitedSet - A set of visited URLs.
 * @param {string} props.atpDate - The date of the ATP run.
 * @param {Function} [props.onVisited] - Callback when a link is clicked.
 * @param {Function} [props.onJosmError] - Callback if JOSM remote control fails.
 */
export function OsmColumn({ osmId, suggestedFixes = {}, visitedSet, atpDate, onVisited, onJosmError }) {
    const { linkClass } = useTheme();
    if (!osmId) return null;
    const typeMap = { n: 'node', w: 'way', r: 'relation' };
    const typeChar = osmId.toString()[0];
    const osmType = typeMap[typeChar];
    const id = osmId.toString().substring(1);
    if (!osmType) return null;

    const osmUrl = `https://www.openstreetmap.org/${osmType}/${id}`;
    const isOsmVisited = visitedSet.has(osmUrl);

    const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
    const josmEditUrl = `${josmFixBaseUrl}?objects=${osmType[0]}${id}&relation_members=true`;
    const isJosmEditVisited = visitedSet.has(josmEditUrl);

    const encodedTags = Object.entries(suggestedFixes).map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = value ? encodeURIComponent(value) : '';
        return `${encodedKey}=${encodedValue}`;
    });

    const addtagsValue = encodedTags.join(encodeURIComponent('|'));
    const josmUpdateUrl = `${josmEditUrl}&addtags=${addtagsValue}`;
    const isJosmUpdateVisited = visitedSet.has(josmUpdateUrl);

    const hasFixes = Object.keys(suggestedFixes).length > 0;

    return (
        <div class="flex flex-col md:items-end gap-1 mt-2 md:mt-0 pt-2 md:pt-0 border-t border-gray-800 md:border-none">
            <div class="flex items-center gap-4 md:flex-col md:items-end md:gap-1">
                <a
                    href={osmUrl}
                    target="_blank"
                    class={`inline-flex items-center ${linkClass(isOsmVisited)} hover:underline`}
                    onClick={() => {
                        markLinkVisited(osmUrl, atpDate);
                        if (onVisited) onVisited();
                    }}
                >
                    <span>{osmId}</span>
                    <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        ></path>
                    </svg>
                </a>
                <div class="text-xs text-gray-500">
                    <a
                        href="javascript:void(0)"
                        onClick={() => handleJosmLink(josmEditUrl, atpDate, onVisited, onJosmError)}
                        class={`${linkClass(isJosmEditVisited)} hover:underline`}
                    >
                        {t('spider.actions.edit')}
                    </a>
                    {hasFixes && (
                        <a
                            href="javascript:void(0)"
                            onClick={() => handleJosmLink(josmUpdateUrl, atpDate, onVisited, onJosmError)}
                            class={`${linkClass(isJosmUpdateVisited)} hover:underline ml-1`}
                        >
                            {t('spider.actions.update')}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Renders one or more JOSM links to open multiple OSM features at once.
 *
 * @param {Object} props - The component props.
 * @param {Object[]} props.items - Array of objects with an 'id' property.
 * @param {string} props.atpDate - The date of the ATP run.
 * @param {Function} [props.onVisited] - Callback when a link is clicked.
 * @param {Function} [props.onJosmError] - Callback if JOSM remote control fails.
 */
export function BulkJosmLinks({ items, atpDate, onVisited, onJosmError }) {
    const { linkClass } = useTheme();
    if (items.length === 0) return null;
    const BATCH_SIZE = 100;

    if (items.length <= BATCH_SIZE) {
        const objects = items.map(r => r.id[0] + r.id.substring(1)).join(',');
        const josmUrl = `http://127.0.0.1:8111/load_object?objects=${objects}&relation_members=true`;
        return (
            <a
                href="javascript:void(0)"
                onClick={() => handleJosmLink(josmUrl, atpDate, onVisited, onJosmError)}
                class={`${linkClass(false)} hover:underline text-sm`}
            >
                {t('spider.actions.openUnmatched')}
            </a>
        );
    }

    const links = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const objects = batch.map(r => r.id[0] + r.id.substring(1)).join(',');
        const josmUrl = `http://127.0.0.1:8111/load_object?objects=${objects}&relation_members=true`;
        const label = `(${i + 1}-${Math.min(i + BATCH_SIZE, items.length)})`;
        links.push(
            <a
                key={label}
                href="javascript:void(0)"
                onClick={() => handleJosmLink(josmUrl, atpDate, onVisited, onJosmError)}
                class={`${linkClass(false)} hover:underline text-sm`}
            >
                {label}
            </a>
        );
    }

    return (
        <Fragment>
            <div class="text-gray-400 text-sm mb-2">{t('spider.actions.openUnmatched')}</div>
            <div class="flex flex-wrap justify-center gap-4">{links}</div>
        </Fragment>
    );
}

/**
 * A generic pagination component with Previous/Next buttons and page information.
 *
 * @param {Object} props - The component props.
 * @param {number} props.page - The current page number.
 * @param {number} props.totalPages - The total number of pages.
 * @param {Function} props.onPageChange - Callback when the page changes.
 * @param {number} props.totalItems - The total number of items across all pages.
 */
export function Pagination({ page, totalPages, onPageChange, totalItems }) {
    return (
        <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg">
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer text-sm font-medium"
            >
                {t('index.pagination.previous')}
            </button>
            <span class="text-gray-400 font-medium text-sm">{t('index.pagination.pageOf', { page, totalPages })}</span>
            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages || totalItems === 0}
                class="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer text-sm font-medium"
            >
                {t('index.pagination.next')}
            </button>
        </div>
    );
}

/**
 * A loading spinner component with an optional message.
 *
 * @param {Object} props - The component props.
 * @param {string} props.message - The message to display while loading.
 */
export function LoadingIndicator({ message }) {
    const { spinnerClass } = useTheme();
    return (
        <div class="py-12 flex flex-col items-center justify-center gap-4">
            <div class={`w-12 h-12 border-4 ${spinnerClass} border-t-transparent rounded-full animate-spin`}></div>
            <p class="text-gray-400 animate-pulse">{message}</p>
        </div>
    );
}
