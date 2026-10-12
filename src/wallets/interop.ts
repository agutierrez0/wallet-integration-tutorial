// Vite's dev-server pre-bundling can wrap a CommonJS package's default export one level deeper
// than a production build does (module.default.default). Walk down `.default` until the value
// matches what we expect, so dynamic imports behave the same in dev and in the built app.
export function unwrapDefault<T>(mod: unknown, isExpected: (value: unknown) => boolean): T {
  let value: unknown = mod;
  for (let depth = 0; depth < 4 && value != null; depth++) {
    if (isExpected(value)) return value as T;
    value = (value as { default?: unknown }).default;
  }
  throw new Error("Wallet library loaded in an unexpected shape");
}
