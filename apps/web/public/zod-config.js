// zod decides whether to compile parsers with `new Function` as each schema is created, and the production
// CSP (script-src 'self', no eval) forbids it. zod picks this object up when its module first loads, so it
// must run before the app's modules: a classic script does, and it stays inside script-src 'self'.
globalThis.__zod_globalConfig = { jitless: true };
