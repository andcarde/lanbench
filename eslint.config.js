'use strict';

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'logs/**',
            'tmp/**'
        ]
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                clearInterval: 'readonly',
                clearTimeout: 'readonly',
                console: 'readonly',
                module: 'readonly',
                process: 'readonly',
                require: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly'
            }
        },
        rules: {
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-debugger': 'error',
            'no-dupe-keys': 'error',
            'no-func-assign': 'error',
            'no-import-assign': 'error',
            'no-irregular-whitespace': 'error',
            'no-loss-of-precision': 'error',
            'no-redeclare': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            'use-isnan': 'error',
            'valid-typeof': 'error'
        }
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module'
        },
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }]
        }
    },
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                $: 'readonly',
                URLSearchParams: 'readonly',
                alert: 'readonly',
                document: 'readonly',
                fetch: 'readonly',
                FormData: 'readonly',
                jQuery: 'readonly',
                location: 'readonly',
                navigator: 'readonly',
                window: 'readonly'
            }
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                after: 'readonly',
                afterEach: 'readonly',
                before: 'readonly',
                beforeEach: 'readonly',
                Blob: 'readonly',
                describe: 'readonly',
                fetch: 'readonly',
                FormData: 'readonly',
                it: 'readonly'
            }
        }
    }
];
