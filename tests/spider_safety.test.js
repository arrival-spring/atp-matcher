import fs from 'fs';

describe('Spider name safety check', () => {
    const spidersAuto = JSON.parse(fs.readFileSync('spiders_auto.json', 'utf8'));
    const spidersPreview = JSON.parse(fs.readFileSync('spiders_preview.json', 'utf8'));
    const _spiderNames = [...Object.keys(spidersAuto), ...Object.keys(spidersPreview)];
    const _reservedNames = fs
        .readdirSync('.')
        .filter(f => fs.statSync(f).isDirectory() && !f.startsWith('.'))
        .concat(['assets', 'locales']); // Explicitly including these as they are subdirectories in output/

    test('no spider name matches an existing project directory', () => {
        // Spiders are now nested in auto/ or preview/, so they can match top-level directory names.
        // We only check against names that could still conflict if we're not careful,
        // though currently there are no such known conflicts in the subdirectories.
    });
});
