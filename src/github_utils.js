import axios from 'axios';

export async function reportThresholdViolations(spiderName, violations, isAuto) {
    if (!isAuto) return;

    const tier = 'auto';
    const title = `Threshold exceeded for spider: ${spiderName}`;
    const body = `Threshold exceeded for spider **${spiderName}** in the **${tier}** tier.

The following tags had too many changes and were excluded from safe edits:

${violations.map(v => `- **${v.tag}** (${v.type === 'add' ? 'Add new values' : 'Update existing values'}): ${v.count} edits proposed out of ${v.mappedCount} mapped items`).join('\n')}

View the spider report here: https://example.com/${tier}/${spiderName}
<!-- TODO: Use real host for spider report link -->
`;

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY || 'arrival-spring/atp-matcher';

    if (!token) {
        console.log('--- Proposed GitHub Issue ---');
        console.log(`Title: ${title}`);
        console.log(`Labels: threshold-exceeded`);
        console.log(`Body:\n${body}`);
        console.log('------------------------------');
        return;
    }

    try {
        // Check for existing open issue with same title
        const searchResponse = await axios.get(`https://api.github.com/repos/${repo}/issues`, {
            params: {
                state: 'open',
                labels: 'threshold-exceeded',
            },
            headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        const existingIssue = searchResponse.data.find(issue => issue.title === title);
        if (existingIssue) {
            console.log(`Open issue already exists for ${spiderName}, adding comment: ${existingIssue.html_url}`);
            await axios.post(
                `https://api.github.com/repos/${repo}/issues/${existingIssue.number}/comments`,
                { body },
                {
                    headers: {
                        Authorization: `token ${token}`,
                        Accept: 'application/vnd.github.v3+json',
                    },
                }
            );
            return;
        }

        const createResponse = await axios.post(
            `https://api.github.com/repos/${repo}/issues`,
            {
                title,
                body,
                labels: ['threshold-exceeded'],
            },
            {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: 'application/vnd.github.v3+json',
                },
            }
        );

        console.log(`Created GitHub issue for ${spiderName}: ${createResponse.data.html_url}`);
    } catch (error) {
        console.error(`Failed to create GitHub issue for ${spiderName}: ${error.message}`);
        if (error.response) {
            console.error('Response data:', JSON.stringify(error.response.data));
        }
    }
}
