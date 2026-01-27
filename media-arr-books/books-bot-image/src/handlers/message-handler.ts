type Deps = {
  bot: {
    sendMessage: (chatId: string | number, text: string, options?: Record<string, unknown>) => Promise<unknown> | void;
  };
  logger: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void; };
  allowedUsers: Set<string>;
  whitelistConfig: { whitelist: string[]; admin: string | undefined };
  isAdmin: (userId: string, config: { admin: string | undefined }) => boolean;
  persistWhitelist: () => void;
  getEmails: () => Record<string, string>;
  persistEmails: (emails: Record<string, string>) => void;
  isValidEmail: (email: string) => boolean;
  hasEmail: (userId: string) => boolean;
  conversationStates: Map<string | number, Record<string, unknown>>;
  searchByAuthors: (query: string, limit?: number) => Promise<Record<string, unknown>[]>;
  extractUniqueAuthors: (results: Record<string, unknown>[]) => { name: string; displayName: string; bookCount: number }[];
  buildInlineKeyboard: (results: Record<string, unknown>[], userId: string, currentPage?: number, totalResults?: number, hasEmail?: boolean) => Record<string, unknown>;
  buildPaginatedMessage: (query: string, results: Record<string, unknown>[], currentPage: number, totalResults: number, searchType: string, displayName?: string | null) => string;
  formatResult: (hit: Record<string, unknown>) => string;
  searchMeili: (query: string, limit?: number, filters?: { author: string } | null, offset?: number, searchIn?: string[], useExactPhrase?: boolean) => Promise<{ hits: Record<string, unknown>[]; totalHits: number }>;
  searchWithStrategies: (query: string, limit?: number) => Promise<{ hits: Record<string, unknown>[]; totalHits: number; strategy: string; strategyDesc: string; queryUsed?: string; filtersUsed?: { author: string } | null; searchIn?: string[]; useExactPhrase?: boolean }>;
  searchAuthorFacets: (query: string) => Promise<Record<string, number>>;
  extractAuthorsFromFacets: (facetMap: Record<string, number>, query: string, limit?: number) => { name: string; displayName: string; bookCount: number }[];
  sendAuthorCtaAfterTitleResults: (bot: Deps['bot'], chatId: string | number, uniqueAuthors: { name: string; displayName: string; bookCount: number }[]) => Promise<void>;
  handleAuthorSuggestion: (bot: Deps['bot'], chatId: string | number, userId: string, originalQuery: string, uniqueAuthors: { name: string; displayName: string; bookCount: number }[]) => Promise<void>;
  clearConversationState: (chatId: string | number, logger: Deps['logger']) => void;
  lazyFindBook: (query: string) => Promise<Record<string, unknown>[]>;
  lazyFindAuthor: (query: string) => Promise<Record<string, unknown>[]>;
  normalizeLazyHits: (items: Record<string, unknown>[]) => Record<string, unknown>[];
  listLazyJobsByUser: (userId: string) => { bookId: string; title?: string; author?: string; startedAt: number; lastStatus?: string }[];
  listLazyJobs: () => { jobId: string; userId: string; bookId: string; title?: string; author?: string; startedAt: number; lastStatus?: string }[];
  removeLazyJob: (jobId: string) => void;
};

const createMessageHandler = (deps: Deps) => {
  const {
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
    searchByAuthors,
    extractUniqueAuthors,
    buildInlineKeyboard,
    buildPaginatedMessage,
    formatResult,
    searchMeili,
    searchWithStrategies,
    searchAuthorFacets,
    extractAuthorsFromFacets,
    sendAuthorCtaAfterTitleResults,
    handleAuthorSuggestion,
    clearConversationState,
    lazyFindBook,
    lazyFindAuthor,
    normalizeLazyHits,
    listLazyJobsByUser,
    listLazyJobs,
    removeLazyJob,
  } = deps;

  return async (msg: { chat: { id: string | number }; from?: { id?: string | number }; text?: string }) => {
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
        bot.sendMessage(chatId, '📚 ¡Hola! Soy el buscador de la Biblioteca Secreta.\n\nEnvía el título de un libro y buscaré en la biblioteca local de 152,080 EPUBs.\n\nComandos disponibles:\n/author <nombre> - Buscar solo libros de un autor\n/exit - Salir del modo autor o paginación\n/addMail <email> - Asocia un email para recibir libros por correo\n/changeMail <email> - Actualiza tu email configurado\n/myId - Muestra tu ID de Telegram\n/help - Muestra este mensaje de ayuda\n\n📝 Cuando hay más de 5 resultados, se activa modo paginación para navegar fácilmente.');
      } else if (text === '/help') {
        let helpMessage = '📚 Biblioteca Secreta Bot\n\n';
        helpMessage += '• Envía el título de un libro para buscar\n';
        helpMessage += '• Usa los botones para descargar o ver más info\n';
        helpMessage += '• Si hay más de 5 resultados, se activa paginación\n';
        helpMessage += '• Los EPUBs se envían como archivos (funciona desde cualquier red)\n\n';
        helpMessage += 'Comandos disponibles:\n';
        helpMessage += '/start - Inicia el bot\n';
        helpMessage += '/help - Muestra este mensaje de ayuda\n';
        helpMessage += '/author <nombre> - Buscar solo libros de un autor específico\n';
        helpMessage += '/exit - Salir del modo autor o paginación\n';
        helpMessage += '/addMail <email> - Asocia un email a tu cuenta\n';
        helpMessage += '/changeMail <email> - Actualiza tu email configurado\n';
        helpMessage += '/myId - Muestra tu ID de Telegram\n';

        if (isAdmin(userId, whitelistConfig)) {
          helpMessage += '\nComandos de administración:\n';
          helpMessage += '/addUser <id> - Agrega un usuario a la whitelist\n';
          helpMessage += '/removeUser <id> - Elimina un usuario de la whitelist\n';
          helpMessage += '/listUsers - Lista todos los usuarios autorizados\n';
          helpMessage += '/queue - Lista descargas en cola (Lazy)\n';
          helpMessage += '/cancel <jobId> - Cancela una descarga en cola\n';
        }

        bot.sendMessage(chatId, helpMessage);
      } else if (text === '/myId') {
        bot.sendMessage(chatId, `👤 Tu ID de Telegram: ${userId}`);
      } else if (text === '/english') {
        conversationStates.set(chatId, {
          state: 'ENGLISH_MODE',
          currentPage: 0,
          totalResults: 0,
          resultsPerPage: 5,
          timestamp: Date.now()
        });

        bot.sendMessage(chatId,
          '🇬🇧 Modo inglés activado\n\n' +
          'Las búsquedas se harán en LazyLibrarian.\n\n' +
          'Envía un título en inglés para buscar.\n\n' +
          '⏰ Este modo expira en 5 minutos de inactividad.\n\n' +
          'Comandos disponibles:\n' +
          '/exit - Salir del modo inglés\n' +
          '/status - Ver descargas pendientes'
        );
        return;
      } else if (text === '/status') {
        const jobs = listLazyJobsByUser(userId);
        if (jobs.length === 0) {
          bot.sendMessage(chatId, 'ℹ️ No hay descargas en curso.');
          return;
        }

        const lines = jobs.map((job, index) => {
          const elapsed = Math.round((Date.now() - job.startedAt) / 1000 / 60);
          const title = job.title || `Libro ${job.bookId}`;
          const author = job.author ? ` - ${job.author}` : '';
          const status = job.lastStatus ? ` (${job.lastStatus})` : '';
          return `${index + 1}. ${title}${author}${status} · ${elapsed}m`;
        });

        bot.sendMessage(chatId, `⏳ Descargas en curso:\n\n${lines.join('\n')}`);
        return;
      } else if (text === '/queue') {
        if (!isAdmin(userId, whitelistConfig)) {
          bot.sendMessage(chatId, '❌ Solo el administrador puede usar este comando.');
          return;
        }

        const jobs = listLazyJobs();
        if (jobs.length === 0) {
          bot.sendMessage(chatId, 'ℹ️ No hay descargas en cola.');
          return;
        }

        const lines = jobs.map((job, index) => {
          const elapsed = Math.round((Date.now() - job.startedAt) / 1000 / 60);
          const title = job.title || `Libro ${job.bookId}`;
          const author = job.author ? ` - ${job.author}` : '';
          const status = job.lastStatus ? ` (${job.lastStatus})` : '';
          return `${index + 1}. ${title}${author}${status} · ${elapsed}m · ${job.jobId}`;
        });

        bot.sendMessage(chatId, `📋 Descargas en cola (todas):\n\n${lines.join('\n')}\n\nUsa /cancel <jobId> para cancelar.`);
        return;
      } else if (text.startsWith('/cancel')) {
        if (!isAdmin(userId, whitelistConfig)) {
          bot.sendMessage(chatId, '❌ Solo el administrador puede usar este comando.');
          return;
        }

        const target = text.replace('/cancel', '').trim();
        if (!target) {
          bot.sendMessage(chatId, '❌ Uso: /cancel <jobId>');
          return;
        }

        removeLazyJob(target);
        bot.sendMessage(chatId, `✅ Job cancelado: ${target}`);
        return;
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
        persistWhitelist();
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
        persistWhitelist();
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

        const emails = getEmails();
        emails[userId] = email;
        persistEmails(emails);

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

        const emails = getEmails();

        if (!emails[userId]) {
          bot.sendMessage(chatId, '❌ No tienes un email configurado.\n\nUsa el comando:\n/addMail tu@email.com\n\npara asociar un email a tu cuenta primero.');
          return;
        }

        const oldEmail = emails[userId];
        emails[userId] = newEmail;
        persistEmails(emails);

        bot.sendMessage(chatId, `✅ Email actualizado correctamente:\n\n📧 Anterior: ${oldEmail}\n📧 Nuevo: ${newEmail}`);
      } else if (text.startsWith('/author ')) {
        const authorName = text.replace('/author ', '').trim();

        if (!authorName) {
          bot.sendMessage(chatId, '❌ Por favor incluye el nombre del autor.\n\nUso: /author Isaac Asimov');
          return;
        }

        logger.info({ chatId, authorName }, '[AUTHOR] Author search started');

        const authorResults = await searchByAuthors(authorName, 10);

        if (authorResults.length === 0) {
          bot.sendMessage(chatId, `❌ No encontré autores con nombre "${authorName}".\n\nIntenta con otro nombre o busca directamente el título del libro.`);
          return;
        }

        const uniqueAuthors = extractUniqueAuthors(authorResults);

        if (uniqueAuthors.length > 5) {
          let messageText = `🔍 Encontré más de 5 autores que coinciden con "${authorName}".\n\n`;
          messageText += 'Por favor refina tu búsqueda:\n';
          messageText += `• "${authorName} [apellido]"\n`;
          messageText += `• "${authorName} [nombre completo]"\n\n`;
          messageText += 'O usa el título del libro para buscar directamente.';

          bot.sendMessage(chatId, messageText);
          return;
        }

        if (uniqueAuthors.length === 1) {
          const author = uniqueAuthors[0];

          conversationStates.set(chatId, {
            state: 'AUTHOR_MODE',
            author: author.name,
            displayName: author.displayName,
            timestamp: Date.now()
          });

          bot.sendMessage(chatId,
            `✅ Modo autor activado\n\n` +
            `👤 Autor: ${author.displayName}\n\n` +
            `📚 Tiene ${author.bookCount} libro${author.bookCount > 1 ? 's' : ''} en la biblioteca.\n\n` +
            'Ahora las búsquedas se filtrarán solo por este autor.\n\n' +
            `Envía un título o parte del título para buscar libros de ${author.displayName}.\n\n` +
            '⏰ Este modo expira en 5 minutos de inactividad.\n\n' +
            'Comandos disponibles:\n' +
            '/exit - Salir del modo autor\n' +
            '/author - Cambiar autor',
            {
              reply_markup: {
                inline_keyboard: [[{
                  text: '📚 Navegar libros de este autor',
                  callback_data: `browse_author_${author.name}`
                }]]
              }
            }
          );

          logger.info({ chatId, author: author.name, displayName: author.displayName, bookCount: author.bookCount }, '[AUTHOR] Author mode activated (single result)');
          return;
        }

        let messageText = `👤 Encontré ${uniqueAuthors.length} autores que coinciden con "${authorName}":\n\n`;

        uniqueAuthors.forEach((author, index) => {
          messageText += `${index + 1}. ${author.displayName} (${author.bookCount} libro${author.bookCount > 1 ? 's' : ''})\n`;
        });

        messageText += '\nElige el número del autor que quieres usar:';

        const authorKeyboard = uniqueAuthors.map((author, index) => {
          return [{
            text: `${index + 1}. ${author.displayName.substring(0, 30)} (${author.bookCount})`,
            callback_data: `select_author_${author.name}`
          }];
        });

        authorKeyboard.push([{
          text: '❌ Cancelar',
          callback_data: 'cancel_author_selection'
        }]);

        await bot.sendMessage(chatId, messageText, {
          reply_markup: { inline_keyboard: authorKeyboard }
        });

        logger.info({ chatId, authors: uniqueAuthors.length }, '[AUTHOR] Author selection menu sent');
        return;
      } else if (text === '/exit') {
        if (conversationStates.has(chatId)) {
          const state = conversationStates.get(chatId) as { state?: string; displayName?: string; timestamp?: number; query?: string; currentPage?: number; totalResults?: number };
          if (state.state === 'AUTHOR_MODE') {
            const displayName = state.displayName;
            const age = Math.round((Date.now() - (state.timestamp || Date.now())) / 1000);

            conversationStates.delete(chatId);

            bot.sendMessage(chatId,
              '✅ Modo autor desactivado\n\n' +
              `Ya no estás buscando solo libros de ${displayName}.\n\n` +
              `Duración: ${age}s\n\n` +
              'Envía cualquier título para buscar en toda la biblioteca.'
            );

            logger.info({ chatId, author: displayName, age }, '[EXIT] Author mode deactivated');
            return;
          } else if (state.state === 'PAGINATION_MODE') {
            const query = state.query as string;
            const age = Math.round((Date.now() - (state.timestamp || Date.now())) / 1000);
            const totalPages = Math.ceil((state.totalResults || 0) / 5);

            conversationStates.delete(chatId);

            bot.sendMessage(chatId,
              '✅ Modo paginación desactivado\n\n' +
              `Ya no estás navegando los resultados de "${query}".\n\n` +
              `Páginas visitadas: ${(state.currentPage || 0) + 1}/${totalPages}\n` +
              `Duración: ${age}s\n\n` +
              'Envía cualquier título para buscar en toda la biblioteca.'
            );

            logger.info({ chatId, query, currentPage: state.currentPage, age }, '[EXIT] Pagination mode deactivated');
            return;
          } else if (state.state === 'ENGLISH_MODE' || state.state === 'ENGLISH_AUTHOR_MODE') {
            const age = Math.round((Date.now() - (state.timestamp || Date.now())) / 1000);
            conversationStates.delete(chatId);
            bot.sendMessage(chatId,
              '✅ Modo inglés desactivado\n\n' +
              `Duración: ${age}s\n\n` +
              'Envía cualquier título para buscar en toda la biblioteca.'
            );
            logger.info({ chatId, age }, '[EXIT] English mode deactivated');
            return;
          }
        }

        bot.sendMessage(chatId, 'ℹ️ No estás en modo autor ni en modo paginación.\n\nUsa /author <nombre> para activar modo autor.');
        return;
      } else {
        bot.sendMessage(chatId, 'Comando no reconocido. Envía un texto para buscar libros.');
      }
      return;
    }

    if (conversationStates.has(chatId)) {
      const state = conversationStates.get(chatId) as { state?: string; timestamp?: number; author?: string; displayName?: string; query?: string; currentPage?: number; totalResults?: number };

      if (state.state === 'ENGLISH_MODE') {
        const age = Date.now() - (state.timestamp || Date.now());
        const TIMEOUT_MS = 5 * 60 * 1000;

        if (age > TIMEOUT_MS) {
          logger.info({ chatId, age: Math.round(age / 1000) + 's' }, '[ENGLISH] Timeout expired before search');
          conversationStates.delete(chatId);
          bot.sendMessage(chatId,
            '⏰ Modo inglés expirado\n\n' +
            `Búsqueda normal: "${text}"\n\n` +
            'Envía /english para volver al modo inglés.'
          );
        } else {
          let resultsRaw: Record<string, unknown>[];
          try {
            resultsRaw = await lazyFindBook(text);
          } catch (err) {
            bot.sendMessage(chatId, '❌ LazyLibrarian no está configurado o no responde.');
            logger.error({ err, chatId }, '[ENGLISH] Lazy search failed');
            return;
          }

          const results = normalizeLazyHits(resultsRaw);
          const totalCount = results.length;

          if (totalCount === 0) {
            bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}" en Lazy.`);
            return;
          }

          if (totalCount > 5) {
            conversationStates.set(chatId, {
              state: 'ENGLISH_MODE',
              query: text,
              results,
              currentPage: 0,
              totalResults: totalCount,
              resultsPerPage: 5,
              searchType: 'ENGLISH',
              timestamp: Date.now()
            });

            const pageResults = results.slice(0, 5);
            const messageText = buildPaginatedMessage(text, pageResults, 0, totalCount, 'ENGLISH', 'English');
            await bot.sendMessage(chatId, messageText, {
              disable_web_page_preview: true,
              reply_markup: buildInlineKeyboard(pageResults, userId, 0, totalCount, hasEmail(userId))
            });
            const uniqueAuthors = Array.from(new Set(results.map(hit => {
              const authorsValue = (hit as { authors?: string[] | string }).authors;
              return Array.isArray(authorsValue) ? authorsValue[0] : authorsValue;
            }).filter(Boolean)));
            if (uniqueAuthors.length === 1) {
              await bot.sendMessage(chatId,
                `👤 Encontré un autor que coincide: ${uniqueAuthors[0]}.\n\n` +
                '¿Quieres pasar a modo autor en inglés?',
                {
                  reply_markup: {
                    inline_keyboard: [[{
                      text: `✅ Sí, buscar libros de ${uniqueAuthors[0].substring(0, 25)}`,
                      callback_data: `activate_english_author_${uniqueAuthors[0]}`
                    }]]
                  }
                }
              );
            }
            return;
          }

          const messageText = `📚 Resultados en Lazy para "${text}":\n\n` +
            results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

          await bot.sendMessage(chatId, messageText, {
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(results, userId, 0, totalCount, hasEmail(userId))
          });

          const uniqueAuthors = Array.from(new Set(results.map(hit => {
            const authorsValue = (hit as { authors?: string[] | string }).authors;
            return Array.isArray(authorsValue) ? authorsValue[0] : authorsValue;
          }).filter(Boolean)));
          if (uniqueAuthors.length === 1) {
            await bot.sendMessage(chatId,
              `👤 Encontré un autor que coincide: ${uniqueAuthors[0]}.\n\n` +
              '¿Quieres pasar a modo autor en inglés?',
              {
                reply_markup: {
                  inline_keyboard: [[{
                    text: `✅ Sí, buscar libros de ${uniqueAuthors[0].substring(0, 25)}`,
                    callback_data: `activate_english_author_${uniqueAuthors[0]}`
                  }]]
                }
              }
            );
          }
          return;
        }
      }

      if (state.state === 'ENGLISH_AUTHOR_MODE') {
        const age = Date.now() - (state.timestamp || Date.now());
        const TIMEOUT_MS = 5 * 60 * 1000;

        if (age > TIMEOUT_MS) {
          conversationStates.delete(chatId);
          bot.sendMessage(chatId,
            '⏰ Modo autor en inglés expirado\n\n' +
            `Búsqueda normal: "${text}"\n\n` +
            'Envía /english para volver al modo inglés.'
          );
          return;
        }

        const authorName = state.author as string;
        let authorResults: Record<string, unknown>[] = [];
        try {
          const raw = await lazyFindAuthor(authorName);
          const normalized = normalizeLazyHits(raw);
          if (text) {
            const lower = text.toLowerCase();
            authorResults = normalized.filter(hit => (hit as { title?: string }).title?.toLowerCase().includes(lower));
          } else {
            authorResults = normalized;
          }
        } catch (err) {
          bot.sendMessage(chatId, '❌ LazyLibrarian no está configurado o no responde.');
          logger.error({ err, chatId }, '[ENGLISH_AUTHOR] Lazy author search failed');
          return;
        }

        if (authorResults.length === 0) {
          bot.sendMessage(chatId,
            `🔍 No encontré libros de ${authorName} que coincidan con "${text}".\n\n` +
            'Intenta con otro término o usa /exit.'
          );
          return;
        }

        const totalCount = authorResults.length;
        conversationStates.set(chatId, {
          state: 'ENGLISH_AUTHOR_MODE',
          author: authorName,
          displayName: authorName,
          query: text,
          results: authorResults,
          currentPage: 0,
          totalResults: totalCount,
          resultsPerPage: 5,
          searchType: 'ENGLISH_AUTHOR',
          timestamp: Date.now()
        });

        const pageResults = authorResults.slice(0, 5);
        const messageText = buildPaginatedMessage(text, pageResults, 0, totalCount, 'ENGLISH_AUTHOR', authorName);
        await bot.sendMessage(chatId, messageText, {
          disable_web_page_preview: true,
          reply_markup: buildInlineKeyboard(pageResults, userId, 0, totalCount, hasEmail(userId))
        });
        return;
      }

      if (state.state === 'AUTHOR_MODE') {
        const age = Date.now() - (state.timestamp || Date.now());
        const TIMEOUT_MS = 5 * 60 * 1000;

        if (age > TIMEOUT_MS) {
          logger.info({ chatId, author: state.author, age: Math.round(age / 1000) + 's' }, '[AUTHOR] Timeout expired before search');

          const displayName = state.displayName || state.author;
          conversationStates.delete(chatId);

          bot.sendMessage(chatId,
            '⏰ Modo autor expirado\n\n' +
            `Ya no estás buscando solo libros de ${displayName}.\n\n` +
            `Búsqueda normal: "${text}"\n\n` +
            'Envía /author <nombre> para volver al modo autor.'
          );

          const searchResult = await searchMeili(text, 100, null);
          const searchResults = searchResult.hits;

          if (searchResults.length === 0) {
            bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
            return;
          }

          const totalCount = searchResult.totalHits;

          if (totalCount > 5) {
            bot.sendMessage(chatId,
              `📚 Encontré más de 5 resultados para "${text}".\n\n` +
              'Por favor refina tu búsqueda:\n' +
              `• "${text} primera"\n` +
              `• "${text} saga"\n` +
              `• "${text} [año de publicación]"\n\n` +
              'O usa /author <nombre> si quieres buscar solo libros de un autor específico.'
            );
            return;
          }

          const messageText = `📚 Resultados para "${text}":\n\n` +
            searchResults.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

          await bot.sendMessage(chatId, messageText, {
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(searchResults, userId, 0, totalCount, hasEmail(userId))
          });

          return;
        }

        logger.info({ chatId, author: state.author, filter: text, age: Math.round(age / 1000) + 's' }, '[AUTHOR] Searching in author mode');

        const searchResult = await searchMeili(text, 5, { author: state.author as string });
        const authorResults = searchResult.hits;
        const totalCount = searchResult.totalHits;

        if (authorResults.length === 0) {
          bot.sendMessage(chatId,
            `🔍 No encontré libros de ${state.displayName} que coincidan con "${text}".\n\n` +
            'Intenta con otro término de búsqueda o usa /exit para salir del modo autor.'
          );
          return;
        }

        if (totalCount > 5) {
          conversationStates.set(chatId, {
            state: 'PAGINATION_MODE',
            query: text,
            searchQuery: text,
            filters: { author: state.author },
            searchIn: ['title'],
            useExactPhrase: false,
            currentPage: 0,
            totalResults: totalCount,
            resultsPerPage: 5,
            searchType: 'AUTHOR',
            displayName: state.displayName,
            timestamp: Date.now()
          });

          const messageText = buildPaginatedMessage(text, authorResults, 0, totalCount, 'AUTHOR', state.displayName || null);

          try {
            await bot.sendMessage(chatId, messageText, {
              disable_web_page_preview: true,
              reply_markup: buildInlineKeyboard(authorResults, userId, 0, totalCount, hasEmail(userId))
            });
          } catch (err) {
            logger.error({ chatId, err }, '[SEND] Error sending message in author pagination mode');
            bot.sendMessage(chatId, '❌ Error al mostrar resultados. Intenta con una búsqueda más específica.');
            return;
          }

          logger.info({ chatId, query: text, author: state.author, totalResults: totalCount }, '[PAGINATION] Pagination mode activated in author mode');
          return;
        }

        conversationStates.delete(chatId);

        const remainingTime = Math.round((5 * 60 * 1000 - (Date.now() - (state.timestamp || Date.now()))) / 1000 / 60);
        const messageText = `👤 Modo autor: ${state.displayName}\n\n` +
          `📚 Libros de ${state.displayName} que coinciden con "${text}":\n\n` +
          authorResults.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n') +
          `\n⏰ Expira en ${remainingTime} minutos\n` +
          '/exit - Salir del modo autor';

        try {
          await bot.sendMessage(chatId, messageText, {
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(authorResults.length > 5 ? authorResults.slice(0, 5) : authorResults, userId, 0, totalCount, hasEmail(userId))
          });
        } catch (err) {
          logger.error({ chatId, err }, '[SEND] Error sending message in author mode (no pagination)');
          bot.sendMessage(chatId, '❌ Error al mostrar resultados. Intenta con una búsqueda más específica.');
          return;
        }

        return;
      }
    }

    try {
      logger.info({ chatId, text }, '[SEARCH] Combined search START');

      const searchResult = await searchWithStrategies(text, 5);
      const results = searchResult.hits;

      logger.info({
        chatId,
        text,
        results: results.length,
        totalHits: searchResult.totalHits,
        strategy: searchResult.strategy,
        strategyDesc: searchResult.strategyDesc
      }, '[SEARCH] Combined search completed');

      if (results.length === 0) {
        logger.info({ chatId, text }, '[SEARCH] No results, checking authors...');

        const authorFacets = await searchAuthorFacets(text);
        const uniqueAuthors = extractAuthorsFromFacets(authorFacets, text, 10);

        if (uniqueAuthors.length > 0) {
          await handleAuthorSuggestion(bot, chatId, userId, text, uniqueAuthors);
          return;
        }

        bot.sendMessage(chatId, `🔍 No encontré resultados para "${text}".\n\nIntenta con otro término de búsqueda.`);
        clearConversationState(chatId, logger);
        return;
      }

      const totalCount = searchResult.totalHits;
      const searchQuery = searchResult.queryUsed ?? text;
      const searchFilters = searchResult.filtersUsed ?? null;
      const searchIn = searchResult.searchIn ?? ['title'];
      const useExactPhrase = searchResult.useExactPhrase ?? false;

      if (totalCount > 5) {
        conversationStates.set(chatId, {
          state: 'PAGINATION_MODE',
          query: text,
          searchQuery,
          filters: searchFilters,
          searchIn,
          useExactPhrase,
          currentPage: 0,
          totalResults: totalCount,
          resultsPerPage: 5,
          searchType: 'NORMAL',
          displayName: null,
          timestamp: Date.now()
        });

        const messageText = buildPaginatedMessage(text, results, 0, totalCount, 'NORMAL');

        try {
          await bot.sendMessage(chatId, messageText, {
            disable_web_page_preview: true,
            reply_markup: buildInlineKeyboard(results, userId, 0, totalCount, hasEmail(userId))
          });
        } catch (err) {
          logger.error({ chatId, err }, '[SEND] Error sending message in normal pagination mode');
          bot.sendMessage(chatId, '❌ Error al mostrar resultados. Intenta con una búsqueda más específica.');
          return;
        }

        logger.info({ chatId, query: text, totalResults: totalCount }, '[PAGINATION] Pagination mode activated');

        const authorFacets = await searchAuthorFacets(text);
        const uniqueAuthors = extractAuthorsFromFacets(authorFacets, text, 10);
        await sendAuthorCtaAfterTitleResults(bot, chatId, uniqueAuthors);
        return;
      }

      const messageText = `📚 Resultados para "${text}":\n\n` +
        results.map((hit, i) => `${i + 1}. ${formatResult(hit)}`).join('\n\n---\n\n');

      await bot.sendMessage(chatId, messageText, {
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(results, userId, 0, totalCount, hasEmail(userId))
      });

      const authorFacets = await searchAuthorFacets(text);
      const uniqueAuthors = extractAuthorsFromFacets(authorFacets, text, 10);
      await sendAuthorCtaAfterTitleResults(bot, chatId, uniqueAuthors);
    } catch (err) {
      logger.error({ chatId, err }, '[SEARCH] Error processing search');
      clearConversationState(chatId, logger);
      bot.sendMessage(chatId, `❌ Error al buscar: ${(err as Error).message}`);
    }
  };
};

export { createMessageHandler };
