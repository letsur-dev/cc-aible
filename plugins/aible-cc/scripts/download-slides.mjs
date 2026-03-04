#!/usr/bin/env node
/**
 * download-slides.mjs
 * Downloads Google Slides presentation thumbnails to local PNG files.
 * Requires Node.js 18+ (native fetch). Zero npm dependencies.
 */

import { createSign } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HELP_TEXT = `Usage: node scripts/download-slides.mjs <google-slides-url-or-id> [options]

Downloads slide images from a Google Slides presentation.

Environment variables (checked in priority order):
  1. OAuth Refresh Token:
     GOOGLE_OAUTH_CLIENT_ID        OAuth2 client ID
     GOOGLE_OAUTH_CLIENT_SECRET    OAuth2 client secret
     GOOGLE_OAUTH_REFRESH_TOKEN    OAuth2 refresh token
  2. GOOGLE_SLIDES_ACCESS_TOKEN    Pre-resolved access token
  3. GOOGLE_SERVICE_ACCOUNT_JSON   Service account JSON as string
  4. GOOGLE_APPLICATION_CREDENTIALS Path to service account JSON key file

Output:
  lectures/{title}/assets/slide_{n}.png   Slide thumbnail images
  lectures/{title}/metadata.json          Presentation metadata
`;

// ---------------------------------------------------------------------------
// URL / ID parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the Google Slides presentation ID from a URL or returns the raw ID.
 * @param {string} input - Google Slides URL or raw presentation ID
 * @returns {string} presentation ID
 */
function extractPresentationId(input) {
  const urlPattern = /\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/;
  const match = input.match(urlPattern);
  if (match) return match[1];
  // Assume raw ID if no URL pattern matched
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
  throw new Error(`Cannot parse presentation ID from: ${input}`);
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Resolves the active authentication mode from environment variables.
 * Priority: refresh-token > static-access-token > service-account-json > application-credentials
 * @returns {string} auth mode identifier
 */
function resolveAuthMode() {
  const has = (v) => typeof v === 'string' && v.trim() !== '';
  if (
    has(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
    has(process.env.GOOGLE_OAUTH_CLIENT_SECRET) &&
    has(process.env.GOOGLE_OAUTH_REFRESH_TOKEN)
  ) {
    return 'refresh-token';
  }
  if (has(process.env.GOOGLE_SLIDES_ACCESS_TOKEN)) return 'access-token';
  if (has(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)) return 'service-account-json';
  if (has(process.env.GOOGLE_APPLICATION_CREDENTIALS)) return 'application-credentials';
  return 'none';
}

/**
 * Returns a valid Bearer access token using available credentials.
 * @returns {Promise<string>} access token
 */
async function getAccessToken() {
  const mode = resolveAuthMode();
  switch (mode) {
    case 'refresh-token':
      return getRefreshTokenAccessToken();
    case 'access-token':
      return process.env.GOOGLE_SLIDES_ACCESS_TOKEN.trim();
    case 'service-account-json':
      return getServiceAccountTokenFromJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    case 'application-credentials':
      return getServiceAccountTokenFromFile(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    default:
      throw new Error(
        'No credentials found. Set one of:\n' +
        '  - GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN\n' +
        '  - GOOGLE_SLIDES_ACCESS_TOKEN\n' +
        '  - GOOGLE_SERVICE_ACCOUNT_JSON\n' +
        '  - GOOGLE_APPLICATION_CREDENTIALS'
      );
  }
}

/**
 * Exchanges an OAuth2 refresh token for an access token.
 * Falls back to GOOGLE_SLIDES_ACCESS_TOKEN if refresh fails.
 * @returns {Promise<string>} access token
 */
async function getRefreshTokenAccessToken() {
  const endpoint = 'https://oauth2.googleapis.com/token';
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`Refresh token exchange failed (${resp.status}): ${detail}`);
    }
    const data = await resp.json();
    const token = data.access_token;
    if (!token) throw new Error('Refresh response missing access_token');
    return token;
  } catch (err) {
    // Fallback to static token if available
    if (process.env.GOOGLE_SLIDES_ACCESS_TOKEN?.trim()) {
      process.stderr.write('Warning: Refresh token failed, falling back to static access token.\n');
      return process.env.GOOGLE_SLIDES_ACCESS_TOKEN.trim();
    }
    throw err;
  }
}

/**
 * Exchanges a service account JSON key for an OAuth2 access token via JWT.
 * @param {string} jsonStr - service account JSON as string
 * @returns {Promise<string>} access token
 */
async function getServiceAccountTokenFromJson(jsonStr) {
  let key;
  try {
    key = JSON.parse(jsonStr);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  return exchangeServiceAccountJwt(key);
}

/**
 * Exchanges a service account JSON key file for an OAuth2 access token via JWT.
 * @param {string} keyFilePath - path to service account JSON key file
 * @returns {Promise<string>} access token
 */
async function getServiceAccountTokenFromFile(keyFilePath) {
  const key = JSON.parse(readFileSync(keyFilePath, 'utf8'));
  return exchangeServiceAccountJwt(key);
}

/**
 * Core JWT exchange logic for service accounts.
 * @param {{client_email: string, private_key: string}} key
 * @returns {Promise<string>} access token
 */
async function exchangeServiceAccountJwt(key) {
  const scope = 'https://www.googleapis.com/auth/presentations.readonly';
  const aud = 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: key.client_email, scope, aud, iat: now, exp: now + 3600 })
  );
  const unsigned = `${header}.${payload}`;

  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(key.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Service account token exchange failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return data.access_token;
}

/** @param {string} str @returns {string} */
function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a URL with Bearer auth, retrying on 429/5xx and network errors.
 * @param {string} url
 * @param {string} token - OAuth2 access token
 * @returns {Promise<Response>}
 */
async function authorizedFetch(url, token) {
  const maxRetries = 3;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt < maxRetries) {
          const delay = (1000 * Math.pow(2, attempt)) + Math.random() * 200;
          await sleep(delay);
          continue;
        }
      }
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = (1000 * Math.pow(2, attempt)) + Math.random() * 200;
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error(`Request failed after ${maxRetries} retries: ${url}`);
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles common API error status codes with user-friendly messages.
 * @param {Response} resp
 * @param {string} context - description for error messages
 */
async function handleApiErrors(resp, context) {
  if (resp.ok) return;
  const body = await resp.text().catch(() => '');
  if (resp.status === 403) {
    let hint = 'Ensure the service account or OAuth user has access to this presentation.';
    // Try to extract service account email for sharing instructions
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        if (sa.client_email) hint = `Share the presentation with: ${sa.client_email}`;
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
        if (sa.client_email) hint = `Share the presentation with: ${sa.client_email}`;
      }
    } catch { /* ignore parse errors */ }
    process.stderr.write(`Error: Permission denied. ${hint}\n`);
    process.exit(1);
  }
  if (resp.status === 404) {
    process.stderr.write(
      'Error: Presentation not found. Check the URL or presentation ID.\n'
    );
    process.exit(1);
  }
  if (resp.status === 400 && body.includes('operation is not supported')) {
    process.stderr.write(
      'Error: This file is not a native Google Slides presentation.\n'
    );
    process.exit(1);
  }
  throw new Error(`${context} failed (${resp.status}): ${body}`);
}

// ---------------------------------------------------------------------------
// Slides API
// ---------------------------------------------------------------------------

/**
 * Fetches presentation metadata (title and slides list).
 * @param {string} presentationId
 * @param {string} token
 * @returns {Promise<{title: string, slides: Array}>}
 */
async function fetchPresentation(presentationId, token) {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`;
  const resp = await authorizedFetch(url, token);
  await handleApiErrors(resp, 'Fetch presentation');
  return resp.json();
}

/**
 * Fetches the thumbnail URL for a single slide page.
 * @param {string} presentationId
 * @param {string} pageObjectId
 * @param {string} token
 * @returns {Promise<string>} contentUrl of the PNG thumbnail
 */
async function fetchThumbnailUrl(presentationId, pageObjectId, token) {
  const params = new URLSearchParams({
    'thumbnailProperties.thumbnailSize': 'LARGE',
    'thumbnailProperties.mimeType': 'PNG',
  });
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${pageObjectId}/thumbnail?${params}`;
  const resp = await authorizedFetch(url, token);
  await handleApiErrors(resp, `Fetch thumbnail for ${pageObjectId}`);
  const data = await resp.json();
  return data.contentUrl;
}

/**
 * Downloads a PNG from a URL and returns its buffer.
 * @param {string} contentUrl
 * @returns {Promise<Buffer>}
 */
async function downloadImage(contentUrl) {
  const resp = await fetch(contentUrl);
  if (!resp.ok) throw new Error(`Failed to download image (${resp.status}): ${contentUrl}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

/**
 * Runs mapper over items in sequential batches of batchSize.
 * @template T, R
 * @param {T[]} items
 * @param {number} batchSize
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
async function mapInBatches(items, batchSize, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, j) => mapper(item, i + j))
    );
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes a presentation title for use as a directory name.
 * @param {string} title
 * @param {string} fallbackId
 * @returns {string}
 */
function sanitizeTitle(title, fallbackId) {
  let sanitized = title.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 100);
  return sanitized || `Presentation_${fallbackId}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Main entry point: parses args, authenticates, downloads slides.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const input = args[0];
  let presentationId;
  try {
    presentationId = extractPresentationId(input);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let presentation;
  try {
    presentation = await fetchPresentation(presentationId, token);
  } catch (err) {
    process.stderr.write(`Error fetching presentation: ${err.message}\n`);
    process.exit(1);
  }

  const { title, slides: allSlides = [] } = presentation;
  const sanitized = sanitizeTitle(title ?? '', presentationId);
  const outputDir = join('lectures', sanitized);
  const assetsDir = join(outputDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  // Filter skipped slides, preserve original 1-indexed slide number
  const slides = allSlides
    .map((slide, i) => ({ slide, slideNumber: i + 1 }))
    .filter(({ slide }) => !slide.slideProperties?.isSkipped);

  process.stderr.write(
    `Presentation: "${title}" (${slides.length} slides to download)\n`
  );

  const slideResults = await mapInBatches(slides, 4, async ({ slide, slideNumber }) => {
    const pageObjectId = slide.objectId;
    process.stderr.write(`  Downloading slide ${slideNumber}...\n`);

    const contentUrl = await fetchThumbnailUrl(presentationId, pageObjectId, token);
    const imageBuffer = await downloadImage(contentUrl);
    const filePath = join(assetsDir, `slide_${slideNumber}.png`);
    writeFileSync(filePath, imageBuffer);

    return { slideNumber, filePath };
  });

  const metadata = {
    title: title ?? '',
    presentationId,
    totalSlides: slideResults.length,
    outputDir,
    slides: slideResults,
  };

  writeFileSync(join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  process.stdout.write(JSON.stringify(metadata, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
