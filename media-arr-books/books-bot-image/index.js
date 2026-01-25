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

    const text = msg.text?.trim();
    if (!text) {
      bot.sendMessage(chatId, 'Por favor, envía un texto para buscar libros.');
      return;
    }

    if (text.startsWith('/')) {
      if (text === '/start') {
        bot.sendMessage(chatId, '📚 ¡Hola! Soy el buscador de la Biblioteca Secreta.\n\nEnvía el título o autor de un libro y buscaré en la biblioteca local de 152,080 EPUBs.\n\nComandos disponibles:\n/addMail <email> - Asocia un email para recibir libros por correo\n/changeMail <email> - Actualiza tu email configurado\n/myId - Muestra tu ID de Telegram\n/help - Muestra este mensaje de ayuda');
      } else if (text === '/help') {
        let helpMessage = '📚 Biblioteca Secreta Bot\n\n';
        helpMessage += '• Envía un texto para buscar libros\n';
        helpMessage += '• Usa los botones para descargar o ver más info\n';
        helpMessage += '• Resultados limitados a 5 por búsqueda\n';
        helpMessage += '• Los EPUBs se envían como archivos (funciona desde cualquier red)\n\n';
        helpMessage += 'Comandos disponibles:\n';
        helpMessage += '/start - Inicia el bot\n';
        helpMessage += '/help - Muestra este mensaje de ayuda\n';
        helpMessage += '/addMail <email> - Asocia un email a tu cuenta\n';
        helpMessage += '/changeMail <email> - Actualiza tu email configurado\n';
        helpMessage += '/myId - Muestra tu ID de Telegram\n';

        if (isAdmin(userId, whitelistConfig)) {
          helpMessage += '\nComandos de administración:\n';
          helpMessage += '/addUser <id> - Agrega un usuario a la whitelist\n';
          helpMessage += '/removeUser <id> - Elimina un usuario de la whitelist\n';
          helpMessage += '/listUsers - Lista todos los usuarios autorizados\n';
        }

        bot.sendMessage(chatId, helpMessage);
      } else if (text === '/myId') {
        bot.sendMessage(chatId, `👤 Tu ID de Telegram: ${userId}`);
      } else if (text.startsWith('/addUser')) {
        if (!isAdmin(userId, whitelistConfig)) {
          bot.sendMessage(chatId, '❌ Solo el administrador puede usar este comando.');
          return;
        }

        const targetId = text.replace('/addUser', '').trim();

        if (!targetId) {
          bot.sendMessage(chatId, '❌ Por favor, incluye el ID del usuario.\n\nUso: /addUser 123456789');
          return;
        }

        if (whitelistConfig.whitelist.includes(targetId)) {
          bot.sendMessage(chatId, '⚠️ El usuario ya está en la whitelist.');
          return;
        }

        whitelistConfig.whitelist.push(targetId);
        saveWhitelist(whitelistConfig);
        allowedUsers.add(targetId);

        bot.sendMessage(chatId, `✅ Usuario agregado:\n\n👤 ID: ${targetId}\n\nTotal usuarios: ${whitelistConfig.whitelist.length}`);
      } else if (text.startsWith('/removeUser')) {
        if (!isAdmin(userId, whitelistConfig)) {
          bot.sendMessage(chatId, '❌ Solo el administrador puede usar este comando.');
          return;
        }

        const targetId = text.replace('/removeUser', '').trim();

        if (!targetId) {
          bot.sendMessage(chatId, '❌ Por favor, incluye el ID del usuario.\n\nUso: /removeUser 123456789');
          return;
        }

        if (targetId === whitelistConfig.admin) {
          bot.sendMessage(chatId, '❌ No puedes eliminar al administrador.');
          return;
        }

        const index = whitelistConfig.whitelist.indexOf(targetId);
        if (index === -1) {
          bot.sendMessage(chatId, '⚠️ El usuario no está en la whitelist.');
          return;
        }

        whitelistConfig.whitelist.splice(index, 1);
        saveWhitelist(whitelistConfig);
        allowedUsers.delete(targetId);

        bot.sendMessage(chatId, `✅ Usuario eliminado:\n\n👤 ID: ${targetId}\n\nTotal usuarios: ${whitelistConfig.whitelist.length}`);
      } else if (text === '/listUsers') {
        if (!isAdmin(userId, whitelistConfig)) {
          bot.sendMessage(chatId, '❌ Solo el administrador puede usar este comando.');
          return;
        }

        const userList = whitelistConfig.whitelist.map((id, i) => `${i + 1}. ${id}${id === whitelistConfig.admin ? ' 👑 (admin)' : ''}`).join('\n');
        bot.sendMessage(chatId, `👥 Usuarios autorizados (${whitelistConfig.whitelist.length}):\n\n${userList}`);
      } else if (text.startsWith('/addMail')) {
        const email = text.replace('/addMail', '').trim();

        if (!email) {
          bot.sendMessage(chatId, '❌ Por favor, incluye un email.\n\nUso: /addMail tu@email.com');
          return;
        }

        if (!isValidEmail(email)) {
          bot.sendMessage(chatId, '❌ El email no tiene un formato válido.\n\nUso: /addMail tu@email.com');
          return;
        }

        const emails = loadEmails();
        emails[userId] = email;
        saveEmails(emails);

        bot.sendMessage(chatId, `✅ Email asociado correctamente:\n\n📧 ${email}\n\nAhora puedes usar el botón 📧 Email en los resultados para recibir libros en este correo.`);
      } else if (text.startsWith('/changeMail')) {
        const newEmail = text.replace('/changeMail', '').trim();

        if (!newEmail) {
          bot.sendMessage(chatId, '❌ Por favor, incluye el nuevo email.\n\nUso: /changeMail nuevo@email.com');
          return;
        }

        if (!isValidEmail(newEmail)) {
          bot.sendMessage(chatId, '❌ El email no tiene un formato válido.\n\nUso: /changeMail nuevo@email.com');
          return;
        }

        const emails = loadEmails();

        if (!emails[userId]) {
          bot.sendMessage(chatId, '❌ No tienes un email configurado.\n\nUsa el comando:\n/addMail tu@email.com\n\npara asociar un email a tu cuenta primero.');
          return;
        }

        const oldEmail = emails[userId];
        emails[userId] = newEmail;
        saveEmails(emails);

        bot.sendMessage(chatId, `✅ Email actualizado correctamente:\n\n📧 Anterior: ${oldEmail}\n📧 Nuevo: ${newEmail}`);
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
