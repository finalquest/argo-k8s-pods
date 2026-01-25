import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { MeiliSearch } from 'meilisearch';
import * as fs from 'fs';
import nodemailer from 'nodemailer';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_USER_IDS = '',
  ADMIN_USER_ID = '',
  MEILI_HOST,
  MEILI_INDEX = 'biblioteca',
  BIBLIOTECA_BASE_URL,
  MEILI_API_KEY,
  LOG_LEVEL = 'info',
  SMTP_HOST,
  SMTP_PORT,
  SMTP_EMAIL,
  SMTP_PASSWORD,
  SMTP_FROM
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  logger.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

if (!MEILI_HOST) {
  logger.error('Missing MEILI_HOST');
  process.exit(1);
}

const allowedUsers = new Set(
  ALLOWED_USER_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

const conversationStates = new Map();

const WHITELIST_FILE = '/data/bot-whitelist.json';

const loadWhitelist = () => {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      const data = fs.readFileSync(WHITELIST_FILE, 'utf-8');
      const config = JSON.parse(data);
      logger.info({ whitelist: config.whitelist, admin: config.admin }, 'Whitelist loaded from file');
      return config;
    } else {
      logger.warn('Whitelist file not found, creating default');
      const defaultConfig = {
        whitelist: ALLOWED_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean),
        admin: ADMIN_USER_ID || ALLOWED_USER_IDS.split(',')[0]?.trim()
      };
      saveWhitelist(defaultConfig);
      return defaultConfig;
    }
  } catch (err) {
    logger.error({ err }, 'Error loading whitelist file');
    return {
      whitelist: ALLOWED_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean),
      admin: ADMIN_USER_ID || ALLOWED_USER_IDS.split(',')[0]?.trim()
    };
  }
};

const saveWhitelist = (config) => {
  try {
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(config, null, 2));
    logger.info({ whitelist: config.whitelist, admin: config.admin }, 'Whitelist saved to file');
  } catch (err) {
    logger.error({ err }, 'Error saving whitelist file');
    throw err;
  }
};

const isAdmin = (userId, config) => {
  return String(userId) === String(config.admin);
};

const whitelistConfig = loadWhitelist();

const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const EMAILS_FILE = '/data/bot-emails.json';

const loadEmails = () => {
  try {
    if (fs.existsSync(EMAILS_FILE)) {
      const data = fs.readFileSync(EMAILS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.error({ err }, 'Error loading emails file');
  }
  return {};
};

const saveEmails = (emails) => {
  try {
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2));
    logger.info('Emails saved successfully');
  } catch (err) {
    logger.error({ err }, 'Error saving emails file');
    throw err;
  }
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const normalizeAuthor = (authors) => {
  if (!authors) return '';
  let authorStr = '';
  
  if (Array.isArray(authors)) {
    authorStr = authors[0];
  } else {
    authorStr = authors;
  }
  
  return authorStr.toLowerCase().trim();
};

const detectAuthorSearch = (results, originalQuery) => {
  if (results.length < 3) return null;
  
  const authors = results.map(r => normalizeAuthor(r.authors));
  const authorCount = {};
  
  authors.forEach(author => {
    authorCount[author] = (authorCount[author] || 0) + 1;
  });
  
  const sortedAuthors = Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1]);
  
  const [dominantAuthor, count] = sortedAuthors[0];
  const percentage = (count / results.length) * 100;
  
  if (percentage >= 80) {
    return {
      isAuthorSearch: true,
      author: dominantAuthor,
      originalQuery
    };
  }
  
  return null;
};

const clearConversationState = (chatId) => {
  if (conversationStates.has(chatId)) {
    conversationStates.delete(chatId);
    logger.info({ chatId }, 'Conversation state cleared');
  }
};

const cleanOldStates = () => {
  const now = Date.now();
  const TIMEOUT_MS = 15 * 60 * 1000;
  
  for (const [chatId, state] of conversationStates.entries()) {
    if (now - state.timestamp > TIMEOUT_MS) {
      const authorName = Array.isArray(state.originalQuery.split(',').map(s => s.trim())[0])
        ? state.originalQuery.split(',')[0].trim()
        : state.originalQuery;
      
      conversationStates.delete(chatId);
      logger.info({ chatId }, 'Conversation state expired');
      
      bot.sendMessage(chatId,
        `⏰ Tu búsqueda de ${authorName} expiró por inactividad.\n\n` +
        `Para continuar buscando, envía nuevamente "${state.originalQuery}" o usa /restartSearch.`
      ).catch(err => {
        logger.error({ err, chatId }, 'Error sending expiration message');
      });
    }
  }
};

setInterval(cleanOldStates, 30000);

const sanitizeFilename = (text) => {
  return text.replace(/[<>:"/\\|?*]/g, '');
};

const generateFilename = (title, authors) => {
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

const truncate = (text, maxLength = 280) => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
};

const formatResult = (hit) => {
  const authors = Array.isArray(hit.authors) ? hit.authors.join(', ') : hit.authors || 'Desconocido';
  const year = hit.published ? `(${hit.published})` : '';
  const description = truncate(hit.description, 280);

  return `${hit.title} ${year}\nAutor: ${authors}\n\n${description}`;
};

const buildInlineKeyboard = (results, userId) => {
  const emails = loadEmails();
  const hasEmail = emails[userId];

  const keyboard = results.map((hit, index) => {
    const row = [
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

  return { inline_keyboard: keyboard };
};

const searchMeilisearch = async (query, limit = 5, filters = null) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const searchParams = {
      limit,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    };
    
    if (filters && filters.author) {
      searchParams.filter = `authors = "${filters.author}"`;
    }
    
    const search = await index.search(query, searchParams);

    return search.hits;
  } catch (err) {
    logger.error({ err, query, filters }, 'Error searching Meilisearch');
    throw err;
  }
};

const searchByAuthors = async (query, limit = 5) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const search = await index.search(query, {
      limit,
      attributesToSearchOn: ['authors'],
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    });
    
    logger.info({ query, results: search.hits.length }, 'Searched in authors field');
    return search.hits;
  } catch (err) {
    logger.error({ err, query }, 'Error searching in authors');
    throw err;
  }
};

const smartSearch = async (query, limit = 5, filters = null) => {
  if (filters && filters.author) {
    logger.info({ query, filters }, 'Searching with author filter');
    return {
      results: await searchMeilisearch(query, limit, filters),
      searchType: 'FILTERED'
    };
  }
  
  const authorResults = await searchByAuthors(query, limit);
  
  if (authorResults.length > 0) {
    logger.info({ query, results: authorResults.length, type: 'AUTHOR' }, 'Author search successful');
    return {
      results: authorResults,
      searchType: 'AUTHOR'
    };
  }
  
  logger.info({ query, type: 'GENERAL' }, 'No authors found, searching in all fields');
  const generalResults = await searchMeilisearch(query, limit, null);
  
  return {
    results: generalResults,
    searchType: 'GENERAL'
  };
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

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id ? String(msg.from.id) : '';

    if (allowedUsers.size && !allowedUsers.has(userId)) {
      logger.warn({ userId }, 'Unauthorized user');
      return;
    }

    if (conversationStates.has(chatId)) {
      const state = conversationStates.get(chatId);
      
      if (state.state === 'WAITING_FOR_BOOK_FILTER') {
        logger.info({ chatId, author: state.author, filter: text }, 'Filtering by author');
        
        const filteredResults = await searchMeilisearch(text, 10, { author: state.author });
        
        if (filteredResults.length === 0) {
          const authorName = Array.isArray(state.originalQuery.split(',').map(s => s.trim())[0])
            ? state.originalQuery.split(',')[0].trim()
            : state.originalQuery;
          
          bot.sendMessage(chatId, 
            `🔍 No encontré libros de ${authorName} que coincidan con "${text}".\n\n` +
            `Intenta con otro filtro o usa /restartSearch para cancelar.`
          );
          return;
        }
        
        if (filteredResults.length > 5) {
          const originalAuthorName = filteredResults[0].authors;
          const authorName = Array.isArray(originalAuthorName) 
            ? originalAuthorName[0] 
            : originalAuthorName;
          
          bot.sendMessage(chatId,
            `🔍 Encontré ${filteredResults.length} libros de ${authorName} que coinciden con "${text}".\n\n` +
            `Por favor refina tu búsqueda con un título más específico.\n\n` +
            `Ejemplos de cómo refinar:\n` +
            `• "${text} primera"\n` +
            `• "${text} trilogía"\n` +
            `• "${text} ciencia ficción"\n\n` +
            `O usa /restartSearch para cancelar.`
          );
          return;
        }
        
        conversationStates.delete(chatId);
        
        const messageText = `📚 Libros de ${filteredResults[0].authors} que coinciden con "${text}":\n\n` +
          filteredResults.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');
        
        await bot.sendMessage(chatId, messageText, {
          disable_web_page_preview: true,
          reply_markup: buildInlineKeyboard(filteredResults, userId)
        });
        
        return;
      }
    }

    try {
      logger.info({ chatId, text }, 'Searching for books');
      const searchResult = await smartSearch(text);
      const results = searchResult.results;

      if (results.length === 0) {
        bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
        clearConversationState(chatId);
        return;
      }

      if (searchResult.searchType === 'AUTHOR') {
        const authorDetection = detectAuthorSearch(results, text);
        
        if (authorDetection) {
        conversationStates.set(chatId, {
          state: 'WAITING_FOR_BOOK_FILTER',
          author: authorDetection.author,
          originalQuery: text,
          timestamp: Date.now()
        });
        
        const originalAuthorName = results[0].authors;
        const authorName = Array.isArray(originalAuthorName) 
          ? originalAuthorName[0] 
          : originalAuthorName;
        
        bot.sendMessage(chatId, 
          `📚 Encontré varios libros de ${authorName}.\n\n` +
          `¿Qué libro específico buscas?\n\n` +
          `Envía un título parcial o descripción para filtrar.\n` +
          `Mostraremos hasta 5 resultados que coincidan mejor.\n\n` +
          `O usa /restartSearch para cancelar.`
        );
        
        logger.info({ chatId, author: authorName, query: text }, 'Author search detected, waiting for filter');
        return;
      }
      }
      
      const messageText = `📚 Resultados para "${text}":\n\n` +
        results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

      await bot.sendMessage(chatId, messageText, {
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(results, userId)
      });
    } catch (err) {
      logger.error({ chatId, err }, 'Error processing search');
      bot.sendMessage(chatId, `❌ Error al buscar: ${err.message}`);
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from?.id ? String(query.from.id) : '';

    if (allowedUsers.size && !allowedUsers.has(userId)) {
      bot.answerCallbackQuery(query.id, { text: 'No autorizado' });
      return;
    }

    try {
      if (query.data.startsWith('download_')) {
        const libid = query.data.replace('download_', '');
        const book = await getBookById(libid);

        if (!book || !book.filename) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const downloadUrl = `${BIBLIOTECA_BASE_URL}/biblioteca/${book.filename}`;

        logger.info({ libid, filename: book.filename, title: book.title, authors: book.authors }, 'Sending EPUB from NAS...');

        try {
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filename = generateFilename(book.title, book.authors);

          if (!fs.existsSync('/tmp')) {
            fs.mkdirSync('/tmp');
          }

          const tempPath = `/tmp/${filename}`;
          fs.writeFileSync(tempPath, buffer);

          logger.info({ libid, filename }, 'Archivo temporal guardado');

          await bot.sendDocument(chatId, tempPath, {
            caption: `📥 ${book.title}\n✍️ ${Array.isArray(book.authors) ? book.authors.join(', ') : book.authors}`,
          });

          bot.answerCallbackQuery(query.id, { text: '✅ Archivo temporal enviado' });
        } catch (fetchError) {
          logger.error({ err: fetchError, url: downloadUrl }, 'Error downloading or saving EPUB');
          bot.sendMessage(chatId, `❌ Error al descargar o guardar archivo temporal: ${fetchError.message}`);
          bot.answerCallbackQuery(query.id, { text: '❌ Error al descargar o guardar' });
        }
      } else if (query.data.startsWith('info_')) {
        const libid = query.data.replace('info_', '');
        const book = await getBookById(libid);

        if (!book) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors || 'Desconocido';
        const labels = Array.isArray(book.labels) ? book.labels.join(', ') : book.labels || 'N/A';
        const downloadUrl = `${BIBLIOTECA_BASE_URL}/biblioteca/${book.filename}`;

        const infoText = `📖 Detalles del libro\n\n` +
          `📚 Título: ${book.title}\n` +
          `✍️ Autor(es): ${authors}\n` +
          `📅 Año: ${book.published || 'N/A'}\n` +
          `📄 Páginas: ${book.pagecount || 'N/A'}\n` +
          `💾 Tamaño: ${book.size ? `${(book.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}\n` +
          `🏷️ Etiquetas: ${labels}\n\n` +
          `📥 ${downloadUrl}`;

        await bot.sendMessage(chatId, infoText, {
          disable_web_page_preview: true
        });
        bot.answerCallbackQuery(query.id, { text: 'ℹ️ Detalles mostrados' });
      } else if (query.data.startsWith('email_')) {
        const libid = query.data.replace('email_', '');
        const book = await getBookById(libid);

        if (!book || !book.filename) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const emails = loadEmails();
        const userEmail = emails[userId];

        if (!userEmail) {
          bot.answerCallbackQuery(query.id, { text: '❌ No tienes email configurado' });
          bot.sendMessage(chatId, '❌ No tienes un email configurado.\n\nUsa el comando:\n/addMail tu@email.com\n\npara asociar un email a tu cuenta.');
          return;
        }

        try {
          bot.answerCallbackQuery(query.id, { text: '📧 Preparando envío por email...' });

          const downloadUrl = `${BIBLIOTECA_BASE_URL}/biblioteca/${book.filename}`;
          logger.info({ libid, filename: book.filename, userEmail }, 'Downloading EPUB for email...');

          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const epubBuffer = Buffer.from(arrayBuffer);
          const filename = generateFilename(book.title, book.authors);

          await sendEmail(userEmail, book, epubBuffer, filename);

          bot.sendMessage(chatId, `✅ Libro enviado a:\n\n📧 ${userEmail}\n\n📚 ${book.title}`);
        } catch (emailError) {
          logger.error({ err: emailError, userId, libid }, 'Error sending email');
          bot.sendMessage(chatId, `❌ Error al enviar por email: ${emailError.message}`);
        }
      }
    } catch (err) {
      logger.error({ chatId, err }, 'Error processing callback query');
      bot.answerCallbackQuery(query.id, { text: 'Error al procesar' });
    }
  });

  bot.on('polling_error', (err) => {
    logger.warn({ err }, 'Polling error');
  });

  logger.info('Bot ready to receive messages');
}

startBot().catch((err) => {
  logger.error({ err }, 'Bot failed to start');
  process.exit(1);
});
