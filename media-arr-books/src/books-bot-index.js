import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { MeiliSearch } from 'meilisearch';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const {
  TELEGRAM_BOT_TOKEN,
  ALLOWED_USER_IDS = '',
  MEILI_HOST,
  MEILI_INDEX = 'biblioteca',
  BIBLIOTECA_BASE_URL,
  MEILI_API_KEY,
  LOG_LEVEL = 'info'
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

const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_API_KEY,
});

const truncate = (text, maxLength = 280) => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
};

const formatResult = (hit) => {
  const authors = Array.isArray(hit.authors) ? hit.authors.join(', ') : hit.authors || 'Desconocido';
  const year = hit.published ? `(${hit.published})` : '';
  const description = truncate(hit.description, 280);

  return `📚 *${hit.title}* ${year}\n✍️ ${authors}\n\n${description}`;
};

const buildInlineKeyboard = (results) => {
  const keyboard = results.map((hit) => ([
    {
      text: '📥 Descargar',
      callback_data: `download_${hit.libid}`
    },
    {
      text: 'ℹ️ Más info',
      callback_data: `info_${hit.libid}`
    }
  ]));

  return { inline_keyboard: keyboard };
};

const searchMeilisearch = async (query, limit = 5) => {
  try {
    const index = meiliClient.index(MEILI_INDEX);
    const search = await index.search(query, {
      limit,
      attributesToRetrieve: ['libid', 'title', 'authors', 'description', 'published', 'filename'],
    });

    return search.hits;
  } catch (err) {
    logger.error({ err, query }, 'Error searching Meilisearch');
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

    const text = msg.text?.trim();
    if (!text) {
      bot.sendMessage(chatId, 'Por favor, envía un texto para buscar libros.');
      return;
    }

    if (text.startsWith('/')) {
      if (text === '/start') {
        bot.sendMessage(chatId, '📚 ¡Hola! Soy el buscador de la Biblioteca Secreta.\n\nEnvía el título o autor de un libro y buscaré en la biblioteca local de 152,080 EPUBs.');
      } else if (text === '/help') {
        bot.sendMessage(chatId, '📚 *Biblioteca Secreta Bot*\n\n• Envía un texto para buscar libros\n• Usa los botones para descargar o ver más info\n• Resultados limitados a 5 por búsqueda', { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, 'Comando no reconocido. Envía un texto para buscar libros.');
      }
      return;
    }

    try {
      logger.info({ chatId, text }, 'Searching for books');
      const results = await searchMeilisearch(text);

      if (results.length === 0) {
        bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
        return;
      }

      const messageText = `📚 *Resultados para "${text}":*\n\n` +
        results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

      await bot.sendMessage(chatId, messageText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(results)
      });
    } catch (err) {
      logger.error({ chatId, err }, 'Error processing search');
      bot.sendMessage(chatId, `❌ Error al buscar: ${err.message}`);
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from?.id ? String(query.from.id) : '';
    const data = query.data;

    if (allowedUsers.size && !allowedUsers.has(userId)) {
      bot.answerCallbackQuery(query.id, { text: 'No autorizado' });
      return;
    }

    try {
      if (data.startsWith('download_')) {
        const libid = data.replace('download_', '');
        const results = await searchMeilisearch('', 1000);
        const book = results.find(r => String(r.libid) === libid);

        if (!book || !book.filename) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const downloadUrl = `${BIBLIOTECA_BASE_URL}/biblioteca/${book.filename}`;
        await bot.sendMessage(chatId, `📥 *${book.title}*\n✍️ ${Array.isArray(book.authors) ? book.authors.join(', ') : book.authors}\n\n${downloadUrl}`, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        bot.answerCallbackQuery(query.id, { text: '✅ Link generado' });

      } else if (data.startsWith('info_')) {
        const libid = data.replace('info_', '');
        const results = await searchMeilisearch('', 1000);
        const book = results.find(r => String(r.libid) === libid);

        if (!book) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const authors = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors || 'Desconocido';
        const labels = Array.isArray(book.labels) ? book.labels.join(', ') : book.labels || 'N/A';
        const downloadUrl = `${BIBLIOTECA_BASE_URL}/biblioteca/${book.filename}`;

        const infoText = `📖 *Detalles del libro*\n\n` +
          `📚 *Título:* ${book.title}\n` +
          `✍️ *Autor(es):* ${authors}\n` +
          `📅 *Año:* ${book.published || 'N/A'}\n` +
          `📄 *Páginas:* ${book.pagecount || 'N/A'}\n` +
          `💾 *Tamaño:* ${book.size ? `${(book.size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}\n` +
          `🏷️ *Etiquetas:* ${labels}\n\n` +
          `📥 ${downloadUrl}`;

        await bot.sendMessage(chatId, infoText, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        bot.answerCallbackQuery(query.id, { text: 'ℹ️ Detalles mostrados' });
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
