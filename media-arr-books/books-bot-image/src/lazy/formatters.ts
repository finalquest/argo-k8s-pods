type LazyBookCandidate = {
  bookid?: string;
  bookname?: string;
  authorname?: string;
  year?: string | number;
};

type LazyHit = {
  libid: string;
  title: string;
  authors: string[];
  published?: string | number;
  description?: string;
  source?: 'lazy';
};

const normalizeLazyHit = (item: LazyBookCandidate): LazyHit => {
  return {
    libid: String(item.bookid || ''),
    title: item.bookname || 'Sin título',
    authors: item.authorname ? [item.authorname] : ['Desconocido'],
    published: item.year,
    source: 'lazy',
  };
};

const normalizeLazyHits = (items: LazyBookCandidate[]): LazyHit[] => {
  return items.map(normalizeLazyHit).filter(hit => hit.libid.length > 0);
};

export {
  normalizeLazyHit,
  normalizeLazyHits,
  type LazyHit,
};
