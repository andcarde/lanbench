/**
 * Ambient declarations for dev/lint-only packages that ship no type
 * definitions and have no `@types/*` counterpart. Declaring them keeps
 * `checkJs` happy (no implicit-any `TS7016`) without pulling real types we
 * don't need for these untyped tools.
 */
declare module 'eslint-plugin-security';
declare module 'proxyquire';
