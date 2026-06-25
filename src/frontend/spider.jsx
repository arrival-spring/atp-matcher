import { render, h, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { getVisitedLinks, markLinkVisited } from './utils';
import { t, initI18n } from './i18n';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { TabNavigation } from './components/TabNavigation';
import { SummaryTab } from './components/SummaryTab';
import { UnmappedTab } from './components/UnmappedTab';
import { UnmatchedTab } from './components/UnmatchedTab';
import { DuplicateRefsTab } from './components/DuplicateRefsTab';
import { TagTab } from './components/TagTab';
import { MismatchModal, JosmErrorModal } from './components/Modals';
import { TierProvider } from './components/TierContext';

const PAGE_SIZE = 25;

/**
 * The main dashboard component for a specific spider's detail page.
 * Manages tab navigation, data fetching for unmapped/unmatched items, and warning modals.
 * Persists its state (active tab, search, pagination, etc.) in the URL hash.
 *
 * @param {Object} props - The component props.
 * @param {string} props.spiderName - The name of the spider.
 * @param {Object[]} props.results - Matching results between ATP and OSM.
 * @param {string[]} props.importableTags - List of tags importable for this spider.
 * @param {string} props.atpDate - The date of the latest ATP run.
 * @param {boolean} props.showUnmatched - Whether to show the unmatched tab.
 * @param {number} props.unmappedCount - Initial count of unmapped items.
 * @param {number} props.unmatchedCount - Initial count of unmatched items.
 * @param {Object[]} [props.unmappedFilters=[]] - Pre-calculated filters for unmapped items.
 * @param {Object[]} [props.unmatchedFilters=[]] - Pre-calculated filters for unmatched items.
 */
function SpiderDashboard({
    spiderName,
    results,
    importableTags,
    atpDate,
    showUnmatched,
    unmappedCount,
    unmatchedCount,
    unmappedFilters = [],
    unmatchedFilters = [],
}) {
    const [currentLocale, setCurrentLocale] = useState(null);

    useEffect(() => {
        const handleLocaleChange = e => setCurrentLocale(e.detail);
        window.addEventListener('localeChanged', handleLocaleChange);
        return () => window.removeEventListener('localeChanged', handleLocaleChange);
    }, []);

    const [currentState, setCurrentState] = useState({
        tag: 'summary',
        status: null,
        page: 1,
        brand: null,
        wikidata: null,
        sort: null,
        dir: 'asc',
        search: '',
    });
    const isFirstRender = useRef(true);

    const [unmappedCache, setUnmappedCache] = useState(null);
    const [unmatchedCache, setUnmatchedCache] = useState(null);
    const [loadingUnmapped, setLoadingUnmapped] = useState(false);
    const [loadingUnmatched, setLoadingUnmatched] = useState(false);
    const [visited, setVisited] = useState(() => getVisitedLinks(atpDate));
    const [showMismatchModal, setShowMismatchModal] = useState(false);
    const [showJosmErrorModal, setShowJosmErrorModal] = useState(false);
    const [mismatchModalConfig, setMismatchModalConfig] = useState({});

    // Load state from URL hash
    useEffect(() => {
        const loadState = () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            setCurrentState({
                tag: params.get('tag') || 'summary',
                status: params.get('status'),
                page: parseInt(params.get('page')) || 1,
                brand: params.get('brand'),
                wikidata: params.get('wikidata'),
                sort: params.get('sort'),
                dir: params.get('dir') || 'asc',
                search: params.get('search') || '',
            });
        };

        loadState();
        window.addEventListener('popstate', loadState);
        return () => window.removeEventListener('popstate', loadState);
    }, []);

    // Update URL hash
    useEffect(() => {
        const params = new URLSearchParams();
        params.set('tag', currentState.tag);
        if (currentState.status) params.set('status', currentState.status);
        if (currentState.page > 1) params.set('page', currentState.page);
        if (currentState.brand !== null) params.set('brand', currentState.brand);
        if (currentState.wikidata !== null) params.set('wikidata', currentState.wikidata);
        if (currentState.search) params.set('search', currentState.search);
        if (currentState.sort) {
            params.set('sort', currentState.sort);
            params.set('dir', currentState.dir);
        }

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            const method = isFirstRender.current ? 'replaceState' : 'pushState';
            window.history[method](
                {},
                '',
                `${window.location.pathname}${window.location.search}${newHash ? '#' + newHash : ''}`
            );
        }
        isFirstRender.current = false;
    }, [currentState]);

    // Fetch Unmapped Data
    useEffect(() => {
        if (currentState.tag === 'unmapped' && !unmappedCache && !loadingUnmapped) {
            setLoadingUnmapped(true);
            fetch(`./${spiderName}_unmapped.json`)
                .then(res => res.json())
                .then(data => {
                    setUnmappedCache(data);
                    setLoadingUnmapped(false);
                })
                .catch(err => {
                    console.error('Failed to load unmapped data', err);
                    setUnmappedCache([]);
                    setLoadingUnmapped(false);
                });
        }
    }, [currentState.tag, spiderName, unmappedCache, loadingUnmapped]);

    // Fetch Unmatched Data
    useEffect(() => {
        if (currentState.tag === 'unmatched' && !unmatchedCache && !loadingUnmatched) {
            setLoadingUnmatched(true);
            fetch(`./${spiderName}_unmatched.json`)
                .then(res => res.json())
                .then(data => {
                    setUnmatchedCache(data);
                    setLoadingUnmatched(false);
                })
                .catch(err => {
                    console.error('Failed to load unmatched data', err);
                    setUnmatchedCache([]);
                    setLoadingUnmatched(false);
                });
        }
    }, [currentState.tag, spiderName, unmatchedCache, loadingUnmatched]);

    // Warning Modal for Mismatch
    useEffect(() => {
        if (currentState.status === 'mismatch') {
            const warnedTags = JSON.parse(sessionStorage.getItem(`mismatch_warned_tags_${spiderName}`) || '[]');
            if (!warnedTags.includes(currentState.tag)) {
                setMismatchModalConfig({
                    title: t('spider.modals.mismatch.title'),
                    message: (
                        <Fragment>
                            {t('spider.modals.mismatch.message')
                                .split(/({{\s*tag\s*}})/)
                                .map(part => {
                                    if (part.match(/{{\s*tag\s*}}/)) {
                                        return <strong class="text-white">{currentState.tag}</strong>;
                                    }
                                    return part;
                                })}
                        </Fragment>
                    ),
                    onUnderstand: () => {
                        const warnedTags = JSON.parse(
                            sessionStorage.getItem(`mismatch_warned_tags_${spiderName}`) || '[]'
                        );
                        if (!warnedTags.includes(currentState.tag)) {
                            warnedTags.push(currentState.tag);
                            sessionStorage.setItem(`mismatch_warned_tags_${spiderName}`, JSON.stringify(warnedTags));
                        }
                        setShowMismatchModal(false);
                    },
                    onBack: () => {
                        setCurrentState(prev => ({ ...prev, status: null }));
                        setShowMismatchModal(false);
                    },
                });
                setShowMismatchModal(true);
            }
        }
    }, [currentState.status, currentState.tag, spiderName]);

    const handleLinkClick = () => {
        setVisited(getVisitedLinks(atpDate));
    };

    const onJosmError = () => {
        setShowJosmErrorModal(true);
    };

    const isUniquelyMatched = r => r.matchCount === 1 && !['disallowedSourceUri', 'notABrandSpider'].includes(r.status);

    const switchTab = tag => {
        setCurrentState({
            tag,
            status: null,
            page: 1,
            brand: null,
            wikidata: null,
            search: '',
        });
    };

    const finalUnmappedCount =
        unmappedCache !== null
            ? unmappedCache.length +
              results.filter(r => ['disallowedSourceUri', 'notABrandSpider'].includes(r.status)).length
            : unmappedCount;

    const finalUnmatchedCount = unmatchedCache !== null ? unmatchedCache.length : unmatchedCount;

    return (
        <div class="space-y-4">
            <TabNavigation
                activeTab={currentState.tag}
                onTabChange={switchTab}
                showUnmatched={showUnmatched}
                importableTags={importableTags}
                hasDuplicates={results.some(r => r.matchCount > 1)}
                unmappedCount={finalUnmappedCount}
                unmatchedCount={finalUnmatchedCount}
            />

            <div id="tab-content" class="mt-4 md:mt-8">
                {currentState.tag === 'summary' && (
                    <SummaryTab
                        results={results}
                        importableTags={importableTags}
                        showUnmatched={showUnmatched}
                        unmappedCount={finalUnmappedCount}
                        unmatchedCount={finalUnmatchedCount}
                        onTabChange={switchTab}
                    />
                )}
                {currentState.tag === 'unmapped' && (
                    <UnmappedTab
                        results={results}
                        unmappedCache={unmappedCache}
                        loading={loadingUnmapped}
                        filters={unmappedFilters}
                        currentState={currentState}
                        setCurrentState={setCurrentState}
                        visitedSet={new Set(visited.links)}
                        spiderName={spiderName}
                        onJosmError={onJosmError}
                        pageSize={PAGE_SIZE}
                    />
                )}
                {currentState.tag === 'unmatched' && (
                    <UnmatchedTab
                        unmatchedCache={unmatchedCache}
                        loading={loadingUnmatched}
                        filters={unmatchedFilters}
                        currentState={currentState}
                        setCurrentState={setCurrentState}
                        visitedSet={new Set(visited.links)}
                        atpDate={atpDate}
                        onVisited={handleLinkClick}
                        onJosmError={onJosmError}
                        pageSize={PAGE_SIZE}
                    />
                )}
                {currentState.tag === 'duplicate-refs' && (
                    <DuplicateRefsTab
                        results={results}
                        currentState={currentState}
                        setCurrentState={setCurrentState}
                        visitedSet={new Set(visited.links)}
                        atpDate={atpDate}
                        onLinkClick={handleLinkClick}
                        onJosmError={onJosmError}
                        pageSize={PAGE_SIZE}
                    />
                )}
                {importableTags.includes(currentState.tag) && (
                    <TagTab
                        tag={currentState.tag}
                        results={results.filter(isUniquelyMatched)}
                        currentState={currentState}
                        setCurrentState={setCurrentState}
                        visitedSet={new Set(visited.links)}
                        onLinkClick={handleLinkClick}
                        atpDate={atpDate}
                        onJosmError={onJosmError}
                        pageSize={PAGE_SIZE}
                    />
                )}
            </div>

            {showMismatchModal && (
                <MismatchModal {...mismatchModalConfig} onClose={() => mismatchModalConfig.onBack()} />
            )}

            {showJosmErrorModal && <JosmErrorModal onClose={() => setShowJosmErrorModal(false)} />}

            {(showMismatchModal || showJosmErrorModal) && (
                <div
                    id="modal-backdrop"
                    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    onClick={() => {
                        if (showMismatchModal) mismatchModalConfig.onBack();
                        if (showJosmErrorModal) setShowJosmErrorModal(false);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Initialises the spider detail dashboard application.
 *
 * @param {Object} props - Configuration properties passed from the SSR environment.
 */
window.initSpiderDashboard = async props => {
    await initI18n();
    const container = document.getElementById('spider-dashboard-root');
    if (container) {
        render(
            <TierProvider tier={props.tier || 'auto'}>
                <SpiderDashboard {...props} />
            </TierProvider>,
            container
        );
    }
    const switcherContainer = document.getElementById('language-switcher-root');
    if (switcherContainer) {
        render(<LanguageSwitcher />, switcherContainer);
    }
};
