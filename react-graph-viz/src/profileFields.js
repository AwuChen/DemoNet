/** Helpers for mixer CSV fields: school, role, and URL-only links. */

export function normalizeUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim().replace(/[.,)]+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`;
  }
  return url;
}

/** Extra URLs from import (pipe-separated), excluding primary website already shown separately. */
export function parseExtraLinks(linksField, primaryWebsiteUrl) {
  if (!linksField) return [];
  const linked = normalizeUrl(primaryWebsiteUrl);
  const seen = new Set(linked ? [linked.toLowerCase()] : []);
  const out = [];
  for (const part of String(linksField).split('|')) {
    const url = normalizeUrl(part);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function linkLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || url;
  } catch {
    return url.length > 40 ? `${url.slice(0, 40)}…` : url;
  }
}

export function recordField(record, key) {
  if (!record || !key) return '';
  if (typeof record.has === 'function') {
    if (!record.has(key)) return '';
  } else {
    const keys = record.keys;
    if (Array.isArray(keys) && !keys.includes(key)) return '';
  }
  try {
    const value = record.get(key);
    return value != null && value !== '' ? value : '';
  } catch {
    return '';
  }
}

/** Map Cypher record aliases (source/target) to graph node profile fields. */
export function profileFromRecord(record, side) {
  const school =
    recordField(record, `${side}School`) ||
    recordField(record, `${side}Location`) ||
    '';
  return {
    role: recordField(record, `${side}Role`),
    school,
    website: recordField(record, `${side}Website`),
    email: recordField(record, `${side}Email`),
    links: recordField(record, `${side}Links`),
  };
}

export function profileFromNeo4jProps(props = {}) {
  return {
    role: props.role || '',
    school: props.school || props.location || '',
    website: props.website || '',
    email: props.email || '',
    links: props.links || '',
  };
}
