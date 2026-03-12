import * as fs from 'fs';
import { downloadResponseToTemp } from '../lazy/download.ts';
import { normalizeLazyHits } from '../lazy/formatters.ts';

type Bot = {
  sendMessage: (chatId: string | number, text: string, options?: Record<string, unknown>) => Promise<unknown>;
  sendDocument: (chatId: string | number, filePath: string, options?: Record<string, unknown>) => Promise<unknown>;
  answerCallbackQuery: (id: string, options?: Record<string, unknown>) => Promise<unknown>;
  editMessageText: (text: string, options: Record<string, unknown>) => Promise<unknown>;
};

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type Deps = {
  bot: Bot;
  logger: Logger;
  allowedUsers: Set<string>;
  conversationStates: Map<string | number, Record<string, unknown>>;
  getBookById: (libid: string) => Promise<Record<string, unknown> | null>;
  bibliotecaBaseUrl: string | undefined;
  generateFilename: (title?: string, authors?: string[] | string) => string;
  sendEmail: (toEmail: string, book: Record<string, unknown>, epubBuffer: Buffer, filename: string) => Promise<boolean>;
  getEmails: () => Record<string, string>;
  searchMeili: (query: string, limit?: number, filters?: { author: string } | null, offset?: number, searchIn?: string[], useExactPhrase?: boolean) => Promise<{ hits: Record<string, unknown>[]; totalHits: number }>;
  buildPaginatedMessage: (query: string, results: Record<string, unknown>[], currentPage: number, totalResults: number, searchType: string, displayName?: string | null) => string;
  buildInlineKeyboard: (results: Record<string, unknown>[], userId: string, currentPage?: number, totalResults?: number, hasEmail?: boolean) => Record<string, unknown>;
  hasEmail: (userId: string) => boolean;
  getTotalBooksByAuthor: (authorName: string) => Promise<number>;
  searchByAuthors: (query: string, limit?: number) => Promise<Record<string, unknown>[]>;
  extractUniqueAuthors: (results: Record<string, unknown>[]) => { name: string; displayName: string; bookCount: number }[];
  lazyAddBook: (bookId: string) => Promise<{ Success?: boolean; Error?: { Message?: string } }>;
  lazyQueueBook: (bookId: string) => Promise<{ Success?: boolean; Error?: { Message?: string } }>;
  lazySearchBook: (bookId: string) => Promise<{ Success?: boolean; Error?: { Message?: string } }>;
  lazyForceProcess: () => Promise<{ Success?: boolean; Error?: { Message?: string } }>;
  lazyHeadFileDirect: (bookId: string) => Promise<Response>;
  lazyDownloadFileDirect: (bookId: string) => Promise<Response>;
  lazyFindBook: (query: string) => Promise<Record<string, unknown>[]>;
  lazyFindAuthor: (query: string) => Promise<Record<string, unknown>[]>;
  normalizeLazyHits: (items: Record<string, unknown>[]) => Record<string, unknown>[];
  addLazyJob: (job: { chatId: string | number; userId: string; bookId: string; title?: string; author?: string; startedAt: number; lastStatus?: string; deliveryMethod?: 'telegram' | 'email'; userEmail?: string }) => { jobId: string };
  getLazyJob: (jobId: string) => { jobId: string } | undefined;
  updateLazyJob: (jobId: string, update: { lastStatus?: string; deliveryMethod?: 'telegram' | 'email'; userEmail?: string }) => { jobId: string } | null;
};

const createCallbackHandler = (deps: Deps) => {
  const {
    bot,
    logger,
    allowedUsers,
    conversationStates,
    getBookById,
    bibliotecaBaseUrl,
    generateFilename,
    sendEmail,
    getEmails,
    searchMeili,
    buildPaginatedMessage,
    buildInlineKeyboard,
    hasEmail,
    getTotalBooksByAuthor,
    searchByAuthors,
    extractUniqueAuthors,
    lazyAddBook,
    lazyQueueBook,
    lazySearchBook,
    lazyForceProcess,
    lazyHeadFileDirect,
    lazyDownloadFileDirect,
    lazyFindBook,
    lazyFindAuthor,
    normalizeLazyHits,
    addLazyJob,
    getLazyJob,
    updateLazyJob,
  } = deps;

  return async (query: { id: string; data: string; message: { chat: { id: string | number }; message_id: number }; from?: { id?: string | number } }) => {
    const chatId = query.message.chat.id;
    const userId = query.from?.id ? String(query.from.id) : '';

    if (allowedUsers.size && !allowedUsers.has(userId)) {
      bot.answerCallbackQuery(query.id, { text: 'No autorizado' });
      return;
    }

    try {
      if (query.data.startsWith('lazy_download_')) {
        const bookId = query.data.replace('lazy_download_', '');
        if (!bookId) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        bot.answerCallbackQuery(query.id, { text: '⏳ Descarga iniciada' });
        bot.sendMessage(chatId, '✅ Descarga iniciada. Te aviso cuando esté lista.\n\nPuedes seguir usando el bot.');

        const jobId = `${userId}:${bookId}`;
        const existingJob = getLazyJob(jobId);
        if (existingJob) {
          bot.answerCallbackQuery(query.id, { text: '⏳ Descarga ya en cola' });
          bot.sendMessage(chatId, '⏳ Ya tengo esa descarga en cola. Te aviso cuando esté lista.');
          return;
        }

        const state = conversationStates.get(chatId) as { state?: string; results?: Record<string, unknown>[] } | undefined;
        const lazyHit = state?.state === 'ENGLISH_MODE'
          ? (state.results || []).find(hit => String((hit as { libid?: string }).libid) === bookId)
          : null;
        const title = lazyHit ? (lazyHit as { title?: string }).title : undefined;
        const authorsValue = lazyHit ? (lazyHit as { authors?: string[] | string }).authors : undefined;
        const author = Array.isArray(authorsValue) ? authorsValue[0] : authorsValue;
        const isbn = lazyHit ? (lazyHit as { isbn?: string }).isbn : undefined;
        let resolvedBookId = bookId;

        if (isbn) {
          try {
            const isbnResults = await lazyFindBook(isbn);
            const match = isbnResults.find(item => {
              const itemIsbn = (item as { bookisbn?: string }).bookisbn;
              return itemIsbn && String(itemIsbn).trim() === isbn;
            });
            if (match && (match as { bookid?: string }).bookid) {
              resolvedBookId = String((match as { bookid?: string }).bookid);
            }
          } catch (err) {
            logger.warn({ err, isbn }, '[LAZY] ISBN lookup failed');
          }
        }

        try {
          const headResponse = await lazyHeadFileDirect(resolvedBookId);
          if (headResponse.ok) {
            const response = await lazyDownloadFileDirect(resolvedBookId);
            const fallback = generateFilename(title, author ? [author] : undefined);
            const { tempPath } = await downloadResponseToTemp(response, fallback);
            await bot.sendDocument(chatId, tempPath, {
              caption: `📥 ${title || 'Libro listo'}${author ? `\n✍️ ${author}` : ''}`,
            });
            bot.answerCallbackQuery(query.id, { text: '✅ Libro enviado' });
            return;
          }
        } catch (err) {
          logger.warn({ err, bookId: resolvedBookId }, '[LAZY] Direct file check failed');
        }

        const addResult = await lazyAddBook(resolvedBookId);
        if (addResult?.Success === false) {
          logger.warn({ bookId: resolvedBookId, error: addResult?.Error }, '[LAZY] addBook failed');
        }

        // Give Lazy a moment to persist the book before queueing
        await new Promise(resolve => setTimeout(resolve, 1500));

        let queueResult = await lazyQueueBook(resolvedBookId);
        if (queueResult?.Success === false) {
          const details = queueResult?.Error?.Message
            || (typeof (queueResult as { Data?: unknown })?.Data === 'string'
              ? (queueResult as { Data?: string }).Data
              : 'desconocido');
          logger.error({ bookId: resolvedBookId, originalBookId: bookId, isbn }, '[LAZY] queueBook failed');
          logger.error({ queueResult }, '[LAZY] queueBook response');

          if (details.toLowerCase().includes('invalid id') && resolvedBookId !== bookId) {
            queueResult = await lazyQueueBook(bookId);
          } else if (details.toLowerCase().includes('invalid id')) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            queueResult = await lazyQueueBook(resolvedBookId);
          }
        }

        if (queueResult?.Success === false) {
          const details = queueResult?.Error?.Message
            || (typeof (queueResult as { Data?: unknown })?.Data === 'string'
              ? (queueResult as { Data?: string }).Data
              : 'desconocido');
          bot.answerCallbackQuery(query.id, { text: '❌ No pude iniciar la descarga' });
          bot.sendMessage(chatId, `❌ Error al poner en cola: ${details}`);
          return;
        }

        const searchResult = await lazySearchBook(resolvedBookId);
        if (searchResult?.Success === false) {
          logger.warn({ bookId: resolvedBookId, error: searchResult?.Error }, '[LAZY] searchBook failed');
        }

        const forceResult = await lazyForceProcess();
        if (forceResult?.Success === false) {
          logger.warn({ error: forceResult?.Error }, '[LAZY] forceProcess failed');
        }

        addLazyJob({
          chatId,
          userId,
          bookId: resolvedBookId,
          title,
          author,
          startedAt: Date.now(),
          lastStatus: 'queued',
        });

        updateLazyJob(jobId, { lastStatus: 'queued' });

        return;
      } else if (query.data.startsWith('lazy_email_')) {
        const bookId = query.data.replace('lazy_email_', '');
        if (!bookId) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const emails = getEmails();
        const userEmail = emails[userId];

        if (!userEmail) {
          bot.answerCallbackQuery(query.id, { text: '❌ No tienes email configurado' });
          bot.sendMessage(chatId, '❌ No tienes un email configurado.\n\nUsa el comando:\n/addMail tu@email.com\n\npara asociar un email a tu cuenta.');
          return;
        }

        const jobId = `${userId}:${bookId}`;
        const existingJob = getLazyJob(jobId);
        if (existingJob) {
          bot.answerCallbackQuery(query.id, { text: '⏳ Envío ya en cola' });
          bot.sendMessage(chatId, '⏳ Ya tengo ese envío por email en cola. Te aviso cuando esté listo.');
          return;
        }

        const state = conversationStates.get(chatId) as { state?: string; results?: Record<string, unknown>[] } | undefined;
        const lazyHit = state?.state === 'ENGLISH_MODE' || state?.state === 'ENGLISH_AUTHOR_MODE'
          ? (state.results || []).find(hit => String((hit as { libid?: string }).libid) === bookId)
          : null;
        const title = lazyHit ? (lazyHit as { title?: string }).title : undefined;
        const authorsValue = lazyHit ? (lazyHit as { authors?: string[] | string }).authors : undefined;
        const author = Array.isArray(authorsValue) ? authorsValue[0] : authorsValue;
        const isbn = lazyHit ? (lazyHit as { isbn?: string }).isbn : undefined;
        let resolvedBookId = bookId;

        if (isbn) {
          try {
            const isbnResults = await lazyFindBook(isbn);
            const match = isbnResults.find(item => {
              const itemIsbn = (item as { bookisbn?: string }).bookisbn;
              return itemIsbn && String(itemIsbn).trim() === isbn;
            });
            if (match && (match as { bookid?: string }).bookid) {
              resolvedBookId = String((match as { bookid?: string }).bookid);
            }
          } catch (err) {
            logger.warn({ err, isbn }, '[LAZY] ISBN lookup failed');
          }
        }

        bot.answerCallbackQuery(query.id, { text: '📧 Envío por email iniciado' });
        bot.sendMessage(chatId, `📧 Envío por email iniciado.\n\nEl libro se enviará a:\n${userEmail}\n\nTe aviso cuando esté listo.\n\nPuedes seguir usando el bot.`);

        try {
          const headResponse = await lazyHeadFileDirect(resolvedBookId);
          if (headResponse.ok) {
            const response = await lazyDownloadFileDirect(resolvedBookId);
            const fallback = generateFilename(title, author ? [author] : undefined);
            const { tempPath, filename } = await downloadResponseToTemp(response, fallback);
            const epubBuffer = fs.readFileSync(tempPath);
            const book = {
              title: title || fallback,
              authors: author ? [author] : undefined,
            };

            await sendEmail(userEmail, book, epubBuffer, filename);

            try {
              fs.unlinkSync(tempPath);
            } catch (unlinkErr) {
              logger.warn({ err: unlinkErr, tempPath }, '[LAZY] Failed to cleanup temp file after email send');
            }

            bot.answerCallbackQuery(query.id, { text: '✅ Libro enviado por email' });
            bot.sendMessage(chatId, `✅ Libro enviado a:\n\n📧 ${userEmail}\n\n📚 ${title || 'Libro'}`);
            return;
          }
        } catch (err) {
          logger.warn({ err, bookId: resolvedBookId }, '[LAZY] Direct file check failed');
        }

        const addResult = await lazyAddBook(resolvedBookId);
        if (addResult?.Success === false) {
          logger.warn({ bookId: resolvedBookId, error: addResult?.Error }, '[LAZY] addBook failed');
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        let queueResult = await lazyQueueBook(resolvedBookId);
        if (queueResult?.Success === false) {
          const details = queueResult?.Error?.Message
            || (typeof (queueResult as { Data?: unknown })?.Data === 'string'
              ? (queueResult as { Data?: string }).Data
              : 'desconocido');
          logger.error({ bookId: resolvedBookId, originalBookId: bookId, isbn }, '[LAZY] queueBook failed');
          logger.error({ queueResult }, '[LAZY] queueBook response');

          if (details.toLowerCase().includes('invalid id') && resolvedBookId !== bookId) {
            queueResult = await lazyQueueBook(bookId);
          } else if (details.toLowerCase().includes('invalid id')) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            queueResult = await lazyQueueBook(resolvedBookId);
          }
        }

        if (queueResult?.Success === false) {
          const details = queueResult?.Error?.Message
            || (typeof (queueResult as { Data?: unknown })?.Data === 'string'
              ? (queueResult as { Data?: string }).Data
              : 'desconocido');
          bot.answerCallbackQuery(query.id, { text: '❌ No pude iniciar el envío' });
          bot.sendMessage(chatId, `❌ Error al poner en cola: ${details}`);
          return;
        }

        const searchResult = await lazySearchBook(resolvedBookId);
        if (searchResult?.Success === false) {
          logger.warn({ bookId: resolvedBookId, error: searchResult?.Error }, '[LAZY] searchBook failed');
        }

        const forceResult = await lazyForceProcess();
        if (forceResult?.Success === false) {
          logger.warn({ error: forceResult?.Error }, '[LAZY] forceProcess failed');
        }

        addLazyJob({
          chatId,
          userId,
          bookId: resolvedBookId,
          title,
          author,
          startedAt: Date.now(),
          lastStatus: 'queued',
          deliveryMethod: 'email',
          userEmail,
        });

        updateLazyJob(jobId, { lastStatus: 'queued', deliveryMethod: 'email', userEmail });

        return;
      } else if (query.data.startsWith('download_')) {
        const libid = query.data.replace('download_', '');
        const book = await getBookById(libid);

        if (!book || !book.filename) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        if (conversationStates.has(chatId)) {
          const state = conversationStates.get(chatId) as { state?: string; displayName?: string; query?: string };
          if (state.state === 'AUTHOR_MODE') {
            const displayName = state.displayName;

            logger.info({ chatId, author: displayName, book: (book as { title?: string }).title }, '[DOWNLOAD] Auto-exit author mode');

            conversationStates.delete(chatId);

            bot.answerCallbackQuery(query.id, { text: '📥 Descargando...' });

            setTimeout(() => {
              bot.sendMessage(chatId,
                '✅ Descarga iniciada\n\n' +
                '👤 Modo autor desactivado\n\n' +
                `Ya no estás buscando solo libros de ${displayName}.\n\n` +
                'Envía cualquier título para buscar en toda la biblioteca.'
              ).catch(err => {
                logger.error({ err, chatId }, '[DOWNLOAD] Error sending auto-exit message');
              });
            }, 1000);
          } else if (state.state === 'PAGINATION_MODE') {
            const queryStr = state.query as string;

            logger.info({ chatId, query: queryStr }, '[PAGINATION] Auto-exit pagination mode');

            conversationStates.delete(chatId);

            bot.answerCallbackQuery(query.id, { text: '📥 Descargando...' });

            setTimeout(() => {
              bot.sendMessage(chatId,
                '✅ Descarga iniciada\n\n' +
                '📚 Modo paginación desactivado\n\n' +
                `Ya no estás navegando los resultados de "${queryStr}".\n\n` +
                'Envía cualquier título para buscar en toda la biblioteca.'
              ).catch(err => {
                logger.error({ err, chatId }, '[PAGINATION] Error sending auto-exit message');
              });
            }, 1000);
          }
        }

        const downloadUrl = `${bibliotecaBaseUrl}/biblioteca/${(book as { filename: string }).filename}`;

        logger.info({ libid, filename: (book as { filename: string }).filename, title: (book as { title?: string }).title, authors: (book as { authors?: string[] | string }).authors }, 'Sending EPUB from NAS...');

        try {
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filename = generateFilename((book as { title?: string }).title, (book as { authors?: string[] | string }).authors);

          if (!fs.existsSync('/tmp')) {
            fs.mkdirSync('/tmp');
          }

          const tempPath = `/tmp/${filename}`;
          fs.writeFileSync(tempPath, buffer);

          logger.info({ libid, filename }, 'Archivo temporal guardado');

          const authorsValue = (book as { authors?: string[] | string }).authors;
          const authors = Array.isArray(authorsValue) ? authorsValue.join(', ') : authorsValue || 'Desconocido';

          await bot.sendDocument(chatId, tempPath, {
            caption: `📥 ${(book as { title?: string }).title}\n✍️ ${authors}`,
          });

          bot.answerCallbackQuery(query.id, { text: '✅ Archivo temporal enviado' });
        } catch (fetchError) {
          logger.error({ err: fetchError, url: downloadUrl }, 'Error downloading or saving EPUB');
          bot.sendMessage(chatId, `❌ Error al descargar o guardar archivo temporal: ${(fetchError as Error).message}`);
          bot.answerCallbackQuery(query.id, { text: '❌ Error al descargar o guardar' });
        }
      } else if (query.data.startsWith('info_')) {
        const libid = query.data.replace('info_', '');
        const book = await getBookById(libid);

        if (!book) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const authorsValue = (book as { authors?: string[] | string }).authors;
        const labelsValue = (book as { labels?: string[] | string }).labels;
        const authors = Array.isArray(authorsValue) ? authorsValue.join(', ') : authorsValue || 'Desconocido';
        const labels = Array.isArray(labelsValue) ? labelsValue.join(', ') : labelsValue || 'N/A';
        const downloadUrl = `${bibliotecaBaseUrl}/biblioteca/${(book as { filename?: string }).filename}`;

        const infoText = '📖 Detalles del libro\n\n' +
          `📚 Título: ${(book as { title?: string }).title}\n` +
          `✍️ Autor(es): ${authors}\n` +
          `📅 Año: ${(book as { published?: string | number }).published || 'N/A'}\n` +
          `📄 Páginas: ${(book as { pagecount?: string | number }).pagecount || 'N/A'}\n` +
          `💾 Tamaño: ${(book as { size?: number }).size ? `${(((book as { size?: number }).size || 0) / 1024 / 1024).toFixed(2)} MB` : 'N/A'}\n` +
          `🏷️ Etiquetas: ${labels}\n\n` +
          `📥 ${downloadUrl}`;

        await bot.sendMessage(chatId, infoText, {
          disable_web_page_preview: true
        });
        bot.answerCallbackQuery(query.id, { text: 'ℹ️ Detalles mostrados' });
      } else if (query.data.startsWith('email_')) {
        const libid = query.data.replace('email_', '');
        const book = await getBookById(libid);

        if (!book || !(book as { filename?: string }).filename) {
          bot.answerCallbackQuery(query.id, { text: 'Libro no encontrado' });
          return;
        }

        const emails = getEmails();
        const userEmail = emails[userId];

        if (!userEmail) {
          bot.answerCallbackQuery(query.id, { text: '❌ No tienes email configurado' });
          bot.sendMessage(chatId, '❌ No tienes un email configurado.\n\nUsa el comando:\n/addMail tu@email.com\n\npara asociar un email a tu cuenta.');
          return;
        }

        try {
          bot.answerCallbackQuery(query.id, { text: '📧 Preparando envío por email...' });

          const downloadUrl = `${bibliotecaBaseUrl}/biblioteca/${(book as { filename: string }).filename}`;
          logger.info({ libid, filename: (book as { filename: string }).filename, userEmail }, 'Downloading EPUB for email...');

          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const epubBuffer = Buffer.from(arrayBuffer);
          const filename = generateFilename((book as { title?: string }).title, (book as { authors?: string[] | string }).authors);

          await sendEmail(userEmail, book, epubBuffer, filename);

          bot.sendMessage(chatId, `✅ Libro enviado a:\n\n📧 ${userEmail}\n\n📚 ${(book as { title?: string }).title}`);
        } catch (emailError) {
          logger.error({ err: emailError, userId, libid }, 'Error sending email');
          bot.sendMessage(chatId, `❌ Error al enviar por email: ${(emailError as Error).message}`);
        }
      } else if (query.data.startsWith('activate_author_')) {
        const authorName = query.data.replace('activate_author_', '');

        logger.info({ chatId, authorName }, '[CALLBACK] Activate author requested');

        if (!authorName) {
          bot.answerCallbackQuery(query.id, { text: 'Autor no encontrado' });
          return;
        }

        const actualBookCount = await getTotalBooksByAuthor(authorName);

        conversationStates.set(chatId, {
          state: 'AUTHOR_MODE',
          author: authorName,
          displayName: authorName,
          timestamp: Date.now()
        });

        bot.answerCallbackQuery(query.id, { text: `✅ ${authorName}` });

        bot.sendMessage(chatId,
          '✅ Modo autor activado\n\n' +
          `👤 Autor: ${authorName}\n\n` +
          `📚 Tiene ${actualBookCount} libro${actualBookCount > 1 ? 's' : ''} en la biblioteca.\n\n` +
          'Ahora las búsquedas se filtrarán solo por este autor.\n\n' +
          `Envía un título o parte del título para buscar libros de ${authorName}.\n\n` +
          '⏰ Este modo expira en 5 minutos de inactividad.\n\n' +
          'Comandos disponibles:\n' +
          '/exit - Salir del modo autor\n' +
          '/author - Cambiar autor',
          {
            reply_markup: {
              inline_keyboard: [[{
                text: '📚 Navegar libros de este autor',
                callback_data: `browse_author_${authorName}`
              }]]
            }
          }
        );

        logger.info({
          chatId,
          author: authorName
        }, '[CALLBACK] Author mode activated from suggestion');
        return;
      } else if (query.data.startsWith('browse_author_')) {
        const authorName = query.data.replace('browse_author_', '');

        logger.info({ chatId, authorName }, '[CALLBACK] Browse author requested');

        if (!authorName) {
          bot.answerCallbackQuery(query.id, { text: 'Autor no encontrado' });
          return;
        }

        bot.answerCallbackQuery(query.id, { text: '📚 Navegando libros...' });

        const searchResult = await searchMeili('', 5, { author: authorName });
        const results = searchResult.hits;
        const totalCount = searchResult.totalHits;

        if (results.length === 0) {
          bot.sendMessage(chatId,
            `❌ No encontré libros del autor "${authorName}" en la biblioteca.\n\n` +
            'Intenta con otro autor o verifica el nombre.'
          );

          logger.info({ chatId, author: authorName }, '[CALLBACK] No books found for author');
          return;
        }

        conversationStates.set(chatId, {
          state: 'PAGINATION_MODE',
          query: authorName,
          searchQuery: '',
          filters: { author: authorName },
          searchIn: ['title'],
          useExactPhrase: false,
          currentPage: 0,
          totalResults: totalCount,
          resultsPerPage: 5,
          searchType: 'AUTHOR_BROWSE',
          displayName: authorName,
          timestamp: Date.now()
        });

        const messageText = buildPaginatedMessage('', results, 0, totalCount, 'AUTHOR_BROWSE', authorName);

        try {
          await bot.sendMessage(chatId, messageText, {
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(results, userId, 0, totalCount, hasEmail(userId))
          });
        } catch (err) {
          logger.error({ chatId, err }, '[SEND] Error sending message in author browse mode');
          bot.sendMessage(chatId, `❌ Error al mostrar libros de ${authorName}.`);
          return;
        }

        logger.info({ chatId, author: authorName, totalResults: totalCount }, '[CALLBACK] Author browse mode activated');
        return;
      } else if (query.data.startsWith('select_author_')) {
        const authorName = query.data.replace('select_author_', '');

        const authorResults = await searchByAuthors(authorName, 5);
        const uniqueAuthors = extractUniqueAuthors(authorResults);
        const selectedAuthor = uniqueAuthors.find(a => a.name === authorName);

        if (!selectedAuthor) {
          bot.answerCallbackQuery(query.id, { text: 'Autor no encontrado' });
          return;
        }

        const actualBookCount = await getTotalBooksByAuthor(authorName);
        selectedAuthor.bookCount = actualBookCount;

        conversationStates.set(chatId, {
          state: 'AUTHOR_MODE',
          author: selectedAuthor.name,
          displayName: selectedAuthor.displayName,
          timestamp: Date.now()
        });

        bot.answerCallbackQuery(query.id, { text: `✅ ${selectedAuthor.displayName}` });

        bot.sendMessage(chatId,
          '✅ Modo autor activado\n\n' +
          `👤 Autor: ${selectedAuthor.displayName}\n\n` +
          `📚 Tiene ${selectedAuthor.bookCount} libro${selectedAuthor.bookCount > 1 ? 's' : ''} en la biblioteca.\n\n` +
          'Ahora las búsquedas se filtrarán solo por este autor.\n\n' +
          `Envía un título o parte del título para buscar libros de ${selectedAuthor.displayName}.\n\n` +
          '⏰ Este modo expira en 5 minutos de inactividad.\n\n' +
          'Comandos disponibles:\n' +
          '/exit - Salir del modo autor\n' +
          '/author - Cambiar autor'
        );

        logger.info({ chatId, author: selectedAuthor.name, displayName: selectedAuthor.displayName }, '[CALLBACK] Author selected');
        return;
      } else if (query.data === 'cancel_author_selection') {
        bot.answerCallbackQuery(query.id, { text: '❌ Cancelado' });
        bot.sendMessage(chatId, 'ℹ️ Selección de autor cancelada.\n\nUsa /author <nombre> para buscar otro autor.');
        return;
      } else if (query.data.startsWith('activate_english_author_')) {
        const authorName = query.data.replace('activate_english_author_', '');

        if (!authorName) {
          bot.answerCallbackQuery(query.id, { text: 'Autor no encontrado' });
          return;
        }

        bot.answerCallbackQuery(query.id, { text: `✅ ${authorName}` });

        let rawResults: Record<string, unknown>[] = [];
        try {
          rawResults = await lazyFindAuthor(authorName);
        } catch (err) {
          bot.sendMessage(chatId, '❌ LazyLibrarian no está configurado o no responde.');
          logger.error({ err, chatId }, '[ENGLISH_AUTHOR] Lazy author search failed');
          return;
        }

        const results = normalizeLazyHits(rawResults);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ No encontré libros del autor "${authorName}".`);
          return;
        }

        conversationStates.set(chatId, {
          state: 'ENGLISH_AUTHOR_MODE',
          author: authorName,
          displayName: authorName,
          query: '',
          results,
          currentPage: 0,
          totalResults: results.length,
          resultsPerPage: 5,
          searchType: 'ENGLISH_AUTHOR',
          timestamp: Date.now()
        });

        const pageResults = results.slice(0, 5);
        const messageText = buildPaginatedMessage('', pageResults, 0, results.length, 'ENGLISH_AUTHOR', authorName);

        await bot.sendMessage(chatId, messageText, {
          disable_web_page_preview: true,
          reply_markup: buildInlineKeyboard(pageResults, userId, 0, results.length, hasEmail(userId))
        });

        logger.info({ chatId, author: authorName }, '[CALLBACK] English author mode activated');
        return;
      } else if (query.data === 'page_prev') {
        if (!conversationStates.has(chatId)) {
          bot.answerCallbackQuery(query.id, { text: '❌ No hay búsqueda activa' });
          return;
        }

        const state = conversationStates.get(chatId) as { state?: string; currentPage?: number; query?: string; totalResults?: number; searchQuery?: string; filters?: { author: string } | null; searchIn?: string[]; useExactPhrase?: boolean; displayName?: string; searchType?: string; results?: Record<string, unknown>[] };
        if (state.state !== 'PAGINATION_MODE' && state.state !== 'ENGLISH_MODE' && state.state !== 'ENGLISH_AUTHOR_MODE') {
          bot.answerCallbackQuery(query.id, { text: '❌ No estás en modo paginación' });
          return;
        }

        if ((state.currentPage || 0) === 0) {
          bot.answerCallbackQuery(query.id, { text: '❌ Ya estás en la primera página' });
          return;
        }

        const newPage = (state.currentPage || 0) - 1;
        const offset = newPage * 5;

        state.currentPage = newPage;
        (state as { timestamp?: number }).timestamp = Date.now();

        let results: Record<string, unknown>[] = [];
        if (state.state === 'ENGLISH_MODE' || state.state === 'ENGLISH_AUTHOR_MODE') {
          const all = state.results || [];
          results = all.slice(offset, offset + 5);
        } else {
          const searchResult = await searchMeili(
            state.searchQuery !== undefined ? state.searchQuery : (state.query as string),
            5,
            state.filters || null,
            offset,
            state.searchIn || ['title'],
            state.useExactPhrase || false
          );
          results = searchResult.hits;
        }

        bot.editMessageText(
          buildPaginatedMessage(state.query as string, results, newPage, state.totalResults || 0, state.searchType || '', state.displayName || null),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(results, userId, newPage, state.totalResults || 0, hasEmail(userId))
          }
        ).catch(err => {
          logger.error({ err, chatId }, '[PAGINATION] Error editing message');
        });

        bot.answerCallbackQuery(query.id, { text: `⬅️ Página ${newPage + 1}` });

        logger.info({ chatId, query: state.query, page: newPage }, '[PAGINATION] Previous page');
        return;
      } else if (query.data === 'page_next') {
        if (!conversationStates.has(chatId)) {
          bot.answerCallbackQuery(query.id, { text: '❌ No hay búsqueda activa' });
          return;
        }

        const state = conversationStates.get(chatId) as { state?: string; currentPage?: number; query?: string; totalResults?: number; searchQuery?: string; filters?: { author: string } | null; searchIn?: string[]; useExactPhrase?: boolean; displayName?: string; searchType?: string; results?: Record<string, unknown>[] };
        if (state.state !== 'PAGINATION_MODE' && state.state !== 'ENGLISH_MODE' && state.state !== 'ENGLISH_AUTHOR_MODE') {
          bot.answerCallbackQuery(query.id, { text: '❌ No estás en modo paginación' });
          return;
        }

        const totalPages = Math.ceil((state.totalResults || 0) / 5);
        if ((state.currentPage || 0) >= totalPages - 1) {
          bot.answerCallbackQuery(query.id, { text: '❌ Ya estás en la última página' });
          return;
        }

        const newPage = (state.currentPage || 0) + 1;
        const offset = newPage * 5;

        state.currentPage = newPage;
        (state as { timestamp?: number }).timestamp = Date.now();

        let results: Record<string, unknown>[] = [];
        if (state.state === 'ENGLISH_MODE' || state.state === 'ENGLISH_AUTHOR_MODE') {
          const all = state.results || [];
          results = all.slice(offset, offset + 5);
        } else {
          const searchResult = await searchMeili(
            state.searchQuery !== undefined ? state.searchQuery : (state.query as string),
            5,
            state.filters || null,
            offset,
            state.searchIn || ['title'],
            state.useExactPhrase || false
          );
          results = searchResult.hits;
        }

        bot.editMessageText(
          buildPaginatedMessage(state.query as string, results, newPage, state.totalResults || 0, state.searchType || '', state.displayName || null),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(results, userId, newPage, state.totalResults || 0, hasEmail(userId))
          }
        ).catch(err => {
          logger.error({ err, chatId }, '[PAGINATION] Error editing message');
        });

        bot.answerCallbackQuery(query.id, { text: `➡️ Página ${newPage + 1}` });

        logger.info({ chatId, query: state.query, page: newPage }, '[PAGINATION] Next page');
        return;
      }
    } catch (err) {
      logger.error({ chatId, err }, 'Error processing callback query');
      bot.answerCallbackQuery(query.id, { text: 'Error al procesar' });
    }
  };
};

export { createCallbackHandler };
