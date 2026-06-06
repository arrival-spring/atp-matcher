import { render, h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { escapeHtml, getVisitedLinks } from './utils';
import { TabNavigation } from './components/TabNavigation';
import { SummaryTab } from './components/SummaryTab';
import { UnmappedTab } from './components/UnmappedTab';
import { UnmatchedTab } from './components/UnmatchedTab';
import { DuplicateRefsTab } from './components/DuplicateRefsTab';
import { TagTab } from './components/TagTab';
import { MismatchModal, JosmErrorModal } from './components/Modals';
import { Layout } from './components/Layout';

const PAGE_SIZE = 25;

function SpiderDashboard({
    spiderName,
    results,
    importableTags,
    atpDate,
    osmDate,
    showUnmatched,
    unmappedFilters = [],
    unmatchedFilters = [],
    isStale,
    staleDate,
    loadStatus,
    isBrandSpider,
    lineage,
}) {
    const [currentState, setCurrentState] = useState({
        tag: 'summary',
        status: null,
        page: 1,
        brand: null,
        wikidata: null,
    });

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

        const newHash = params.toString();
        if (window.location.hash.substring(1) !== newHash) {
            window.history.pushState({}, '', `${window.location.pathname}${window.location.search}#${newHash}`);
        }
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
                    title: 'Important Warning',
                    message: `
                        Some of the data from the spider may be wrong. <strong class="text-white">DO NOT simply update ${escapeHtml(currentState.tag)} on all of the objects.</strong>
                        Check the history to see who added ${escapeHtml(currentState.tag)} and their likely source.
                        If you are not sure then <strong class="text-white">DO NOT MAKE A CHANGE</strong> unless you can survey the place.
                    `,
                    onUnderstand: () => {
                        const warnedTags = JSON.parse(sessionStorage.getItem(`mismatch_warned_tags_${spiderName}`) || '[]');
                        if (!warnedTags.includes(currentState.tag)) {
                            warnedTags.push(currentState.tag);
                            sessionStorage.setItem(`mismatch_warned_tags_${spiderName}`, JSON.stringify(warnedTags));
                        }
                        setShowMismatchModal(false);
                    },
                    onBack: () => {
                        setCurrentState(prev => ({ ...prev, status: null }));
                        setShowMismatchModal(false);
                    }
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

    const isUniquelyMatched = r =>
        r.matchCount === 1 && !['disallowed source uri', 'not a brand spider'].includes(r.status);

    const switchTab = (tag) => {
        setCurrentState({
            tag,
            status: null,
            page: 1,
            brand: null,
            wikidata: null,
        });
    };

    return (
        <Layout atpDate={atpDate} osmDate={osmDate}>
            <nav class="mb-8 mt-4">
                <a href="../index.html" class="text-blue-400 hover:underline">← Back to Index</a>
            </nav>

            <header class="mb-12">
                <h1 class="text-4xl font-extrabold mb-2">{spiderName}</h1>

                {isStale && (
                    <div class="bg-orange-900/20 border border-orange-500/50 text-orange-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold">⚠️ Stale Data</p>
                        <p class="text-sm">The latest ATP run was empty. Showing data from {staleDate.substring(0, 10)} instead.</p>
                    </div>
                )}

                {(loadStatus === 'missing' || loadStatus === 'empty') && (
                    <div class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold">❌ No Data Available</p>
                        <p class="text-sm">
                            {loadStatus === 'missing'
                                ? 'The latest ATP run for this spider could not be found (404).'
                                : 'All recent ATP runs for this spider were empty.'}
                        </p>
                    </div>
                )}

                {!isBrandSpider && (
                    <div class="bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 mt-4">
                        <p class="font-bold">❌ Not a Brand Spider</p>
                        <p class="text-sm">This spider does not have the expected <code>spider:lineage=S_ATP_BRANDS</code> attribute.</p>
                    </div>
                )}

                <div class="text-gray-400 text-sm flex gap-4 mt-4">
                    <a href={`https://data.alltheplaces.xyz/runs/latest/output/${spiderName}.geojson`} target="_blank" class="text-blue-400 hover:underline inline-flex items-center">
                        GeoJSON
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                    <a href={`https://github.com/alltheplaces/alltheplaces/tree/master/locations/spiders/${spiderName}.py`} target="_blank" class="text-blue-400 hover:underline inline-flex items-center">
                        Spider Source
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                </div>
            </header>

            <TabNavigation
                activeTab={currentState.tag}
                onTabChange={switchTab}
                showUnmatched={showUnmatched}
                importableTags={importableTags}
                hasDuplicates={results.some(r => r.matchCount > 1)}
                unmappedCount={(unmappedCache ? unmappedCache.length : 0) + results.filter(r => ['disallowed source uri', 'not a brand spider'].includes(r.status)).length}
                unmatchedCount={unmatchedCache ? unmatchedCache.length : 0}
            />

            <div id="tab-content" class="mt-4 md:mt-8">
                {currentState.tag === 'summary' && (
                    <SummaryTab
                        results={results}
                        importableTags={importableTags}
                        showUnmatched={showUnmatched}
                        unmappedCount={(unmappedCache ? unmappedCache.length : 0) + results.filter(r => ['disallowed source uri', 'not a brand spider'].includes(r.status)).length}
                        unmatchedCount={unmatchedCache ? unmatchedCache.length : 0}
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
                <MismatchModal
                    {...mismatchModalConfig}
                    onClose={() => mismatchModalConfig.onBack()}
                />
            )}

            {showJosmErrorModal && (
                <JosmErrorModal onClose={() => setShowJosmErrorModal(false)} />
            )}

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
        </Layout>
    );
}

window.initSpiderDashboard = (props) => {
    const container = document.getElementById('spider-dashboard-root');
    if (container) {
        render(<SpiderDashboard {...props} />, container);
    }
};
