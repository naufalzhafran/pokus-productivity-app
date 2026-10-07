/* global routerAdd, BadRequestError, $app, $http, $apis */

// GET /api/pokus/link-preview?url=... returns public metadata (title, description, image, siteName, icon, author)
// for a captured link. Browsers cannot read other sites' HTML, so the lookup happens here.
// PocketBase runs each handler in an isolated context, so all helpers live inside it.
routerAdd("GET", "/api/pokus/link-preview", (e) => {
  const MAX_HTML_LENGTH = 512 * 1024;
  const raw = String(e.request.url.query().get("url") || "").trim();
  const parts = raw.length <= 2048 ? raw.match(/^(https?):\/\/([^/?#:@\s]+)(:\d+)?([^#\s]*)/i) : null;
  if (!parts) throw new BadRequestError("Enter a valid http or https link.");
  const scheme = parts[1].toLowerCase();
  const host = parts[2].toLowerCase();
  const origin = scheme + "://" + host + (parts[3] || "");
  // Only public hostnames: no IP literals, localhost, or private suffixes.
  if (host === "localhost" || /^[\d.]+$|^0x|^\[/.test(host) || !host.includes(".") || /\.(local|localhost|internal|intranet|lan|home|arpa|test)$/.test(host)) {
    throw new BadRequestError("This link cannot be previewed.");
  }

  const matchesHost = (domain) => host === domain || host.endsWith("." + domain);
  const send = (url) => {
    const res = $http.send({
      url: url,
      method: "GET",
      timeout: 8,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PokusLinkPreview/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });
    return res.statusCode >= 200 && res.statusCode < 300 ? res : null;
  };
  const decode = (text) => String(text || "")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, "\"").replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
  const stripTags = (html) => decode(String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
  const resolve = (value) => {
    const url = decode(value);
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("//")) return scheme + ":" + url;
    if (url.startsWith("/")) return origin + url;
    const path = (parts[4] || "/").split("?")[0];
    return origin + path.slice(0, path.lastIndexOf("/") + 1) + url;
  };
  const oembed = (endpoint) => {
    try {
      const res = send(endpoint + encodeURIComponent(raw));
      return res && res.json && typeof res.json === "object" ? res.json : null;
    } catch (err) {
      $app.logger().warn("Link preview oEmbed failed", "url", raw, "error", String(err));
      return null;
    }
  };

  if (matchesHost("youtube.com") || matchesHost("youtu.be")) {
    const data = oembed("https://www.youtube.com/oembed?format=json&url=");
    if (data) return e.json(200, { title: data.title, author: data.author_name, image: data.thumbnail_url, siteName: "YouTube" });
  }
  if (matchesHost("x.com") || matchesHost("twitter.com")) {
    const data = oembed("https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=");
    if (data) {
      const text = String(data.html || "").match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      return e.json(200, { author: data.author_name, description: text ? stripTags(text[1]) : "", siteName: "X" });
    }
  }
  if (matchesHost("tiktok.com")) {
    const data = oembed("https://www.tiktok.com/oembed?url=");
    if (data) return e.json(200, { description: data.title, author: data.author_name, image: data.thumbnail_url, siteName: "TikTok" });
  }

  let html = "";
  try {
    const res = send(raw);
    const type = res ? String((res.headers["Content-Type"] || res.headers["content-type"] || [""])[0] || "") : "";
    if (res && (!type || /html|xml/i.test(type))) html = toString(res.body).slice(0, MAX_HTML_LENGTH);
  } catch (err) {
    $app.logger().warn("Link preview fetch failed", "url", raw, "error", String(err));
  }
  if (!html) return e.json(200, {});

  const meta = {};
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i);
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!key || !content) continue;
    const name = key[1].toLowerCase();
    if (!(name in meta)) meta[name] = content[1] !== undefined ? content[1] : content[2];
  }
  const first = (...keys) => {
    for (const key of keys) if (meta[key]) return decode(meta[key]);
    return "";
  };
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const iconTag = (html.match(/<link\b[^>]*\brel\s*=\s*["'][^"']*\bicon\b[^"']*["'][^>]*>/gi) || [])
    .map((tag) => tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i))
    .filter(Boolean)[0];

  return e.json(200, {
    title: first("og:title", "twitter:title") || (titleTag ? decode(titleTag[1]) : ""),
    description: first("og:description", "twitter:description", "description"),
    image: resolve(first("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src")),
    siteName: first("og:site_name", "application-name"),
    author: first("author", "twitter:creator"),
    icon: iconTag ? resolve(iconTag[1] !== undefined ? iconTag[1] : iconTag[2]) : origin + "/favicon.ico",
  });
}, $apis.requireAuth());
