import { SearchBook } from '../lib/types';
import { catalogSeeds, getAllMaps } from '../lib/mockData';

function normalize(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s'"“”‘’.,:;!?()[\]{}\-_/]+/g, '');
}

function dedupeBooks(books: SearchBook[]) {
  const seen = new Set<string>();
  return books.filter((book) => {
    const key = `${normalize(book.title)}::${normalize(book.author)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getLocalFallback() {
  return dedupeBooks([
    ...getAllMaps().map((map) => ({ ...map, source: map.sourceMeta?.kind || 'library' as const })),
    ...catalogSeeds,
  ]);
}

export async function searchCatalog(query: string): Promise<SearchBook[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return getLocalFallback().filter((item) => item.status === 'has_map').slice(0, 8);
  }

  try {
    const response = await fetch(`/api/search-books?q=${encodeURIComponent(trimmed)}`);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    return Array.isArray(payload.results) ? payload.results : [];
  } catch (error) {
    console.warn('Backend search failed, falling back to local data.', error);
    return getLocalFallback().filter((item) => normalize(item.title).includes(normalize(trimmed)));
  }
}
