export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Missing ?id= parameter", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const apiBase = "https://api.unarxiv.org";

  // Fetch paper metadata for the title
  let title = id;
  try {
    const paperRes = await fetch(`${apiBase}/api/papers/${encodeURIComponent(id)}`);
    if (paperRes.ok) {
      const paper = await paperRes.json() as { title?: string };
      if (paper.title) title = paper.title;
    }
  } catch {}

  // Fetch transcript
  const transcriptRes = await fetch(`${apiBase}/api/papers/${encodeURIComponent(id)}/transcript`);
  if (!transcriptRes.ok) {
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Script Not Available</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#44403c}a{color:#57534e}</style></head>
<body><h1>Script not available</h1><p>The transcript for this paper is not yet available.</p><p><a href="/papers/?id=${encodeURIComponent(id)}">&larr; Back to paper</a></p></body>
</html>`, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const transcript = await transcriptRes.text();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Script — unarXiv</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1c1917; line-height: 1.7; background: #fafaf9; }
  h1 { font-size: 1.25rem; color: #44403c; margin-bottom: 0.25rem; }
  .meta { font-size: 0.8rem; color: #a8a29e; margin-bottom: 2rem; }
  .meta a { color: #78716c; text-decoration: none; }
  .meta a:hover { color: #44403c; }
  .transcript { white-space: pre-wrap; font-size: 0.95rem; color: #292524; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta"><a href="/papers/?id=${encodeURIComponent(id)}">&larr; Back to paper</a></div>
<div class="transcript">${escapeHtml(transcript)}</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
