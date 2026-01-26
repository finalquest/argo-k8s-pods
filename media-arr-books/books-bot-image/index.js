import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { MeiliSearch } from 'meilisearch';
import nodemailer from 'nodemailer';
import {
  normalizeAuthor,
  generateFilename,
  isValidEmail,
} from './src/utils/text.ts';
import {
  loadWhitelist,
  saveWhitelist,
  loadEmails,
  saveEmails,
} from './src/utils/fs.ts';
import {
  formatResult,
  buildPaginatedMessage,
  buildInlineKeyboard,
  buildAuthorPreviewMessage,
} from './src/messages/formatters.ts';
import {
  conversationStates,
  clearConversationState,
  cleanOldStates,
} from './src/state/conversation-state.ts';
import {
  getTotalBooksByAuthor,
  searchByAuthors,
  searchMeilisearch,
  searchWithStrategies,
  searchAuthorFacets,
  extractAuthorsFromFacets,
  escapeFilterValue,
} from './src/search/meili.ts';
import { createMessageHandler } from './src/handlers/message-handler.ts';
import { createCallbackHandler } from './src/handlers/callback-handler.ts';
import { createLazyClient } from './src/lazy/client.ts';
import { normalizeLazyHits } from './src/lazy/formatters.ts';
import {
  addLazyJob,
  getLazyJob,
  updateLazyJob,
  listLazyJobs,
  listLazyJobsByUser,
  removeLazyJob,
} from './src/lazy/state.ts';
import { processLazyJobs } from './src/lazy/poller.ts';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_USER_IDS = '',
  ADMIN_USER_ID = '',
  MEILI_INDEX = 'biblioteca',
  BIBLIOTECA_BASE_URL,
  MEILI_API_KEY,
  LOG_LEVEL = 'info',
  SMTP_HOST,
  SMTP_PORT,
  SMTP_EMAIL,
  SMTP_PASSWORD,
  SMTP_FROM,
  LAZY_BASE_URL,
  LAZY_API_KEY
} = process.env;

const isTestEnv = process.env.NODE_ENV === 'test';
const MEILI_HOST = process.env.MEILI_HOST || (isTestEnv ? 'http://localhost:7700' : undefined);

if (!isTestEnv) {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error('Missing TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }

  if (!MEILI_HOST) {
    logger.error('Missing MEILI_HOST');
    process.exit(1);
  }
}

const allowedUserIds = ALLOWED_USER_IDS.split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const allowedUsers = new Set(allowedUserIds);

const WHITELIST_FILE = '/data/bot-whitelist.json';


const isAdmin = (userId, config) => {
  return String(userId) === String(config.admin);
};

const whitelistConfig = loadWhitelist({
  isTestEnv,
  allowedUserIds,
  adminUserId: ADMIN_USER_ID || allowedUserIds[0],
  whitelistFile: WHITELIST_FILE,
  logger,
});

const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const lazyClient = (LAZY_BASE_URL && LAZY_API_KEY)
  ? createLazyClient({ baseUrl: LAZY_BASE_URL, apiKey: LAZY_API_KEY, logger })
  : null;

const lazyFindBook = async (query) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.findBook(query);
};

const lazyAddBook = async (bookId) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.addBook(bookId);
};

const lazyQueueBook = async (bookId) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.queueBook(bookId);
};

const lazySearchBook = async (bookId) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.searchBook(bookId);
};

const lazyForceProcess = async () => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.forceProcess();
};

const lazyHeadFileDirect = async (bookId) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.headFileDirect(bookId);
};

const lazyDownloadFileDirect = async (bookId) => {
  if (!lazyClient) {
    throw new Error('LazyLibrarian no configurado (LAZY_BASE_URL/LAZY_API_KEY)');
  }
  return lazyClient.downloadFileDirect(bookId);
};

const searchMeili = (
  query,
  limit = 5,
  filters = null,
  offset = 0,
  searchIn = ['title'],
  useExactPhrase = false
) => {
  return searchMeilisearch(
    meiliClient,
    MEILI_INDEX,
    query,
    limit,
    filters,
    offset,
    searchIn,
    useExactPhrase,
    logger
  );
};

const searchWithStrategiesCompat = (query, limit = 5, searchFn = searchMeili) => {
  return searchWithStrategies(query, limit, searchFn, logger);
};

const searchAuthorFacetsCompat = (query, meili = meiliClient) => {
  return searchAuthorFacets(meili, MEILI_INDEX, query);
};

const searchByAuthorsBound = (query, limit = 5) => {
  return searchByAuthors(meiliClient, MEILI_INDEX, query, limit, logger);
};

const getTotalBooksByAuthorBound = (authorName) => {
  return getTotalBooksByAuthor(meiliClient, MEILI_INDEX, authorName, logger);
};

const EMAILS_FILE = '/data/bot-emails.json';

const getEmails = () => loadEmails({ emailsFile: EMAILS_FILE, logger });

const persistEmails = (emails) => saveEmails(emails, { emailsFile: EMAILS_FILE, logger });

const hasEmail = (userId) => Boolean(getEmails()[userId]);

const persistWhitelist = () => saveWhitelist(whitelistConfig, {
  whitelistFile: WHITELIST_FILE,
  logger,
});


const extractUniqueAuthors = (results) => {
  const authorMap = new Map();

  results.forEach(book => {
    const author = Array.isArray(book.authors) ? book.authors[0] : book.authors;
    const normalizedAuthor = normalizeAuthor(author);
    const displayName = Array.isArray(book.authors) ? book.authors[0] : book.authors;

    const truncatedDisplayName = displayName.length > 30
      ? displayName.substring(0, 30) + '...'
      : displayName;

    if (!authorMap.has(normalizedAuthor)) {
      authorMap.set(normalizedAuthor, {
        name: normalizedAuthor,
        displayName: truncatedDisplayName,
        bookCount: 1
      });
    } else {
      authorMap.get(normalizedAuthor).bookCount++;
    }
  });

  const uniqueAuthors = Array.from(authorMap.values())
    .sort((a, b) => b.bookCount - a.bookCount);

  return uniqueAuthors;
};

const sendAuthorCtaAfterTitleResults = async (bot, chatId, uniqueAuthors) => {
  if (uniqueAuthors.length !== 1) return;

  const author = uniqueAuthors[0];
  await bot.sendMessage(chatId,
    `👤 Encontré un autor que coincide: ${author.displayName}.\n\n` +
    `¿Quieres pasar a modo autor?`,
    {
      reply_markup: {
        inline_keyboard: [[{
          text: `✅ Sí, buscar solo libros de ${author.displayName.substring(0, 25)}`,
          callback_data: `activate_author_${author.name}`
        }]]
      }
    }
  );
};

const handleAuthorSuggestion = async (
  bot,
  chatId,
  userId,
  originalQuery,
  uniqueAuthors,
  deps = {}
) => {
  if (uniqueAuthors.length === 0) return;

  const meili = deps.meiliClient || meiliClient;
  const getTotal = deps.getTotalBooksByAuthor || getTotalBooksByAuthorBound;
  const escapeValue = deps.escapeFilterValue || escapeFilterValue;

  if (uniqueAuthors.length === 1) {
    const author = uniqueAuthors[0];
    const totalBooks = await getTotal(author.name);

    const index = meili.index(MEILI_INDEX);
    const previewSearch = await index.search('', {
      limit: 5,
      filter: `authors = "${escapeValue(author.name)}"`,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    });

    const previewBooks = previewSearch.hits;
    const messageText = buildAuthorPreviewMessage(author, previewBooks, totalBooks, originalQuery);

    const keyboard = [[{
      text: `✅ Sí, buscar libros de ${author.displayName.substring(0, 25)}`,
      callback_data: `activate_author_${author.name}`
    }]];

    await bot.sendMessage(chatId, messageText, {
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard }
    });

    logger.info({
      chatId,
      author: author.name,
      totalBooks,
      previewBooks: previewBooks.length
    }, '[SUGGESTION] Author suggestion with preview sent');
    return;
  }

  if (uniqueAuthors.length <= 5) {
    let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
    messageText += `👤 Encontré ${uniqueAuthors.length} autores que coinciden:\n\n`;

    uniqueAuthors.forEach((author, index) => {
      messageText += `${index + 1}. ${author.displayName} (${author.bookCount} libro${author.bookCount > 1 ? 's' : ''})\n`;
    });

    messageText += `\nElige el autor que quieres usar:`;

    const keyboard = uniqueAuthors.map((author, index) => [{
      text: `${index + 1}. ${author.displayName.substring(0, 30)} (${author.bookCount})`,
      callback_data: `activate_author_${author.name}`
    }]);

    await bot.sendMessage(chatId, messageText, {
      reply_markup: { inline_keyboard: keyboard }
    });

    logger.info({
      chatId,
      authors: uniqueAuthors.length,
      authorsList: uniqueAuthors.map(a => a.name)
    }, '[SUGGESTION] Multiple authors suggestion sent');
    return;
  }

  let messageText = `🔍 No encontré libros con el título "${originalQuery}".\n\n`;
  messageText += `👤 Encontré muchos autores que coinciden.\n\n`;
  messageText += `Usa /author ${originalQuery} [apellido] para refinar la búsqueda.`;

  await bot.sendMessage(chatId, messageText);

  logger.info({ chatId, query: originalQuery }, '[SUGGESTION] Too many authors, asking for refinement');
};

const getBookById = async (libid) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const result = await index.getDocument(String(libid), {
      fields: ['libid', 'title', 'authors', 'description', 'published', 'filename', 'pagecount', 'size', 'labels']
    });
    return result;
  } catch (err) {
    logger.error({ err, libid }, 'Error getting book by ID');
    return null;
  }
};

const sendEmail = async (toEmail, book, epubBuffer, filename) => {
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: SMTP_PORT || 587,
      secure: false,
      auth: {
        user: SMTP_EMAIL,
        pass: SMTP_PASSWORD
      }
    });

    const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors || 'Desconocido';
    const subject = `📚 ${book.title} - ${authors}`;

    const mailOptions = {
      from: SMTP_FROM || SMTP_EMAIL,
      to: toEmail,
      subject: subject,
      text: `Hola,

      Aquí tienes el libro que pediste:

      📚 Título: ${book.title}
      ✍️ Autor(es): ${authors}
      📅 Año: ${book.published || 'N/A'}
      📄 Páginas: ${book.pagecount || 'N/A'}
      💾 Tamaño: ${book.size ? `${(book.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}

      El archivo EPUB está adjunto.

      ¡Saludos!`,
      attachments: [{
        filename: filename,
        content: epubBuffer
      }]
    };

    await transporter.sendMail(mailOptions);
    logger.info({ toEmail, title: book.title }, 'Email sent successfully');
    return true;
  } catch (err) {
    logger.error({ err, toEmail }, 'Error sending email');
    throw err;
  }
};

async function startBot() {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  logger.info('Bot connected to Telegram');

  setInterval(() => cleanOldStates(bot, logger), 60000);
  setInterval(() => {
    if (!lazyClient) return;
    processLazyJobs({
      bot,
      logger,
      listLazyJobs,
      updateLazyJob,
      removeLazyJob,
      headFileDirect: lazyHeadFileDirect,
      downloadFileDirect: lazyDownloadFileDirect,
      fallbackFilename: (title, author) => generateFilename(title, author ? [author] : undefined),
    });
  }, 30000);

  const messageHandler = createMessageHandler({
    bot,
    logger,
    allowedUsers,
    whitelistConfig,
    isAdmin,
    persistWhitelist,
    getEmails,
    persistEmails,
    isValidEmail,
    hasEmail,
    conversationStates,
    searchByAuthors: searchByAuthorsBound,
    extractUniqueAuthors,
    buildInlineKeyboard,
    buildPaginatedMessage,
    formatResult,
    searchMeili,
    searchWithStrategies: searchWithStrategiesCompat,
    searchAuthorFacets: searchAuthorFacetsCompat,
    extractAuthorsFromFacets,
    sendAuthorCtaAfterTitleResults,
    handleAuthorSuggestion,
    clearConversationState,
    lazyFindBook,
    normalizeLazyHits,
    listLazyJobsByUser,
  });

  bot.on('message', messageHandler);

  const callbackHandler = createCallbackHandler({
    bot,
    logger,
    allowedUsers,
    conversationStates,
    getBookById,
    bibliotecaBaseUrl: BIBLIOTECA_BASE_URL,
    generateFilename,
    sendEmail,
    getEmails,
    searchMeili,
    buildPaginatedMessage,
    buildInlineKeyboard,
    hasEmail,
    getTotalBooksByAuthor: getTotalBooksByAuthorBound,
    searchByAuthors: searchByAuthorsBound,
    extractUniqueAuthors,
    lazyAddBook,
    lazyQueueBook,
    lazySearchBook,
    lazyForceProcess,
    lazyHeadFileDirect,
    lazyDownloadFileDirect,
    addLazyJob,
    getLazyJob,
    updateLazyJob,
  });

  bot.on('callback_query', callbackHandler);

  bot.on('polling_error', (err) => {
    logger.warn({ err }, 'Polling error');
  });

  logger.info('Bot ready to receive messages');
}

if (process.env.NODE_ENV !== 'test') {
  startBot().catch((err) => {
    logger.error({ err }, 'Bot failed to start');
    process.exit(1);
  });
}

export {
  searchWithStrategiesCompat as searchWithStrategies,
  searchAuthorFacetsCompat as searchAuthorFacets,
  extractAuthorsFromFacets,
  buildAuthorPreviewMessage,
  sendAuthorCtaAfterTitleResults,
  handleAuthorSuggestion,
  escapeFilterValue,
  normalizeAuthor
};
