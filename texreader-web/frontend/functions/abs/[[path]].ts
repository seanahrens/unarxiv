export const onRequest: PagesFunction = async ({ params }) => {
  const splat = Array.isArray(params.path) ? params.path.join("/") : params.path;
  return Response.redirect(new URL(`/p?id=${splat}`, "https://unarxiv.org"), 302);
};
