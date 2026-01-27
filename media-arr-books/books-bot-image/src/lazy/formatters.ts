type LazyBookCandidate = {
  bookid?: string;
  bookname?: string;
  authorname?: string;
  year?: string | number;
  bookisbn?: string;
  highest_fuzz?: number;
};

type LazyHit = {
  libid: string;
  title: string;
  authors: string[];
  published?: string | number;
  description?: string;
  source?: 'lazy';
  isbn?: string;
  score?: number;
};

const normalizeLazyHit = (item: LazyBookCandidate): LazyHit => {
  const isbn = item.bookisbn ? String(item.bookisbn).trim() : '';
  return {
    libid: String(item.bookid || ''),
    title: item.bookname || 'Sin título',
    authors: item.authorname ? [item.authorname] : ['Desconocido'],
    published: item.year,
    source: 'lazy',
    isbn: isbn || undefined,
    score: typeof item.highest_fuzz === 'number' ? item.highest_fuzz : undefined,
  };
};

const normalizeLazyHits = (items: LazyBookCandidate[]): LazyHit[] => {
  const hits = items.map(normalizeLazyHit).filter(hit => hit.libid.length > 0);
  return hits.sort((a, b) => {
    const aHasIsbn = a.isbn ? 1 : 0;
    const bHasIsbn = b.isbn ? 1 : 0;
    if (aHasIsbn !== bHasIsbn) return bHasIsbn - aHasIsbn;
    const aScore = typeof a.score === 'number' ? a.score : -1;
    const bScore = typeof b.score === 'number' ? b.score : -1;
    if (aScore !== bScore) return bScore - aScore;
    return 0;
  });
};

export {
  normalizeLazyHit,
  normalizeLazyHits,
  type LazyHit,
};
