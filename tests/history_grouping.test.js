import { h } from 'preact';
import render from 'preact-render-to-string';
import { SpiderValue } from '../src/frontend/components/Common.jsx';

// Mock i18n
jest.mock('../src/frontend/i18n', () => ({
    t: (key) => key
}));

// Mock ThemeContext
jest.mock('../src/frontend/components/ThemeContext', () => ({
    useTheme: () => ({
        linkClass: () => ''
    })
}));

describe('SpiderValue History Grouping', () => {
    it('should group consecutive identical values and show |', () => {
        const history = [
            { date: '2024-05-16', value: 'v1', itemExists: true },
            { date: '2024-05-23', value: 'v2', itemExists: true },
            { date: '2024-05-30', value: 'v2', itemExists: true },
            { date: '2024-06-06', value: 'v2', itemExists: true },
        ];

        // Value is current value, history is reversed in component
        const html = render(h(SpiderValue, { value: "v2", history: history, tag: "opening_hours", visitedSet: new Set() }));

        // Expected order (reversed history):
        // 2024-06-06: |
        // 2024-05-30: |
        // 2024-05-23: v2
        // 2024-05-16: v1

        expect(html).toContain('2024-06-06</span>: <span class="text-gray-300">|</span>');
        expect(html).toContain('2024-05-30</span>: <span class="text-gray-300">|</span>');
        expect(html).toContain('2024-05-23</span>: <span class="text-gray-300"><code class="text-sm break-all">v2</code></span>');
        expect(html).toContain('2024-05-16</span>: <span class="text-gray-300"><code class="text-sm break-all">v1</code></span>');
    });

    it('should group consecutive "no value" runs', () => {
        const history = [
            { date: '2024-05-16', value: 'v1', itemExists: true },
            { date: '2024-05-23', value: null, itemExists: true },
            { date: '2024-05-30', value: null, itemExists: true },
            { date: '2024-06-06', value: 'v2', itemExists: true },
        ];

        const html = render(h(SpiderValue, { value: "v2", history: history, tag: "opening_hours", visitedSet: new Set() }));

        // Expected order (reversed history):
        // 2024-06-06: v2 (no |, because next is null)
        // 2024-05-30: |
        // 2024-05-23: no value
        // 2024-05-16: v1

        expect(html).toContain('2024-06-06</span>: <span class="text-gray-300"><code class="text-sm break-all">v2</code></span>');
        expect(html).toContain('2024-05-30</span>: <span class="text-gray-300">|</span>');
        expect(html).toContain('2024-05-23</span>: <span class="text-gray-300"><i class="opacity-50">spider.table.noValue</i></span>');
        expect(html).toContain('2024-05-16</span>: <span class="text-gray-300"><code class="text-sm break-all">v1</code></span>');
    });
});
