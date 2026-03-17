export const onRequest: PagesFunction = async ({ request, params, next }) => {
  const splat = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!splat) {
    // No path segment — serve the static /l/ page (preserves query params like ?id=...)
    return next();
  }
  // /l/ABCD → /l/?id=ABCD (short URL support)
  return Response.redirect(new URL(`/l/?id=${splat}`, "https://unarxiv.org"), 302);
};
