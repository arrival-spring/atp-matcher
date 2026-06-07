import fs from 'fs';
import path from 'path';

describe('Spider name safety check', () => {
    const spiders = JSON.parse(fs.readFileSync('spiders.json', 'utf8'));
    const reservedNames = fs.readdirSync('.')
        .filter(f => fs.statSync(f).isDirectory() && !f.startsWith('.'))
        .concat(['assets', 'locales']); // Explicitly including these as they are subdirectories in output/

    test('no spider name matches an existing project directory', () => {
        spiders.forEach(spider => {
            expect(reservedNames).not.toContain(spider.name);
        });
    });
});
