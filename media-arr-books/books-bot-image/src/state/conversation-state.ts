type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type Bot = {
  sendMessage: (chatId: string | number, text: string) => { catch: (cb: (err: Error) => void) => void };
};

type ConversationState = {
  state: 'AUTHOR_MODE' | 'PAGINATION_MODE' | string;
  timestamp: number;
  displayName?: string;
  author?: string;
  query?: string;
  totalResults?: number;
};

const conversationStates = new Map<string | number, ConversationState>();

const clearConversationState = (chatId: string | number, logger: Logger) => {
  if (conversationStates.has(chatId)) {
    const state = conversationStates.get(chatId);
    conversationStates.delete(chatId);
    logger.info({ chatId, state: state?.state }, '[CLEANUP] Conversation state cleared');
  }
};

const cleanOldStates = (bot: Bot, logger: Logger) => {
  const now = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;

  let expiredCount = 0;

  for (const [chatId, state] of conversationStates.entries()) {
    if (now - state.timestamp > TIMEOUT_MS) {
      expiredCount++;

      if (state.state === 'AUTHOR_MODE') {
        const displayName = state.displayName || state.author;

        conversationStates.delete(chatId);

        bot.sendMessage(chatId,
          `⏰ Modo autor expirado\n\n` +
          `Ya no estás buscando solo libros de ${displayName}.\n\n` +
          'Envía /author <nombre> para volver al modo autor.'
        ).catch(err => {
          logger.error({ err, chatId }, '[CLEANUP] Error sending timeout message');
        });

        logger.info({ chatId, author: displayName, age: Math.round(TIMEOUT_MS / 1000) + 's' }, '[CLEANUP] Author mode expired');
      } else if (state.state === 'PAGINATION_MODE') {
        const query = state.query;
        const totalPages = Math.ceil(state.totalResults / 5);

        conversationStates.delete(chatId);

        bot.sendMessage(chatId,
          `⏰ Modo paginación expirado\n\n` +
          `Ya no estás navegando los resultados de "${query}".\n\n` +
          'Envía una nueva búsqueda para empezar.'
        ).catch(err => {
          logger.error({ err, chatId }, '[CLEANUP] Error sending timeout message');
        });

        logger.info({ chatId, query, totalPages, age: Math.round(TIMEOUT_MS / 1000) + 's' }, '[CLEANUP] Pagination mode expired');
      }
    }
  }

  if (expiredCount > 0) {
    logger.info({ expiredCount, activeStates: conversationStates.size }, '[CLEANUP] Cleanup completed');
  }
};

export {
  conversationStates,
  clearConversationState,
  cleanOldStates,
};
