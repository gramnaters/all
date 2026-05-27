// ringz.js

// Pure JS base64 (no Buffer dependency)
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function btoaPolyfill(str) {
  if (str == null) return '';
  let s = String(str);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c1 = s.charCodeAt(i++);
    const c2 = s.charCodeAt(i++);
    const c3 = s.charCodeAt(i++);
    const enc1 = c1 >> 2;
    const enc2 = ((c1 & 3) << 4) | (c2 >> 4);
    let enc3 = ((c2 & 15) << 2) | (c3 >> 6);
    let enc4 = c3 & 63;
    if (isNaN(c2)) { enc3 = 64; enc4 = 64; }
    else if (isNaN(c3)) { enc4 = 64; }
    out += BASE64_CHARS.charAt(enc1) + BASE64_CHARS.charAt(enc2) + BASE64_CHARS.charAt(enc3) + BASE64_CHARS.charAt(enc4);
  }
  return out;
}
function atobPolyfill(str) {
  if (!str) return '';
  let s = String(str).replace(/=+$/, '');
  let out = '';
  let bc = 0, bs, buffer, idx = 0;
  while ((buffer = BASE64_CHARS.indexOf(s.charAt(idx++))) !== -1 && ~buffer) {
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return out;
}

// RingZ provider — Hindi movies, web series, anime from a JSON API
// Base URL is base64 decoded: https://dataapi.yomoviesapk.com/
// Uses CloudFlare access headers, fetches JSON data files (Nwm.json, Nws.json, etc.)
// For movies: fetches AllMovieDataList, for series: webSeriesDataList

const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const CF_HEADERS = {
  "cf-access-client-id": atob("ZTNhMTVhZDk5OWRhYjdmMzU5MmYzZDg1NWUwZWM2ZWQuYWNjZXNz"),
  "cf-access-client-secret": atob("OGEyMjUzNmUyZGFjODYzNjlhMmNhYTkxMWQ1NWE4OWExMDk5MzljYzY5ZTY2NDZlNTFiZjVkODUyN2ExZGNhNQ=="),
  "user-agent": "Dart/3.8 (dart:io)"
};

async function searchRingZ(title, mediaType) {
  // Search through known JSON endpoints
  const endpoints = [
    "Nwm.json",   // Movies
    "Nws.json",   // Web Series
    "lstanime.json" // Anime
  ];

  for (const ep of endpoints) {
    try {
      const url = `${BASE_URL}${ep}`;
      const text = await (await fetch(url, { headers: CF_HEADERS})).text();

      // The JSON may have different structures
      let data;
      try { data = JSON.parse(text); } catch (_) { continue; }

      // Look for AllMovieDataList or webSeriesDataList
      const movieList = data?.AllMovieDataList || data?.allData || [];
      const seriesList = data?.webSeriesDataList || [];
      const searchIn = (mediaType === "movie") ? movieList : [...seriesList, ...movieList];

      const titleLower = title.toLowerCase();
      const found = searchIn.find(item => {
        const mn = (item?.mn || "").toLowerCase();
        return mn.includes(titleLower) || titleLower.includes(mn.split(" ")[0]);
      });

      if (found) return { item: found, endpoint: ep, isSeries: !!data?.webSeriesDataList && seriesList.includes(found) };
    } catch (_) {}
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  const BASE_URL = atobPolyfill("aHR0cHM6Ly9kYXRhYXBpLnlvbW92aWVzYXBrLmNvbS8=");
  try {
    // 1. Get title from TMDB
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const mediaInfo = await (await fetch(tmdbUrl, { headers: CF_HEADERS})).json();
    const title = mediaInfo.title || mediaInfo.name;
    if (!title) return [];

    // 2. Search RingZ
    const result = await searchRingZ(title, mediaType);
    if (!result) return [];

    const { item, isSeries } = result;
    const streams = [];

    if (isSeries && season && episode) {
      // For series: look for episode links in the series object
      const sourceKeys = Object.keys(item).filter(k => !["id", "mn", "IH", "lng", "gn", "cg", "qlty", "hf"].includes(k));
      for (const key of sourceKeys) {
        const value = item[key];
        if (typeof value === "string" && value.startsWith("http")) {
          // This is an episode link — check episode number
          const epMatch = key.match(/(\d+)/);
          if (epMatch && parseInt(epMatch[1]) === parseInt(episode)) {
            streams.push({
              url: value,
              quality: inferQuality(value, key),
              title: `RingZ [${key}]`,
              subtitles: []
            });
          }
        }
      }
    } else {
      // For movies: iterate all URL-valued keys
      const keys = Object.keys(item);
      for (const key of keys) {
        if (key === "hf") continue;
        const value = item[key];
        if (typeof value === "string" && value.startsWith("http")) {
          streams.push({
            url: value,
            quality: inferQuality(value, key),
            title: `RingZ [${key}]`,
            subtitles: []
          });
        }
      }
    }

    return streams;
  } catch (e) {
    console.error("[RingZ]", e);
    return [];
  }
}

function inferQuality(url, key) {
  const check = (s) => {
    if (!s) return null;
    const l = s.toLowerCase();
    if (l.includes("2160") || l.includes("4k")) return "4K";
    if (l.includes("1080")) return "1080p";
    if (l.includes("720")) return "720p";
    if (l.includes("480")) return "480p";
    if (l.includes("360")) return "360p";
    return null;
  };
  return check(url) || check(key) || "Unknown";
}

module.exports = { getStreams };
