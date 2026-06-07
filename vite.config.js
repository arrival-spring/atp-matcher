import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [preact()],
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'src/frontend/index.jsx'),
                spider: resolve(__dirname, 'src/frontend/spider.jsx'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name]-[hash].js',
                assetFileNames: '[name]-[hash][extname]',
                dir: 'output/assets',
            },
        },
        emptyOutDir: false,
    },
});
