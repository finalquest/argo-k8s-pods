import OpenAI from 'openai';
import { spawn } from 'child_process';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2.5';
const DEFAULT_TOOL_LOOP_MAX_STEPS = 8;
const OUTPUT_LIMIT = 12000;

export const resolveMoonshotConfig = (env = process.env) => {
  const apiKey = env.MOONSHOT_API_KEY || env.OPENAI_API_KEY || env.CODEX_API_KEY;
  if (!apiKey) {
    throw new Error('Missing MOONSHOT_API_KEY (or OPENAI_API_KEY/CODEX_API_KEY fallback)');
  }
  return {
    apiKey,
    baseURL: env.MOONSHOT_BASE_URL || DEFAULT_MOONSHOT_BASE_URL,
    model: env.MOONSHOT_MODEL || DEFAULT_MOONSHOT_MODEL,
    toolLoopMaxSteps: Number(env.MOONSHOT_TOOL_LOOP_MAX_STEPS) || DEFAULT_TOOL_LOOP_MAX_STEPS
  };
};

export const createMoonshotRuntime = (env = process.env) => {
  const config = resolveMoonshotConfig(env);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  return { config, client };
};

const getCompletionText = (messageContent) => {
  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
};

const normalizeMoonshotError = (err) => {
  const status = err?.status;
  const apiMessage = err?.error?.message || err?.message || 'Error desconocido';
  if (status) {
    return `Moonshot API (${status}): ${apiMessage}`;
  }
  return `Moonshot API: ${apiMessage}`;
};

const truncate = (text, max = OUTPUT_LIMIT) =>
  text.length > max ? `${text.slice(0, max)}\n... (truncado)` : text;

const resolveRepoRelativePath = ({ repoPath, inputPath = '.' }) => {
  const normalized = inputPath.trim() || '.';
  const absolute = resolve(repoPath, normalized);
  const root = resolve(repoPath);
  if (!absolute.startsWith(`${root}/`) && absolute !== root) {
    throw new Error(`Path fuera del repo: ${inputPath}`);
  }
  return absolute;
};

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lista archivos y directorios inmediatos en un path relativo al repo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relativo al repo. Default "."' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lee un archivo de texto dentro del repo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relativo al repo' },
          startLine: { type: 'number', description: 'Línea inicial 1-based (opcional)' },
          endLine: { type: 'number', description: 'Línea final 1-based (opcional)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Escribe contenido completo en un archivo dentro del repo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relativo al repo' },
          content: { type: 'string', description: 'Contenido completo a escribir' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Ejecuta un comando shell en el root del repo y devuelve stdout/stderr/exitCode',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Comando shell a ejecutar' },
          timeoutMs: {
            type: 'number',
            description: 'Timeout en ms (opcional, default 120000, max 300000)'
          }
        },
        required: ['command']
      }
    }
  }
];

const listDirectoryTool = async ({ repoPath, path = '.' }) => {
  const absolutePath = resolveRepoRelativePath({ repoPath, inputPath: path });
  const entries = await readdir(absolutePath, { withFileTypes: true });
  return {
    path,
    entries: entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
};

const readFileTool = async ({ repoPath, path, startLine, endLine }) => {
  const absolutePath = resolveRepoRelativePath({ repoPath, inputPath: path });
  const content = await readFile(absolutePath, 'utf8');
  if (!startLine && !endLine) {
    return { path, content: truncate(content) };
  }
  const lines = content.split('\n');
  const safeStart = Math.max(1, Number(startLine) || 1);
  const safeEnd = Math.max(safeStart, Number(endLine) || lines.length);
  const sliced = lines.slice(safeStart - 1, safeEnd).join('\n');
  return { path, startLine: safeStart, endLine: safeEnd, content: truncate(sliced) };
};

const writeFileTool = async ({ repoPath, path, content }) => {
  const absolutePath = resolveRepoRelativePath({ repoPath, inputPath: path });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
  return { path, bytesWritten: Buffer.byteLength(content, 'utf8') };
};

const runCommandTool = ({ repoPath, command, timeoutMs = 120000 }) =>
  new Promise((resolvePromise) => {
    const boundedTimeout = Math.min(Math.max(Number(timeoutMs) || 120000, 1000), 300000);
    const child = spawn('/bin/zsh', ['-lc', command], {
      cwd: repoPath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, boundedTimeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        command,
        exitCode: timedOut ? -1 : code,
        timedOut,
        stdout: truncate(stdout),
        stderr: truncate(stderr)
      });
    });
  });

const runTool = async ({ repoPath, toolName, args }) => {
  switch (toolName) {
    case 'list_directory':
      return listDirectoryTool({ repoPath, ...args });
    case 'read_file':
      return readFileTool({ repoPath, ...args });
    case 'write_file':
      return writeFileTool({ repoPath, ...args });
    case 'run_command':
      return runCommandTool({ repoPath, ...args });
    default:
      throw new Error(`Tool no soportada: ${toolName}`);
  }
};

const parseToolArgs = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const runMoonshotPrompt = async ({
  runtime,
  prompt,
  chatId = 'n/a',
  logger,
  repoPath
}) => {
  if (logger?.debug) {
    logger.debug(
      {
        chatId,
        model: runtime.config.model,
        baseURL: runtime.config.baseURL,
        toolsEnabled: Boolean(repoPath)
      },
      'Ejecutando prompt con OpenAI SDK'
    );
  }
  try {
    const messages = [];
    if (repoPath) {
      messages.push({
        role: 'system',
        content:
          'Tenés herramientas para operar sobre el repo local. Si el usuario pide leer/escribir/crear/modificar archivos o ejecutar comandos, debés usar tools y verificar el resultado antes de afirmar éxito. No inventes ejecuciones.'
      });
    }
    messages.push({ role: 'user', content: prompt });
    for (let step = 0; step < runtime.config.toolLoopMaxSteps; step += 1) {
      const completion = await runtime.client.chat.completions.create({
        model: runtime.config.model,
        temperature: 1,
        messages,
        extra_body: {
          thinking: { type: 'enabled' }
        },
        ...(repoPath ? { tools: toolDefinitions, tool_choice: 'auto' } : {})
      });
      const message = completion?.choices?.[0]?.message;
      const toolCalls = message?.tool_calls || [];
      if (toolCalls.length && repoPath) {
        messages.push({
          role: 'assistant',
          content: message?.content || null,
          tool_calls: toolCalls,
          ...(message?.reasoning_content
            ? { reasoning_content: message.reasoning_content }
            : {})
        });
        for (const toolCall of toolCalls) {
          const args = parseToolArgs(toolCall?.function?.arguments);
          try {
            const toolResult = await runTool({
              repoPath,
              toolName: toolCall?.function?.name,
              args
            });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult)
            });
          } catch (toolErr) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: toolErr?.message || 'tool_error'
              })
            });
          }
        }
        continue;
      }
      return getCompletionText(message?.content);
    }
    return 'No pude completar la tarea dentro del límite de pasos de herramientas.';
  } catch (err) {
    throw new Error(normalizeMoonshotError(err));
  }
};
