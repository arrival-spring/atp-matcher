import fs from 'fs';
import path from 'path';

describe('Spider name safety check', () => {
    const spidersAuto = JSON.parse(fs.readFileSync('spiders_auto.json', 'utf8'));
    const spidersPreview = JSON.parse(fs.readFileSync('spiders_preview.json', 'utf8'));
    const spiders = [...spidersAuto, ...spidersPreview];
    const reservedNames = fs.readdirSync('.')
        .filter(f => fs.statSync(f).isDirectory() && !f.startsWith('.'))
        .concat(['assets', 'locales']); // Explicitly including these as they are subdirectories in output/

    test('no spider name matches an existing project directory', () => {
        spiders.forEach(spider => {
            expect(reservedNames).not.toContain(spider.name);
        });
    });
});
