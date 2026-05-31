import fs from 'fs';
import { execSync } from 'child_process';
import axios from 'axios';
import { getDomain } from 'tldts';
import { isAllowedSourceUri } from './utils.js';

const CONFIG_FILE = 'config.json';

async function validate() {
    const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configContent);
    const spiders = config.spiders;

    // 1. Check alphabetical order
    const sortedSpiders = [...spiders].sort((a, b) => a.name.localeCompare(b.name));
    const isSorted = JSON.stringify(spiders) === JSON.stringify(sortedSpiders);

    let reordered = false;
    if (!isSorted) {
        console.log('Spiders are not in alphabetical order. Reordering...');
        config.spiders = sortedSpiders;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4) + '\n');
        reordered = true;
    }

    // 2. Identify added/modified spiders
    let baseConfig;
    try {
        const baseConfigContent = execSync('git show origin/main:config.json', { encoding: 'utf8' });
        baseConfig = JSON.parse(baseConfigContent);
    } catch {
        console.error('Could not fetch config.json from main branch. Assuming all spiders are new.');
        baseConfig = { spiders: [] };
    }

    const baseSpidersMap = new Map(baseConfig.spiders.map(s => [s.name, s]));

    const addedOrModified = [];

    for (const spider of spiders) {
        const baseSpider = baseSpidersMap.get(spider.name);
        if (!baseSpider) {
            addedOrModified.push({ type: 'added', spider });
        } else if (JSON.stringify(spider) !== JSON.stringify(baseSpider)) {
            addedOrModified.push({ type: 'modified', spider });
        }
    }

    if (addedOrModified.length === 0) {
        console.log('No spiders added or modified.');
        if (reordered) {
            outputComment('> ℹ️ **Spiders were not in alphabetical order.** I have reordered them and committed the change.');
        }
        return;
    }

    if (addedOrModified.length > 1) {
        let errorMsg = '';
        if (reordered) {
            errorMsg +=
                '> ℹ️ **Spiders were not in alphabetical order.** I have reordered them and committed the change.\n\n';
        }
        const names = addedOrModified.map(a => a.spider.name).join(', ');
        errorMsg += `Error: Only one spider should be added or modified per PR. Found: ${names}`;
        outputComment(errorMsg);
        process.exit(1);
    }

    const { type, spider } = addedOrModified[0];
    const spiderName = spider.name;
    const url = `https://data.alltheplaces.xyz/runs/latest/output/${spiderName}.geojson`;

    console.log(`Fetching data for spider: ${spiderName} from ${url}`);
    try {
        const response = await axios.get(url);
        const data = response.data;

        if (!data || !data.features) {
            outputComment(`Error: Invalid GeoJSON data for spider ${spiderName}.`);
            process.exit(1);
        }

        const totalFeatures = data.features.length;
        const tagStats = {};
        spider.importableTags.forEach(tag => {
            tagStats[tag] = 0;
        });

        const domainStats = {};

        data.features.forEach(f => {
            const props = f.properties;
            spider.importableTags.forEach(tag => {
                if (props[tag]) {
                    tagStats[tag]++;
                }
            });

            const sourceUri = props['@source_uri'];
            if (sourceUri) {
                const domain = getDomain(sourceUri) || 'invalid';
                if (!domainStats[domain]) {
                    domainStats[domain] = { count: 0, allowed: isAllowedSourceUri(sourceUri, spider.source_uri) };
                }
                domainStats[domain].count++;
            }
        });

        let comment = '';
        if (reordered) {
            comment +=
                '> ℹ️ **Spiders were not in alphabetical order.** I have reordered them and committed the change.\n\n';
        }

        comment += `### Spider Validation: ${spiderName} (${type})\n\n`;
        comment += `**Total features:** ${totalFeatures}\n\n`;

        comment += `#### Importable Tags\n`;
        spider.importableTags.forEach(tag => {
            const count = tagStats[tag];
            const percent = totalFeatures > 0 ? ((count / totalFeatures) * 100).toFixed(1) : 0;
            comment += `- \`${tag}\`: ${count} (${percent}%)\n`;
        });
        comment += `\n`;

        comment += `#### Source URIs\n`;
        Object.entries(domainStats).forEach(([domain, stats]) => {
            const status = stats.allowed ? '✅ Allowed' : '❌ Disallowed';
            comment += `- \`${domain}\`: ${stats.count} (${status})\n`;
        });

        if (Object.keys(domainStats).length === 0) {
            comment += `No \`@source_uri\` found in spider data.\n`;
        }

        outputComment(comment);
        process.exit(0);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            outputComment(`Error: Spider \`${spiderName}\` not found in the latest ATP run.`);
        } else {
            outputComment(`Error fetching spider data for \`${spiderName}\`: ${error.message}`);
        }
        process.exit(1);
    }
}

function outputComment(message) {
    console.log('--- PR COMMENT START ---');
    console.log(message);
    console.log('--- PR COMMENT END ---');
    fs.writeFileSync('pr_comment.md', message);
}

validate().catch(err => {
    console.error(err);
    process.exit(1);
});
