const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data/records";
const BASE_URL = process.env.BASE_URL || "";
const REMOTE_AA_ENABLED = process.env.REMOTE_AA_ENABLED === "true";
const REMOTE_AA_BASE = process.env.REMOTE_AA_BASE || "https://annas-archive.li";
const REMOTE_AA_LANGS = process.env.REMOTE_AA_LANGS || "en,es";
const REMOTE_AA_EXT = process.env.REMOTE_AA_EXT || "epub";
const REMOTE_AA_LIMIT = Number(process.env.REMOTE_AA_LIMIT) || 25;
const REMOTE_AA_COOKIE = process.env.REMOTE_AA_COOKIE || "";
const REMOTE_AA_ACCOUNT_ID2 = process.env.REMOTE_AA_ACCOUNT_ID2 || "";
const REMOTE_AA_USE_CURL = process.env.REMOTE_AA_USE_CURL === "true";
const REMOTE_AA_DEBUG_MD5 = process.env.REMOTE_AA_DEBUG_MD5 || "";

const CATEGORY_ID = "7000";
const CATEGORY_NAME = "Books";
const SUBCATEGORY_ID = "7020";
const SUBCATEGORY_NAME = "EBooks";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeText(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeIsbn(value) {
  if (!value) {
    return "";
  }
  return String(value).toLowerCase().replace(/[^0-9x]/g, "");
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function sha1Hex(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getRecordId(record, sourcePath) {
  const candidate = firstString(
    record?.id,
    record?._id,
    record?.file_id,
    record?.file_unified_data?.id,
    record?.file_unified_data?.file_id
  );
  if (candidate) {
    return candidate;
  }
  return sha1Hex(sourcePath);
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasTorrents(record) {
  return Array.isArray(record?.additional?.torrent_paths) &&
    record.additional.torrent_paths.length > 0;
}

function loadRecords(dataDir) {
  const records = [];
  let entries = [];

  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true });
  } catch (error) {
    console.error(`[indexer] Cannot read DATA_DIR ${dataDir}:`, error.message);
    return records;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const sourcePath = path.join(dataDir, entry.name);
    try {
      const raw = fs.readFileSync(sourcePath, "utf8");
      const record = JSON.parse(raw);
      records.push({
        record,
        sourcePath,
        recordId: getRecordId(record, sourcePath),
      });
    } catch (error) {
      console.error(`[indexer] Failed to parse ${entry.name}:`, error.message);
    }
  }

  console.log(`[indexer] Loaded ${records.length} record(s) from ${dataDir}`);
  return records;
}

const records = loadRecords(DATA_DIR);

function buildSearchUrl(query) {
  const urlObj = new URL(`${REMOTE_AA_BASE}/search`);
  urlObj.searchParams.set("q", query);
  const langs = String(REMOTE_AA_LANGS)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const lang of langs) {
    urlObj.searchParams.append("lang", lang);
  }
  if (REMOTE_AA_EXT) {
    urlObj.searchParams.set("ext", REMOTE_AA_EXT);
  }
  return urlObj.toString();
}

function fetchTextWithCurl(urlString, headers) {
  return new Promise((resolve, reject) => {
    const args = ["-s", urlString];
    for (const [key, value] of Object.entries(headers)) {
      if (!value) {
        continue;
      }
      if (key.toLowerCase() === "cookie") {
        args.push("-b", value);
      } else {
        args.push("-H", `${key}: ${value}`);
      }
    }
    execFile("curl", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 200, text: stdout });
    });
  });
}

async function fetchText(urlString) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8,gl;q=0.7,ja;q=0.6,da;q=0.5",
    Referer: "https://annas-archive.li/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-CH-UA":
      '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    Priority: "u=0, i",
  };
  const cookieParts = [];
  if (REMOTE_AA_ACCOUNT_ID2) {
    cookieParts.push(`aa_account_id2=${REMOTE_AA_ACCOUNT_ID2}`);
  }
  if (REMOTE_AA_COOKIE) {
    cookieParts.push(REMOTE_AA_COOKIE);
  }
  if (cookieParts.length > 0) {
    headers.Cookie = cookieParts.join("; ");
  }
  if (REMOTE_AA_USE_CURL) {
    return fetchTextWithCurl(urlString, headers);
  }
  const response = await fetch(urlString, {
    headers: {
      ...headers,
    },
  });
  const text = await response.text();
  return { status: response.status, text };
}

function parseSearchResults(html) {
  const cleaned = html.replace(/(<!--|-->)/g, "");
  const $ = cheerio.load(cleaned);
  const rows = $(".js-aarecord-list-outer .flex.pt-3.pb-3");
  const results = [];
  const seen = new Set();

  rows.each((_, el) => {
    const row = $(el);
    const md5Link = row.find('a[href^="/md5/"]').first();
    const href = md5Link.attr("href") || "";
    if (!href.startsWith("/md5/")) {
      return;
    }
    const md5 = href.replace("/md5/", "");
    if (!md5 || seen.has(md5)) {
      return;
    }
    seen.add(md5);

    const title = row.find("a.js-vim-focus").first().text().trim();
    const authorLink = row
      .find('a[href^="/search?q="]')
      .filter((_, a) => $(a).find('span[class*="mdi--user-edit"]').length > 0)
      .first();
    const authors = authorLink.text().trim();
    const coverUrl = row.find("img").first().attr("src") || "";
    results.push({ md5, title, authors, coverUrl });
  });

  return results;
}

function extractJsonFromHtml(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    return decodeHtmlEntities(preMatch[1]);
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return decodeHtmlEntities(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

async function fetchRecordByMd5(md5) {
  const urlString = `${REMOTE_AA_BASE}/db/aarecord_elasticsearch/md5:${md5}.json`;
  console.log(`[indexer] remote md5 url=${urlString}`);
  const { status, text } = await fetchText(urlString);
  if (status >= 400) {
    console.warn(`[indexer] remote md5 ${md5} status=${status}`);
    return null;
  }
  console.log(`[indexer] remote md5 raw=${text}`);
  const jsonText = extractJsonFromHtml(text);
  if (!jsonText) {
    console.warn(`[indexer] remote md5 ${md5} json not found`);
    return null;
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn(`[indexer] remote md5 ${md5} json parse failed: ${error.message}`);
    return null;
  }
}

function recordsToMatches(recordsList) {
  const matches = [];
  for (const entry of recordsList) {
    if (!entry) {
      continue;
    }
    const record = entry.record || entry;
    const source = entry.source || "";
    const recordId = entry.recordId || getRecordId(record, source);
    if (!hasTorrents(record)) {
      continue;
    }
    for (const torrentEntry of record.additional.torrent_paths) {
      matches.push({
        record,
        recordId,
        torrentEntry,
        score: 1,
        size: safeNumber(record?.file_unified_data?.filesize_best),
      });
    }
  }
  return matches;
}

function buildCapsXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<caps>",
    `  <server appversion="0.1.0" version="1.0" title="Internal Torznab Indexer" />`,
    '  <limits max="100" default="100" />',
    "  <searching>",
    '    <search available="yes" supportedParams="q" />',
    '    <book-search available="yes" supportedParams="q, isbn" />',
    "  </searching>",
    "  <categories>",
    `    <category id="${CATEGORY_ID}" name="${CATEGORY_NAME}">`,
    `      <subcat id="${SUBCATEGORY_ID}" name="${SUBCATEGORY_NAME}" />`,
    "    </category>",
    "  </categories>",
    "</caps>",
  ].join("\n");
}

function getTitle(record) {
  const title = firstString(record?.file_unified_data?.title_best) || "Unknown Title";
  const author = firstString(record?.file_unified_data?.author_best);
  const year = firstString(record?.file_unified_data?.year_best);
  const extension = firstString(record?.file_unified_data?.extension_best);

  let display = title;
  if (author) {
    display += ` — ${author}`;
  }
  if (year) {
    display += ` (${year})`;
  }
  if (extension) {
    display += ` [${extension}]`;
  }
  return display;
}

function buildMagnet(recordId, torrentEntry, displayName) {
  const hashSource = [
    recordId,
    torrentEntry?.torrent_path,
    torrentEntry?.file_level1,
    torrentEntry?.file_level2,
  ]
    .filter(Boolean)
    .join("#");
  const btih = sha1Hex(hashSource).slice(0, 40).toUpperCase();
  const dn = encodeURIComponent(displayName);
  return {
    magnet: `magnet:?xt=urn:btih:${btih}&dn=${dn}`,
    btih,
  };
}

function buildGuid(recordId, torrentEntry) {
  const guidSource = [
    recordId,
    torrentEntry?.torrent_path,
    torrentEntry?.file_level1,
  ]
    .filter(Boolean)
    .join("#");
  if (guidSource.length > 180) {
    return sha1Hex(guidSource);
  }
  return guidSource || sha1Hex(recordId);
}

function recordMatchesIsbn(record, isbnQuery) {
  const normalizedIsbn = normalizeIsbn(isbnQuery);
  if (!normalizedIsbn) {
    return false;
  }

  const isbnField = record?.search_only_fields?.search_isbn13;
  const isbnList = Array.isArray(isbnField) ? isbnField : (isbnField ? [isbnField] : []);
  for (const isbn of isbnList) {
    if (normalizeIsbn(isbn) === normalizedIsbn) {
      return true;
    }
  }

  const searchText = normalizeText(record?.search_only_fields?.search_text);
  return searchText.includes(normalizedIsbn);
}

function scoreRecord(record, queryTokens) {
  if (!queryTokens.length) {
    return 0;
  }

  const titleText = normalizeText(
    firstString(
      record?.search_only_fields?.search_title,
      record?.file_unified_data?.title_best
    )
  );
  const authorText = normalizeText(
    firstString(
      record?.search_only_fields?.search_author,
      record?.file_unified_data?.author_best
    )
  );
  const searchText = normalizeText(record?.search_only_fields?.search_text);

  let score = 0;
  for (const token of queryTokens) {
    if (titleText.includes(token)) {
      score += 2;
      continue;
    }
    if (authorText.includes(token)) {
      score += 1;
      continue;
    }
    if (searchText.includes(token)) {
      score += 0.5;
    }
  }

  return score;
}

function buildItems(matches) {
  const now = new Date().toUTCString();
  return matches
    .map(({ record, recordId, torrentEntry }) => {
      const title = getTitle(record);
      const size = safeNumber(record?.file_unified_data?.filesize_best);
      const guid = buildGuid(recordId, torrentEntry);
      const { magnet, btih } = buildMagnet(recordId, torrentEntry, title);
      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <pubDate>${escapeXml(now)}</pubDate>`,
        `      <link>${escapeXml(magnet)}</link>`,
        `      <description>${escapeXml(title)}</description>`,
        `      <size>${size}</size>`,
        `      <category>${CATEGORY_ID}</category>`,
        `      <category>${SUBCATEGORY_ID}</category>`,
        `      <enclosure url="${escapeXml(magnet)}" length="${size}" type="application/x-bittorrent" />`,
        `      <newznab:attr name="category" value="${CATEGORY_ID}" />`,
        `      <newznab:attr name="category" value="${SUBCATEGORY_ID}" />`,
        `      <torznab:attr name="category" value="${CATEGORY_ID}" />`,
        `      <torznab:attr name="category" value="${SUBCATEGORY_ID}" />`,
        `      <torznab:attr name="seeders" value="1" />`,
        `      <torznab:attr name="peers" value="1" />`,
        `      <newznab:attr name="seeders" value="1" />`,
        `      <newznab:attr name="peers" value="1" />`,
        `      <torznab:attr name="infohash" value="${btih}" />`,
        `      <torznab:attr name="downloadvolumefactor" value="0" />`,
        `      <torznab:attr name="uploadvolumefactor" value="1" />`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
}

function buildRssXml(baseUrl, matches) {
  const itemsXml = buildItems(matches);
  const total = matches.length;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">',
    "  <channel>",
    "    <title>Internal Torznab Indexer</title>",
    "    <description>Internal Torznab Indexer</description>",
    `    <link>${escapeXml(baseUrl)}/api</link>`,
    `    <torznab:response offset="0" total="${total}" />`,
    itemsXml,
    "  </channel>",
    "</rss>",
  ].join("\n");
}

function findMatchesLocal(query, isbnQuery) {
  const matches = [];
  const queryTokens = tokenize(query);
  const isbnMatches = Boolean(isbnQuery && normalizeIsbn(isbnQuery));

  for (const entry of records) {
    const { record, recordId } = entry;
    if (!hasTorrents(record)) {
      continue;
    }

    let score = 0;
    if (isbnMatches) {
      if (!recordMatchesIsbn(record, isbnQuery)) {
        continue;
      }
    } else {
      score = scoreRecord(record, queryTokens);
      if (score <= 0) {
        continue;
      }
    }

    for (const torrentEntry of record.additional.torrent_paths) {
      matches.push({
        record,
        recordId,
        torrentEntry,
        score,
        size: safeNumber(record?.file_unified_data?.filesize_best),
      });
    }
  }

  if (matches.length === 0 && !isbnMatches && queryTokens.length === 0) {
    for (const entry of records) {
      const { record, recordId } = entry;
      if (!hasTorrents(record)) {
        continue;
      }
      const torrentEntry = record.additional.torrent_paths[0];
      matches.push({
        record,
        recordId,
        torrentEntry,
        score: 0,
        size: safeNumber(record?.file_unified_data?.filesize_best),
      });
      break;
    }
  }

  return matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.size - a.size;
  });
}

async function findMatchesRemote(query) {
  const searchUrl = buildSearchUrl(query);
  const { status, text } = await fetchText(searchUrl);
  console.log(`[indexer] remote search status=${status} url=${searchUrl}`);
  if (status >= 400) {
    return [];
  }
  const results = parseSearchResults(text).slice(0, REMOTE_AA_LIMIT);
  console.log(`[indexer] remote search results=${results.length}`);

  const recordsList = [];
  for (const item of results) {
    const record = await fetchRecordByMd5(item.md5);
    if (!record) {
      continue;
    }
    recordsList.push({ record, recordId: item.md5, source: item.md5 });
  }

  return recordsToMatches(recordsList);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || "";
  const queryParams = parsedUrl.query || {};
  const logParams = JSON.stringify(queryParams);
  console.log(`[indexer] request ${req.method} ${pathname} params=${logParams}`);

  if (pathname !== "/api") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const { t, q, isbn } = queryParams;
  const baseUrl = BASE_URL || (req.headers.host ? `http://${req.headers.host}` : `http://localhost:${PORT}`);

  if (t === "caps") {
    const xml = buildCapsXml();
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(xml);
    return;
  }

  if (t === "search" || t === "book") {
    const query = typeof q === "string" ? q : "";
    const isbnQuery = typeof isbn === "string" ? isbn : "";
    const handle = async () => {
      let matches = [];
      if (REMOTE_AA_ENABLED && query) {
        matches = await findMatchesRemote(query);
      } else {
        matches = findMatchesLocal(query, isbnQuery);
      }
      console.log(`[indexer] ${t} q="${query}" isbn="${isbnQuery}" -> ${matches.length} item(s)`);
      const xml = buildRssXml(baseUrl, matches);
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
      res.end(xml);
    };
    handle().catch((error) => {
      console.error(`[indexer] search failed: ${error.message}`);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Search failed");
    });
    return;
  }

  res.writeHead(400, { "Content-Type": "text/plain" });
  res.end("Bad request");
});

server.listen(PORT, () => {
  console.log(`[indexer] Listening on port ${PORT}`);
});
