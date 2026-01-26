import { jest } from '@jest/globals';
import { createCallbackHandler } from './src/handlers/callback-handler.ts';

describe('lazy download callback', () => {
  test('queues job when file is not ready', async () => {
    const bot = {
      sendMessage: jest.fn().mockResolvedValue({}),
      sendDocument: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const conversationStates = new Map();

    conversationStates.set('chat1', {
      state: 'ENGLISH_MODE',
      results: [
        { libid: '123', title: 'Dune', authors: ['Frank Herbert'] }
      ]
    });

    const handler = createCallbackHandler({
      bot,
      logger,
      allowedUsers: new Set(),
      conversationStates,
      getBookById: jest.fn().mockResolvedValue(null),
      bibliotecaBaseUrl: 'http://example.com',
      generateFilename: jest.fn().mockReturnValue('Dune.epub'),
      sendEmail: jest.fn().mockResolvedValue(true),
      getEmails: jest.fn().mockReturnValue({}),
      searchMeili: jest.fn().mockResolvedValue({ hits: [], totalHits: 0 }),
      buildPaginatedMessage: jest.fn().mockReturnValue(''),
      buildInlineKeyboard: jest.fn().mockReturnValue({ inline_keyboard: [] }),
      hasEmail: jest.fn().mockReturnValue(false),
      getTotalBooksByAuthor: jest.fn().mockResolvedValue(0),
      searchByAuthors: jest.fn().mockResolvedValue([]),
      extractUniqueAuthors: jest.fn().mockReturnValue([]),
      lazyAddBook: jest.fn().mockResolvedValue({ Success: true }),
      lazyQueueBook: jest.fn().mockResolvedValue({ Success: true }),
      lazySearchBook: jest.fn().mockResolvedValue({ Success: true }),
      lazyForceProcess: jest.fn().mockResolvedValue({ Success: true }),
      lazyHeadFileDirect: jest.fn().mockResolvedValue({ ok: false, status: 404 }),
      lazyDownloadFileDirect: jest.fn().mockResolvedValue({}),
      addLazyJob: jest.fn().mockReturnValue({ jobId: 'user1:123' }),
      getLazyJob: jest.fn().mockReturnValue(undefined),
      updateLazyJob: jest.fn().mockReturnValue({ jobId: 'user1:123' }),
    });

    await handler({
      id: 'cb1',
      data: 'lazy_download_123',
      message: { chat: { id: 'chat1' }, message_id: 1 },
      from: { id: 'user1' },
    });

    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('cb1', { text: '⏳ Descarga iniciada' });
    expect(bot.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('Descarga iniciada'));
  });
});
