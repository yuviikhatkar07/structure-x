export async function resolve(specifier, context, next) {
  if (specifier === 'better-sqlite3') {
    return { url: new URL('./better-sqlite3-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
