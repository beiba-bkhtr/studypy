// @ts-nocheck
// api/_server.cjs is pre-built by scripts/build-api.mjs from server.ts.
//
// This file is compiled as CommonJS (see api/package.json), so it must not use
// top-level `await` — that is ESM-only and makes the whole function fail to
// load with "await is only valid in async functions". The import is therefore
// deferred into the handler and memoised, which also keeps it off the cold
// path until the first request actually arrives.

let appPromise;

const getApp = () => {
  if (!appPromise) {
    appPromise = import("./_server.cjs")
      .then((mod) => (mod.createServerApp || mod.default?.createServerApp)())
      .then((result) => result.app)
      .catch((error) => {
        // Let the next invocation retry instead of caching a failed boot.
        appPromise = undefined;
        throw error;
      });
  }
  return appPromise;
};

export default async function handler(request, response) {
  const app = await getApp();
  return app(request, response);
}
