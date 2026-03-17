export const onRequest: PagesFunction = async ({ params }) => {
  const splat = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!splat) {
    return Response.redirect(new URL("/l/", "https://unarxiv.org"), 302);
  }
  return Response.redirect(new URL(`/l?id=${splat}`, "https://unarxiv.org"), 302);
};
