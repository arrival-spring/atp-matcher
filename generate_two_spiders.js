import fs from 'fs';
import path from 'path';
import eta from './src/eta.js';

function generate(name) {
    const mockResults = [
        {
            ref: '123',
            status: 'mismatch',
            matchCount: 1,
            osmId: 'n123456',
            tags: [
                {
                    tag: 'opening_hours',
                    status: 'mismatch',
                    osmValue: 'Mo-Fr 09:00-18:00',
                    spiderValue: 'Mo-Sa 09:00-20:00',
                    history: [{ date: '2023-01-01', value: 'Mo-Sa 09:00-20:00' }]
                }
            ]
        }
    ];

    const html = eta.render('./spider', {
        title: name,
        name: name,
        importableTags: ['opening_hours'],
        atpDate: '2023-10-27T00:00:00Z',
        osmDate: '2023-10-27T00:00:00Z',
        results: mockResults,
        isBrandSpider: true,
        lineage: 'S_ATP_BRANDS',
        isStale: false,
        staleDate: null,
        loadStatus: 'ok',
    });

    if (!fs.existsSync('output')) fs.mkdirSync('output');
    fs.writeFileSync(`output/${name}.html`, html);
}

generate('spider_a');
generate('spider_b');
fs.copyFileSync('src/templates/spider.js', 'output/spider.js');
