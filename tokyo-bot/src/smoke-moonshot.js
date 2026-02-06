import pino from 'pino';
import { createMoonshotRuntime, runMoonshotPrompt } from './moonshot.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const prompt = process.argv.slice(2).join(' ').trim() || 'Decime hola en español en una línea.';
const repoPath = process.env.MOONSHOT_SMOKE_REPO_PATH || process.cwd();

try {
  const runtime = createMoonshotRuntime(process.env);
  const response = await runMoonshotPrompt({
    runtime,
    prompt,
    chatId: 'smoke-local',
    logger,
    repoPath
  });
  process.stdout.write(`${response || '(sin salida)'}\n`);
} catch (err) {
  logger.error({ err }, 'Moonshot smoke test failed');
  process.exit(1);
}
