/**
 * @file ESLint flat config (ESLint 10) — local, on-demand code-quality + security review.
 *
 * The offline counterpart to SonarQube: everything runs on this machine, no token,
 * no upload. Combines three rule sets:
 *   - eslint:recommended      core correctness rules
 *   - eslint-plugin-sonarjs   SonarJS bug & code-smell rules (the SonarQube JS set)
 *   - eslint-plugin-security  Node.js security patterns
 *
 * Formatting is intentionally NOT handled here — Prettier owns that (see
 * .vscode/settings.json). Run with `npm run lint` (console / Problems view) or
 * `npm run lint:report` (writes eslint-report.json for an agent to read and fix).
 *
 * Three execution environments are scoped separately so `no-undef` stays honest:
 *   - server Node / CommonJS (default)
 *   - browser jQuery scripts: public/**, reviewer-update/**
 *   - Mocha tests: tests/**
 */
'use strict';

const js = require('@eslint/js');
const sonarjs = require('eslint-plugin-sonarjs');
const security = require('eslint-plugin-security');
const globals = require('globals');

module.exports = [
    // Paths never analysed.
    {
        ignores: [
            'node_modules/**',
            'uploads/**',
            'logs/**',
            'coverage/**',
            'front-mocks/**',
            'tmp/**',
            'eslint-report.json',
        ],
    },

    // Shared rule sets, applied to every linted file.
    js.configs.recommended,
    sonarjs.configs.recommended,
    security.configs.recommended,

    // Default environment: server-side Node (CommonJS).
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            // Allow intentional `while (true)` loops (recommended would flag them).
            'no-constant-condition': ['error', { checkLoops: false }],
            // Keep the project's tuned unused-vars policy on top of eslint:recommended.
            'no-unused-vars': ['error', {
                vars: 'all',
                args: 'after-used',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
        },
    },

    // Browser-side scripts (jQuery pages + the standalone layout logger).
    {
        files: ['public/**/*.js', 'reviewer-update/**/*.js', 'front-logsize/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: { ...globals.browser, ...globals.jquery, bootstrap: 'readonly' },
        },
    },

    // Mocha test suites (Node + Mocha globals).
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.mocha },
        },
    },
];
