import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import OSM from 'osm-api';
import { SAFE_EDITS_DIR, HOST_URL } from './constants.js';
import { fileURLToPath } from 'url';
import { GITHUB_URL } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const PACKAGE_NAME = packageInfo.name;
const PACKAGE_VERSION = packageInfo.version;
const PACKAGE_STRING = `${PACKAGE_NAME}/${PACKAGE_VERSION}`;
const CHANGESET_TAGS = {
    created_by: PACKAGE_STRING,
    bot: 'yes',
    automatic: 'yes',
    source_code: GITHUB_URL,
    osm_wiki_documentation_page:
        'https://wiki.openstreetmap.org/wiki/Automated_edits/confusedbuffalo/Ongoing_Maintenance_Updates_from_ATP',
    source: 'All The Places',
};

/**
 * @type {string}
 * @description The authentication token used for authorizing changesets with the OSM API.
 * This is retrieved from the environment variable AUTH_TOKEN.
 */
const BOT_AUTH_TOKEN = process.env.BOT_AUTH_TOKEN;

/**
 * Basic sleep utility to pause between uploads so as not to overload the OSM servers
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes an OSM API call with a retry mechanism for transient 5xx errors.
 *
 * @param {Function} fn - A function that returns a promise (the OSM API call).
 * @param {number} maxAttempts - Total number of attempts (default 3).
 * @param {number} initialDelay - Initial delay in milliseconds (default 5000).
 * @returns {Promise<any>} The result of the API call.
 * @throws {Error} If all attempts fail or a non-retryable error occurs.
 */
async function withRetry(fn, maxAttempts = 3, initialDelay = 5000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = error.status || error.cause;

            // Only retry on 5xx errors and if we haven't exhausted attempts
            if (typeof status === 'number' && status >= 500 && status < 600 && attempt < maxAttempts) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(
                    `OSM API call failed (status ${status}). Attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms...`
                );
                await sleep(delay);
            } else {
                // If it's not a 5xx error or we're out of attempts, throw
                throw error;
            }
        }
    }
    throw lastError;
}

/**
 * Applies a set of tag edits (key-value pairs) to an OSM feature's 'tags' object.
 * If an edit value is explicitly set to null, the corresponding tag key is deleted
 * from the feature's tags.
 *
 * @param {object} feature - The feature object (node, way or relation) containing the 'tags' object.
 * @param {object} elementEdits - The object of key-value edits to apply. A value of null indicates a deletion.
 * @param {object} originalValues - The object of key-value original tag values.
 * @returns {boolean} Whether any changes were made
 */
function applyEditsToFeatureTags(feature, elementEdits, originalValues) {
    let changed = false;

    // visible is false for deleted objects and unset for normal objects
    const isDeleted = (feature.visible ?? true) === false;

    // If a feature does not have any tags, it has dramatically changed since it was originally fetched
    if (isDeleted || !feature.tags || typeof feature.tags !== 'object') {
        return false;
    }

    const tags = feature.tags;

    for (const key in elementEdits) {
        if (Object.hasOwn(elementEdits, key)) {
            const value = elementEdits[key];

            // If any of the target tags have changed, make no changes
            const originalValue = originalValues?.[key];
            if (originalValue !== undefined && tags[key] !== originalValue) {
                return false;
            }

            if (value === null) {
                if (Object.hasOwn(tags, key)) {
                    delete tags[key];
                    changed = true;
                }
            } else if (tags[key] !== value) {
                tags[key] = value;
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Groups the array elements by 'type' and organises IDs and suggestedFixes.
 * * @param {Array<Object>} data - The original array of objects.
 * @returns {Object} An object keyed by type (e.g., "node"), containing:
 * - featureIds: An array of IDs for that type.
 * - newValuesMap: A Map<ID, newValues object>.
 * - originalValuesMap: A Map<ID, originalValues object>.
 */
function groupData(data) {
    return data.reduce((acc, item) => {
        const { type, id, originalValues, newValues } = item;

        if (!acc[type]) {
            acc[type] = {
                featureIds: [],
                newValuesMap: new Map(),
                originalValuesMap: new Map(),
            };
        }

        acc[type].featureIds.push(id);
        acc[type].newValuesMap.set(id, newValues);
        acc[type].originalValuesMap.set(id, originalValues);

        return acc;
    }, {});
}

/**
 * Fetches features from the OSM API, applies the suggested edits to their tags,
 * and tracks features that resulted in actual modifications.
 *
 * @param {Object<string, object>} groupedData An object keyed by type, containing IDs, fixes and original invalid values.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of modified feature objects
 * ready for inclusion in an OSM changeset.
 */
async function processFeatures(groupedData) {
    let modifications = [];
    const MAX_FEATURES_PER_FETCH = 500;
    for (const type in groupedData) {
        if (Object.hasOwn(groupedData, type)) {
            const { featureIds, newValuesMap, originalValuesMap } = groupedData[type];

            if (featureIds.length > 0) {
                const featureIdChunks = [];
                for (let i = 0; i < featureIds.length; i += MAX_FEATURES_PER_FETCH) {
                    featureIdChunks.push(featureIds.slice(i, i + MAX_FEATURES_PER_FETCH));
                }

                let allFeatures = [];
                for (const chunk of featureIdChunks) {
                    const features = await withRetry(() => OSM.getFeatures(type, chunk));
                    allFeatures.push(...features);
                }

                for (const feature of allFeatures) {
                    const featureId = feature.id;
                    const newValues = newValuesMap.get(featureId);
                    const originalValues = originalValuesMap.get(featureId);
                    if (newValues) {
                        const changed = applyEditsToFeatureTags(feature, newValues, originalValues);
                        if (changed) {
                            modifications.push(feature);
                        } else {
                            console.warn(`No changes applied for ${type}/${featureId}`);
                        }
                    } else {
                        console.warn(`No new values found for ${type}/${featureId}`);
                    }
                }
            }
        }
    }
    return modifications;
}

/**
 * Reads a safe edits file, groups the edits, processes the features by applying fixes,
 * and uploads the resulting modifications to OSM as a changeset.
 *
 * @param {string} filePath The path to the safe edits JSON file (created by saveSafeEdits).
 * @returns {Promise<void>} A promise that resolves after the changes have been uploaded or skipped.
 */
export async function uploadSafeChanges(filePath) {
    const content = await fsp.readFile(filePath, 'utf-8');
    const stateData = JSON.parse(content);

    const edits = stateData.edits;
    const metadata = stateData.metadata;

    const groupedData = groupData(edits);
    const modifications = await processFeatures(groupedData);

    if (modifications.length > 0) {
        console.log(
            `Uploading ${modifications.length} modifications for ${metadata.spider}: ${metadata.state || ''} (${metadata.country})`
        );

        const pageLink = `${HOST_URL}auto/${metadata.spider}`;
        const comment = `Automatically update ${metadata.tags.join(',')} from first-party brand data for ${metadata.spider}: ${metadata.country}${metadata.state ? `, ${metadata.state}` : ''}`;

        const response = await withRetry(() =>
            OSM.uploadChangeset(
                {
                    ...CHANGESET_TAGS,
                    comment,
                    manual_review_needed: pageLink,
                },
                { create: [], modify: modifications, delete: [] }
            )
        );

        const changesetIds = Object.keys(response || {});

        changesetIds.forEach(id => {
            console.log(
                `Changeset ${id} created for ${metadata.spider}: ${metadata.state || ''} (${metadata.country})`
            );
        });
    }
}

/**
 * The main bot routine for automatically processing and uploading 'safe' edits to OpenStreetMap
 * @async
 * @returns {Promise<void>} A Promise that resolves when all file processing and upload attempts are complete.
 */
async function processSafeEdits() {
    const filesToProcess = [];
    const countryStats = {};

    /**
     * Recursively reads directories and collects file paths.
     * @param {string} directory - The directory to start the search from.
     */
    async function collectSafeEditFiles(directory) {
        try {
            const entries = await fsp.readdir(directory, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    await collectSafeEditFiles(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.json')) {
                    filesToProcess.push(fullPath);
                }
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`Directory not found: ${directory}`);
            } else {
                throw error;
            }
        }
    }

    OSM.configure({ authHeader: `Bearer ${BOT_AUTH_TOKEN}` });

    withRetry(() => OSM.getUser('me'))
        .then(result => {
            console.debug(`Logged in as ${result.display_name}`);
        })
        .catch(error => {
            console.error('Could not identify with OSM API');
            throw error;
        });

    try {
        console.debug(`Starting file collection in ${SAFE_EDITS_DIR}/auto...`);
        await collectSafeEditFiles(path.join(SAFE_EDITS_DIR, 'auto'));
        console.debug(`Found ${filesToProcess.length} safe edit files.`);

        for (const filePath of filesToProcess) {
            try {
                const fileContent = await fsp.readFile(filePath, 'utf8');
                const data = JSON.parse(fileContent);

                const countryName = data.metadata.country;

                if (!countryName) {
                    console.warn(`Skipping file ${filePath}: 'country' not found in metadata.`);
                    continue;
                }

                if (!countryStats[countryName]) {
                    countryStats[countryName] = {
                        totalSafeEdits: 0,
                        uploaded: 0,
                        skipped: 0,
                    };
                }

                const stats = countryStats[countryName];
                stats.totalSafeEdits += data.edits.length;

                if (data.edits.length > 0) {
                    try {
                        await uploadSafeChanges(filePath);
                        stats.uploaded++;
                        await sleep(500);
                    } catch (err) {
                        console.error(`Upload failed for ${filePath}:`, err);
                    }
                } else {
                    stats.skipped++;
                }
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error.message);
                throw error;
            }
        }

        console.log(`\n--- Country Processing Statistics ---`);
        for (const country in countryStats) {
            const stats = countryStats[country];
            console.log(`\nCountry: ${country}`);
            console.log(`  Safe Edits: ${stats.totalSafeEdits}`);
            console.log(`  Files Uploaded (Active Bot): ${stats.uploaded}`);
            console.log(`  Files Skipped (No Edits/No Config): ${stats.skipped}`);
        }

        const uploadedCount = Object.values(countryStats).reduce((sum, stats) => sum + stats.uploaded, 0);

        console.log(`\n--- Processing Complete ---`);
        console.log(`Total files processed: ${filesToProcess.length}`);
        console.log(`Successful uploads: ${uploadedCount}`);
    } catch (error) {
        console.error('An error occurred during directory traversal:', error);
        throw error;
    }
}

/**
 * The main function to check for safe edit files and upload the changes to OSM.
 */
async function main() {
    await processSafeEdits();
}

if (process.argv[1] === __filename) {
    main();
}
