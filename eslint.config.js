import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            prettier: prettier,
        },
        rules: {
            ...configPrettier.rules,
            'prettier/prettier': 'error',
        },
    },
    {
        ignores: ['output/**', 'node_modules/**', '*.osm.pbf', '*_report.txt'],
    },
];
