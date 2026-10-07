/* global routerAdd, BadRequestError */

// Google redirects to HTTPS; the system auth session receives the fixed app callback.
// State and PKCE are verified by the iPhone before PocketBase exchanges the code.
routerAdd("GET", "/api/pokus/ios-oauth", (e) => {
  const query = e.request.url.query();
  const state = String(query.get("state") || "");
  const code = String(query.get("code") || "");
  const error = String(query.get("error") || "");
  if (!state || state.length > 1024 || code.length > 4096 || error.length > 256 || (!code && !error)) {
    throw new BadRequestError("Invalid OAuth callback.");
  }
  e.response.header().set("Cache-Control", "no-store");
  e.response.header().set("Referrer-Policy", "no-referrer");
  const callback = "pokus://oauth?state=" + encodeURIComponent(state)
    + (code ? "&code=" + encodeURIComponent(code) : "&error=" + encodeURIComponent(error));
  return e.redirect(302, callback);
});
