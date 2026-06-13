const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

/**
 * Normalizes a URL by removing fragments and trailing slashes.
 * @param {string} urlStr - The raw URL string.
 * @returns {string} - Normalized URL string.
 */
function normalizeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    parsed.hash = ''; // Remove fragment identifiers
    let clean = parsed.href;
    if (clean.endsWith('/') && parsed.pathname === '/') {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch (e) {
    return urlStr;
  }
}

/**
 * Recursively crawls internal pages of a website starting from a base URL.
 * @param {string} startUrl - The starting landing URL.
 * @param {number} maxPages - The maximum number of pages to index (default 8).
 * @returns {Promise<Object>} - An object with pages array and combined text corpus.
 */
async function crawlWebsite(startUrl, maxPages = 8) {
  const pages = [];
  const visited = new Set();
  const queue = [];

  let parsedStart;
  try {
    parsedStart = new URL(startUrl);
  } catch (e) {
    throw new Error("Invalid start URL provided.");
  }

  const hostname = parsedStart.hostname;
  const origin = parsedStart.origin;

  // Add the normalized start URL to queue
  const initialUrl = normalizeUrl(startUrl);
  queue.push({ url: initialUrl, depth: 1 });
  visited.add(initialUrl);

  console.log(`Starting crawl on hostname: ${hostname}`);

  // Fetch headers to look like a real browser
  const axiosConfig = {
    timeout: 5000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SiteMindScraper/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  };

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift();

    // Cap depth at 3 levels to avoid deep link holes
    if (depth > 3) continue;

    try {
      console.log(`Crawling (${pages.length + 1}/${maxPages}): ${url}`);
      const response = await axios.get(url, axiosConfig);
      
      // Ensure we received HTML content
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('text/html')) {
        console.log(`Skipping non-HTML page: ${url} (Content-Type: ${contentType})`);
        continue;
      }

      const $ = cheerio.load(response.data);

      // Extract internal links for further crawling
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          // Resolve relative links
          const resolved = new URL(href, url);
          const normalized = normalizeUrl(resolved.href);

          // Enforce: Must match hostname, not already visited, not a binary/asset extension
          if (
            resolved.hostname === hostname &&
            !visited.has(normalized) &&
            !/\.(png|jpe?g|gif|pdf|docx?|zip|gz|mp4|mp3|css|js|xml|json|svg)$/i.test(resolved.pathname)
          ) {
            visited.add(normalized);
            queue.push({ url: normalized, depth: depth + 1 });
          }
        } catch (linkError) {
          // Invalid URL format in href, ignore
        }
      });

      // HTML Cleaning - Strip only tags that contain non-textual layout noise, styles, scripts
      $('script, style, svg, iframe, noscript, link, meta, head, button').remove();

      // Extract metadata
      const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled Page';
      
      // Extract primary headers
      const headings = [];
      $('h1, h2, h3').each((_, h) => {
        const text = $(h).text().trim().replace(/\s+/g, ' ');
        if (text && text.length > 3) {
          headings.push(text);
        }
      });

      // Extract paragraph content
      const paragraphs = [];
      $('p, li').each((_, p) => {
        const text = $(p).text().trim().replace(/\s+/g, ' ');
        if (text && text.length > 8) {
          paragraphs.push(text);
        }
      });

      const textBody = paragraphs.join('\n');
      const wordCount = textBody.split(/\s+/).filter(Boolean).length;

      // Only index pages with substantial textual content
      if (wordCount > 10) {
        pages.push({
          url,
          title: pageTitle,
          headings: headings.slice(0, 10), // Cap at 10 headers to avoid inflation
          text: textBody,
          wordCount
        });
      }

    } catch (err) {
      console.error(`Failed to crawl URL: ${url} - Error: ${err.message}`);
      // Fallback: If landing page fails, push a placeholder so user gets something
      if (pages.length === 0 && url === startUrl) {
        pages.push({
          url,
          title: "Website Details",
          headings: ["Homepage Connection Failed"],
          text: `We attempted to fetch the landing page but encountered a connection error: ${err.message}. Please verify the website is online and allows scraper bots.`,
          wordCount: 30
        });
      }
    }
  }

  // Compile combined corpus and calculate overall words
  let combinedCorpus = '';
  let overallWords = 0;
  pages.forEach((p, idx) => {
    overallWords += p.wordCount;
    combinedCorpus += `=== PAGE ${idx + 1}: ${p.title} ===\n`;
    combinedCorpus += `URL: ${p.url}\n`;
    if (p.headings.length > 0) {
      combinedCorpus += `HEADINGS:\n- ${p.headings.join('\n- ')}\n`;
    }
    combinedCorpus += `CONTENT:\n${p.text}\n\n`;
  });

  return {
    pagesCrawled: pages.map(p => ({ url: p.url, title: p.title, wordCount: p.wordCount })),
    totalWords: overallWords,
    corpus: combinedCorpus
  };
}

module.exports = {
  crawlWebsite
};
