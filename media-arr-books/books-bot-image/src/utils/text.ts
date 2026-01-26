const normalizeAuthor = (author?: string) => {
  return String(author || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

const truncate = (text?: string, maxLength = 280) => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
};

const sanitizeFilename = (text?: string) => {
  return String(text || '').replace(/[<>:"/\\|?*]/g, '');
};

const generateFilename = (title?: string, authors?: string[] | string) => {
  let authorStr = 'Desconocido';
  if (Array.isArray(authors) && authors.length > 0) {
    authorStr = authors[0];
  } else if (typeof authors === 'string' && authors.length > 0) {
    authorStr = authors;
  }
  const sanitizedTitle = sanitizeFilename(title);
  const sanitizedAuthor = sanitizeFilename(authorStr);
  return `${sanitizedTitle} - ${sanitizedAuthor}.epub`;
};

const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export {
  normalizeAuthor,
  truncate,
  sanitizeFilename,
  generateFilename,
  isValidEmail,
};
