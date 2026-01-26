import { truncate } from '../utils/text.ts';

type BookHit = {
  libid: string | number;
  title: string;
  authors?: string[] | string;
  description?: string;
  published?: string | number;
};

type AuthorSummary = {
  name: string;
  displayName: string;
  bookCount: number;
};

type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

const formatResult = (hit: BookHit) => {
  const authors = Array.isArray(hit.authors) ? hit.authors.join(', ') : hit.authors || 'Desconocido';
  const year = hit.published ? `(${hit.published})` : '';
  const description = truncate(hit.description, 280);

  return `${hit.title} ${year}\nAutor: ${authors}\n\n${description}`;
};

const buildPaginatedMessage = (
  query: string,
  results: BookHit[],
  currentPage: number,
  totalResults: number,
  searchType: string,
  displayName: string | null = null
) => {
  const totalPages = Math.ceil(totalResults / 5);

  let header = '';

  if ((searchType === 'AUTHOR' || searchType === 'AUTHOR_BROWSE') && displayName) {
    header = `👤 Modo autor: ${displayName}\n`;
  }

  header += `📚 Página ${currentPage + 1}/${totalPages} (${totalResults} resultados)\n`;
  header += `🔍 Buscando: "${query}"\n\n`;

  const bookList = results.map((hit, index) => {
    const globalIndex = (currentPage * 5) + index + 1;
    return `${globalIndex}. ${hit.title}`;
  }).join('\n');

  return header + bookList;
};

const buildPaginationKeyboard = (currentPage: number, totalPages: number, isLastPage: boolean) => {
  const paginationRow = [];

  if (currentPage > 0) {
    paginationRow.push({
      text: '⬅️ Anterior',
      callback_data: 'page_prev'
    });
  }

  if (!isLastPage) {
    paginationRow.push({
      text: 'Siguiente ➡️',
      callback_data: 'page_next'
    });
  }

  return paginationRow.length > 0 ? [paginationRow] : [];
};

const buildInlineKeyboard = (
  results: BookHit[],
  userId: string,
  currentPage = 0,
  totalResults = 5,
  hasEmail = false
): InlineKeyboardMarkup => {
  const keyboard = results.map((hit, index) => {
    const row: InlineKeyboardButton[] = [
      {
        text: `📥 ${index + 1}. ${truncate(hit.title, 40)}`,
        callback_data: `download_${hit.libid}`
      },
      {
        text: 'ℹ️ Info',
        callback_data: `info_${hit.libid}`
      }
    ];

    if (hasEmail) {
      row.push({
        text: '📧 Email',
        callback_data: `email_${hit.libid}`
      });
    }

    return row;
  });

  const totalPages = Math.ceil(totalResults / 5);
  const isLastPage = currentPage >= totalPages - 1;
  const paginationButtons = buildPaginationKeyboard(currentPage, totalPages, isLastPage);

  return { inline_keyboard: [...keyboard, ...paginationButtons] };
};

const buildAuthorPreviewMessage = (
  author: AuthorSummary,
  previewBooks: BookHit[],
  totalBooks: number,
  originalQuery: string
) => {
  let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
  messageText += '👤 ¡Pero encontré un autor!\n\n';
  messageText += `✍️ ${author.displayName}\n`;
  messageText += `📚 Tiene ${totalBooks} libro${totalBooks > 1 ? 's' : ''} en la biblioteca.\n\n`;

  if (totalBooks > 5) {
    messageText += '📖 Primeros 5 libros:\n\n';
  } else {
    messageText += '📖 Todos sus libros:\n\n';
  }

  previewBooks.forEach((book, index) => {
    const year = book.published ? `(${book.published})` : '';
    messageText += `${index + 1}. ${book.title} ${year}\n`;
  });

  if (totalBooks > 5) {
    messageText += `\n💡 Y ${totalBooks - 5} más libros de ${author.displayName}...\n\n`;
    messageText += `¿Quieres buscar solo libros de ${author.displayName}?`;
  } else {
    messageText += `\n\n¿Quieres buscar libros de ${author.displayName}?`;
  }

  return messageText;
};

export {
  formatResult,
  buildPaginatedMessage,
  buildPaginationKeyboard,
  buildInlineKeyboard,
  buildAuthorPreviewMessage,
};
