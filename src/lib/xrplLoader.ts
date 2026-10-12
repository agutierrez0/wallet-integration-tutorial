import type * as Xrpl from "xrpl";

type XrplModule = typeof Xrpl;

// The xrpl library is large, so code that needs it at runtime loads it on demand instead of
// importing it statically. Once loaded it is also available synchronously, which lets error
// classification keep using `instanceof` on xrpl's error classes (an xrpl error can only exist
// after the library has loaded).
let loaded: XrplModule | undefined;
let pending: Promise<XrplModule> | undefined;

export function loadXrpl(): Promise<XrplModule> {
  pending ??= import("xrpl").then(
    (m) => {
      loaded = m;
      return m;
    },
    (err) => {
      pending = undefined; // allow a retry after a failed chunk load
      throw err;
    },
  );
  return pending;
}

export function loadedXrpl(): XrplModule | undefined {
  return loaded;
}
