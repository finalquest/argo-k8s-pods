const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data/records";
const BASE_URL = process.env.BASE_URL || "";

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
  const btih = sha1Hex(hashSource).slice(0, 40);
  const dn = encodeURIComponent(displayName);
  return `magnet:?xt=urn:btih:${btih}&dn=${dn}`;
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
      const magnet = buildMagnet(recordId, torrentEntry, title);
      return [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <pubDate>${escapeXml(now)}</pubDate>`,
        `      <size>${size}</size>`,
        `      <category>${CATEGORY_ID}</category>`,
        `      <enclosure url="${escapeXml(magnet)}" length="${size}" type="application/x-bittorrent" />`,
        `      <torznab:attr name="seeders" value="0" />`,
        `      <torznab:attr name="peers" value="0" />`,
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

function findMatches(query, isbnQuery) {
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
    const matches = findMatches(query, isbnQuery);
    console.log(`[indexer] ${t} q="${query}" isbn="${isbnQuery}" -> ${matches.length} item(s)`);
    const xml = buildRssXml(baseUrl, matches);
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(xml);
    return;
  }

  res.writeHead(400, { "Content-Type": "text/plain" });
  res.end("Bad request");
});

server.listen(PORT, () => {
  console.log(`[indexer] Listening on port ${PORT}`);
});
