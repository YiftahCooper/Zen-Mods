/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {canonicalCategoryName, categoryKey} from './ZenIconCategories.mjs';

export const ICON_PROVIDERS = Object.freeze([
  "emoji",
  "zen",
  "lucide",
  "custom",
]);

const PROVIDER_ORDER = new Map(
  ICON_PROVIDERS.map((provider, index) => [provider, index]),
);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeSearchText(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

function normalizeList(values) {
  return unique((values ?? []).map(normalizeSearchText));
}

export function createIconRecord(record) {
  if (!ICON_PROVIDERS.includes(record.provider)) {
    throw new Error(`Unknown icon provider: ${record.provider}`);
  }
  if (!record.id || !record.name || !record.source || !record.kind) {
    throw new Error("Icon records require id, name, source, and kind");
  }

  const idPrefix = `${record.provider}:`;
  const aliases = normalizeList(record.aliases);
  const tags = normalizeList(record.tags);
  const categories = unique(
    (record.categories ?? []).map((category) => String(category).trim()),
  );
  const id = String(record.id).startsWith(idPrefix)
    ? String(record.id)
    : `${idPrefix}${record.id}`;
  const searchTokens = unique(
    [
      ...tokenizeSearchText(record.name),
      ...aliases.flatMap(tokenizeSearchText),
      ...tags.flatMap(tokenizeSearchText),
      ...categories.flatMap(tokenizeSearchText),
      ...tokenizeSearchText(record.pack),
      ...tokenizeSearchText(record.path),
    ].filter(Boolean),
  );

  return {
    id,
    provider: record.provider,
    name: String(record.name).trim(),
    aliases,
    tags,
    categories,
    source: String(record.source),
    kind: record.kind,
    order: Number.isFinite(record.order) ? record.order : 0,
    searchTokens,
    ...(record.pack ? { pack: String(record.pack) } : {}),
    ...(record.path ? { path: String(record.path) } : {}),
    ...(record.lucideEquivalentIds?.length
      ? { lucideEquivalentIds: unique(record.lucideEquivalentIds) }
      : {}),
    ...(record.lucideAllowedIds?.length
      ? { lucideAllowedIds: unique(record.lucideAllowedIds) }
      : {}),
    ...(record.allowConceptVariant ? { allowConceptVariant: true } : {}),
  };
}

// Catalogues replace records rather than mutate them; weak keys retain no old pack.
const searchIndex = new WeakMap();
function indexedRecord(record) {
  if (searchIndex.has(record)) return searchIndex.get(record);
  const name = normalizeSearchText(record.name);
  const aliases = record.aliases.map(normalizeSearchText);
  const value = {
    name,
    aliases,
    nameTokens: tokenizeSearchText(name),
    aliasTokens: aliases.flatMap(tokenizeSearchText),
    categoryTagTokens: [...record.tags, ...record.categories].flatMap(
      tokenizeSearchText,
    ),
    id: normalizeSearchText(record.id),
    pack: normalizeSearchText(record.pack),
    path: normalizeSearchText(record.path),
  };
  searchIndex.set(record, value);
  return value;
}

function scoreRecord(record, normalizedQuery, queryTerms) {
  if (!queryTerms.length) {
    return { score: 0, matchedTerms: 0 };
  }

  const {
    name,
    aliases,
    nameTokens,
    aliasTokens,
    categoryTagTokens,
    id,
    pack,
    path,
  } = indexedRecord(record);
  let score = 0;
  let matchedTerms = 0;

  if (name === normalizedQuery || aliases.includes(normalizedQuery)) {
    score += 10000;
  } else if (
    name.includes(normalizedQuery) ||
    aliases.some((alias) => alias.includes(normalizedQuery))
  ) {
    score += 4000;
  }

  for (const term of queryTerms) {
    let termScore = 0;
    if (nameTokens.includes(term) || aliasTokens.includes(term)) {
      termScore = 1000;
    } else if (
      nameTokens.some((token) => token.startsWith(term)) ||
      aliasTokens.some((token) => token.startsWith(term))
    ) {
      termScore = 800;
    } else if (categoryTagTokens.includes(term)) {
      termScore = 600;
    } else if (
      record.searchTokens.some((token) => token.includes(term)) ||
      id.includes(term) ||
      pack.includes(term) ||
      path.includes(term)
    ) {
      termScore = 250;
    }
    if (termScore) {
      matchedTerms++;
      score += termScore;
    }
  }

  return { score, matchedTerms };
}

export function searchIconRecords(
  records,
  query,
  { providers = new Set(ICON_PROVIDERS) } = {},
) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTerms = tokenizeSearchText(normalizedQuery);

  return records
    .filter((record) => providers.has(record.provider))
    .map((record, index) => ({
      record,
      index,
      ...scoreRecord(record, normalizedQuery, queryTerms),
    }))
    .filter((result) => !queryTerms.length || result.matchedTerms > 0)
    .sort(
      (a, b) =>
        b.matchedTerms - a.matchedTerms ||
        b.score - a.score ||
        (PROVIDER_ORDER.get(a.record.provider) ?? 99) -
          (PROVIDER_ORDER.get(b.record.provider) ?? 99) ||
        a.record.order - b.record.order ||
        a.index - b.index ||
        a.record.id.localeCompare(b.record.id),
    )
    .map((result) => result.record);
}

export function groupIconRecords(records, options = {}) {
  const filteredRecords = searchIconRecords(records, options.query ?? "", {
    providers: options.providers ?? new Set(ICON_PROVIDERS),
  });
  const groups = new Map();

  for (const record of filteredRecords) {
    const category = canonicalCategoryName(record.categories[0], [...groups.keys()]);
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(record);
  }

  return [...groups]
    .sort(([left], [right]) =>
      String(left).localeCompare(String(right), "en", {
        sensitivity: "base",
        numeric: true,
      }),
    )
    .map(([category, groupRecords]) => ({
      category,
      records: groupRecords,
    }));
}
