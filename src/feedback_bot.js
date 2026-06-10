import axios from 'axios';
import fs from 'fs';
import path from 'path';
import './axios_config.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const SUMMARY_FILE = 'output/sync_summary.json';

const COMMENT_1_TAG = '<!-- atp-bot-comment-1 -->';
const COMMENT_2_TAG = '<!-- atp-bot-comment-2 -->';
const COMMENT_PENDING_TAG = '<!-- atp-bot-comment-pending -->';

const AUTO_REQUEST_LABEL = 'auto-request';
const COMMUNITY_BLOCKED_LABEL = 'community-blocked';

async function run() {
    if (!GITHUB_TOKEN || !REPO) {
        console.log('GITHUB_TOKEN or GITHUB_REPOSITORY not set. Skipping feedback bot.');
        return;
    }

    if (!fs.existsSync(SUMMARY_FILE)) {
        console.error(`Sync summary file not found at ${SUMMARY_FILE}`);
        return;
    }

    const syncSummary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
    const summaryMap = new Map(syncSummary.map(s => [s.name, s]));

    try {
        // Fetch open PRs with auto-request label
        const prsResponse = await axios.get(`https://api.github.com/repos/${REPO}/pulls`, {
            params: {
                state: 'open',
                sort: 'created',
                direction: 'asc',
            },
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        const allPrs = prsResponse.data;
        const autoRequestPrs = allPrs.filter(pr =>
            pr.labels.some(l => l.name === AUTO_REQUEST_LABEL) &&
            !pr.labels.some(l => l.name === COMMUNITY_BLOCKED_LABEL)
        );

        console.log(`Found ${autoRequestPrs.length} active auto-request PRs.`);

        const spidersForForumPost = [];
        let newSpiderCount = 0;

        for (const pr of autoRequestPrs) {
            const commentsResponse = await axios.get(`https://api.github.com/repos/${REPO}/issues/${pr.number}/comments`, {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                },
            });

            const comments = commentsResponse.data;
            const hasComment1 = comments.some(c => c.body.includes(COMMENT_1_TAG));
            const hasComment2 = comments.some(c => c.body.includes(COMMENT_2_TAG));
            const hasPendingComment = comments.some(c => c.body.includes(COMMENT_PENDING_TAG));

            const prSpiderNames = await getSpiderNamesFromPr(pr);
            if (prSpiderNames.length === 0) {
                console.log(`Could not determine spider name for PR #${pr.number}`);
                continue;
            }
            const spiderName = prSpiderNames[0]; // Assuming one spider per PR as per validation rules
            const spiderData = summaryMap.get(spiderName);

            if (!hasComment1 && !hasComment2) {
                if (newSpiderCount < 5) {
                    // Post Comment 1
                    await postComment1(pr, spiderName, spiderData);
                    spidersForForumPost.push({ pr, spiderName, spiderData });
                    newSpiderCount++;
                } else if (!hasPendingComment) {
                    // Post Pending Comment
                    await postPendingComment(pr);
                }
            } else if (hasComment1 && !hasComment2) {
                // Post Comment 2
                await postComment2(pr, spiderName);
            }
        }

        if (spidersForForumPost.length > 0) {
            await createForumPostIssue(spidersForForumPost);
        }

    } catch (error) {
        console.error(`Error in feedback bot: ${error.message}`);
        if (error.response) {
            console.error('Response data:', JSON.stringify(error.response.data));
        }
    }
}

async function getSpiderNamesFromPr(pr) {
    // In a real scenario, we'd fetch the PR files and look for changes in spiders_auto.json.
    // For now, we'll try to find a spider name in the PR title or branch name,
    // or better, fetch the files changed in the PR.
    try {
        const filesResponse = await axios.get(`https://api.github.com/repos/${REPO}/pulls/${pr.number}/files`, {
            headers: {
                Authorization: `token ${GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        const changedFiles = filesResponse.data;
        const autoFile = changedFiles.find(f => f.filename === 'spiders_auto.json');

        if (autoFile && autoFile.patch) {
            // Extract added spider name from patch
            const addedLines = autoFile.patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
            const names = [];
            for (const line of addedLines) {
                const match = line.match(/"name":\s*"([^"]+)"/);
                if (match) names.push(match[1]);
            }
            return names;
        }
    } catch (error) {
        console.error(`Failed to get spider names for PR #${pr.number}: ${error.message}`);
    }
    return [];
}

async function postComment1(pr, spiderName, spiderData) {
    const author = pr.user.login;
    // TODO: Use real host for preview link
    const previewLink = `https://example.com/preview/${spiderName}`;

    const body = `@${author}, thank you for your pull request!

The following spider is being proposed for automatic updates. Please review and verify the output here: [${spiderName} Preview](${previewLink})

We have also initiated a community review process on the OSM forum. If there are no issues raised, automatic edits will be enabled in approximately two weeks.

${COMMENT_1_TAG}`;

    await axios.post(`https://api.github.com/repos/${REPO}/issues/${pr.number}/comments`, { body }, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });
    console.log(`Posted Comment 1 to PR #${pr.number}`);
}

async function postPendingComment(pr) {
    const body = `Thank you for your pull request! There are currently several spiders being proposed for automatic updates. To ensure each receives proper community review, we limit the number of active proposals.

This pull request will remain pending until the current batch of reviews is complete. We will post a preview link and initiate the community review for this spider as soon as possible.

${COMMENT_PENDING_TAG}`;

    await axios.post(`https://api.github.com/repos/${REPO}/issues/${pr.number}/comments`, { body }, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });
    console.log(`Posted Pending Comment to PR #${pr.number}`);
}

async function postComment2(pr, spiderName) {
    // TODO: Use real host for preview link
    const previewLink = `https://example.com/preview/${spiderName}`;
    const repoOwner = REPO.split('/')[0];

    const body = `Community review period is nearing completion. If no issues have been raised, automatic updates will be enabled for the next run.

View the latest preview here: [${spiderName} Preview](${previewLink})

@${repoOwner}, please review and merge this PR if everything looks good.

${COMMENT_2_TAG}`;

    await axios.post(`https://api.github.com/repos/${REPO}/issues/${pr.number}/comments`, { body }, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });

    // Assign to owner
    await axios.post(`https://api.github.com/repos/${REPO}/issues/${pr.number}/assignees`, { assignees: [repoOwner] }, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });

    console.log(`Posted Comment 2 and assigned PR #${pr.number} to ${repoOwner}`);
}

async function createForumPostIssue(spiders) {
    const repoOwner = REPO.split('/')[0];
    // TODO: Use real forum thread link
    const forumThread = 'https://community.openstreetmap.org/placeholder';

    let spidersList = '';
    for (const { pr, spiderName, spiderData } of spiders) {
        // TODO: Use real host for preview link
        const previewLink = `https://example.com/preview/${spiderName}`;
        const mappedCount = spiderData ? spiderData.mappedCount : 'unknown';
        const tags = spiderData ? spiderData.importableTags || [] : [];
        const displayTags = [...new Set([...tags, 'opening_hours', 'website'])].sort().join(', ');

        spidersList += `- [${spiderName}](${previewLink}) ([GitHub PR](${pr.html_url}))
  - Currently mapped items: ${mappedCount}
  - Included tags: ${displayTags}\n`;
    }

    const issueBody = `@${repoOwner}, please post the following on the [OSM forum](${forumThread}):

\`\`\`markdown
The following spiders are being proposed to have automatic updates enabled:

${spidersList}

Please review these spiders, if there are no issues raised then automatic edits will be enabled for them in two weeks' time.
\`\`\`

This issue tracks the community notification for this week's batch of spiders.`;

    await axios.post(`https://api.github.com/repos/${REPO}/issues`, {
        title: `Community Forum Notification - ${new Date().toISOString().split('T')[0]}`,
        body: issueBody,
        assignees: [repoOwner],
        labels: ['community-review'],
    }, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
        },
    });

    console.log('Created Forum Notification Issue');
}

run();
