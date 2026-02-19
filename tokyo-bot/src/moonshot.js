import OpenAI from 'openai';
import { spawn } from 'child_process';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

const DEFAULT_MOONSHOT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MOONSHOT_MODEL = 'kimi-k2.5';
const DEFAULT_TOOL_LOOP_MAX_STEPS = 20;
const OUTPUT_LIMIT = 12000;
const DEFAULT_GUIDANCE_CHUNK_SIZE = 32000;

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
    const child = spawn('sh', ['-c', command], {
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
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({
        command,
        exitCode: -1,
        timedOut: false,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\n${err?.message || 'spawn error'}`.trim())
      });
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
  repoPath,
  systemPrompt = ''
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
    let lastAssistantContent = '';
    const toolSignatureCount = new Map();
    let lastToolBatchSignature = '';
    let repeatedBatchCount = 0;
    if (systemPrompt?.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt.trim()
      });
    }
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
      const currentText = getCompletionText(message?.content);
      if (currentText) {
        lastAssistantContent = currentText;
      }
      const toolCalls = message?.tool_calls || [];
      if (toolCalls.length && repoPath) {
        const currentBatchSignature = toolCalls
          .map((toolCall) => `${toolCall?.function?.name}:${toolCall?.function?.arguments || '{}'}`)
          .join('||');
        if (currentBatchSignature === lastToolBatchSignature) {
          repeatedBatchCount += 1;
        } else {
          repeatedBatchCount = 0;
          lastToolBatchSignature = currentBatchSignature;
        }

        messages.push({
          role: 'assistant',
          content: message?.content || null,
          tool_calls: toolCalls,
          ...(message?.reasoning_content
            ? { reasoning_content: message.reasoning_content }
            : {})
        });
        let loopGuardTriggered = false;
        for (const toolCall of toolCalls) {
          const rawArgs = toolCall?.function?.arguments || '{}';
          const signature = `${toolCall?.function?.name}:${rawArgs}`;
          const seenCount = toolSignatureCount.get(signature) || 0;
          if (seenCount >= 2) {
            loopGuardTriggered = true;
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: 'loop_detected_same_tool_call',
                detail:
                  'Se bloqueó una tool call idéntica repetida para evitar bucles. Debés avanzar con otro enfoque o finalizar.'
              })
            });
            continue;
          }
          toolSignatureCount.set(signature, seenCount + 1);
          const args = parseToolArgs(rawArgs);
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
        if (repeatedBatchCount >= 2 || loopGuardTriggered) {
          logger?.warn(
            { chatId, repeatedBatchCount, loopGuardTriggered },
            'Guardrail de tools activado, se fuerza finalización'
          );
          break;
        }
        continue;
      }
      return currentText || '(sin salida)';
    }
    if (repoPath) {
      const finalCompletion = await runtime.client.chat.completions.create({
        model: runtime.config.model,
        temperature: 1,
        messages,
        extra_body: {
          thinking: { type: 'enabled' }
        },
        tools: toolDefinitions,
        tool_choice: 'none'
      });
      const finalText = getCompletionText(finalCompletion?.choices?.[0]?.message?.content);
      if (finalText) {
        return finalText;
      }
    }
    return lastAssistantContent || 'No pude completar la tarea en este intento.';
  } catch (err) {
    throw new Error(normalizeMoonshotError(err));
  }
};

const chunkText = (text, chunkSize) => {
  if (!text) {
    return [];
  }
  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
};

const compileGuidance = async ({ runtime, docPayload, systemPrompt, model }) => {
  const response = await runtime.client.chat.completions.create({
    model,
    temperature: 1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: docPayload }
    ],
    extra_body: {
      thinking: { type: 'disabled' }
    }
  });
  return getCompletionText(response?.choices?.[0]?.message?.content);
};

const shouldFallbackToChunking = (err) => {
  const status = Number(err?.status || 0);
  const message = `${err?.error?.message || err?.message || ''}`.toLowerCase();
  if (status === 413) {
    return true;
  }
  return status === 400 && /token|context|length|max/.test(message);
};

export const generateRepoGuidanceSystemText = async ({
  runtime,
  agentsText,
  readmeText,
  logger
}) => {
  const model = process.env.REPO_GUIDANCE_MODEL || runtime.config.model;
  const compilerSystemPrompt =
    'Sos un compilador de contexto para un bot de ingeniería. Tu salida se usará como system prompt. ' +
    'Debe ser breve, accionable y sin relleno. Estructura exacta requerida:\n' +
    '1) OBJETIVO_DEL_REPO\n2) REGLAS_OBLIGATORIAS\n3) CONVENCIONES_DE_CODIGO\n4) USO_DE_HERRAMIENTAS\n5) CHECKLIST_DE_EJECUCION\n' +
    'En REGLAS_OBLIGATORIAS incluye solo reglas explícitas de AGENTS/README. No inventes reglas.';

  const fullPayload =
    `AGENTS.md\n<<<\n${agentsText || '(no disponible)'}\n>>>\n\n` +
    `README.md\n<<<\n${readmeText || '(no disponible)'}\n>>>`;

  try {
    const compiled = await compileGuidance({
      runtime,
      docPayload: fullPayload,
      systemPrompt: compilerSystemPrompt,
      model
    });
    if (!compiled) {
      throw new Error('Guidance compiler returned empty output');
    }
    return compiled;
  } catch (err) {
    if (!shouldFallbackToChunking(err)) {
      throw err;
    }
    logger?.warn({ err }, 'Guidance compiler fallback to chunking');
  }

  const chunkSize = Number(process.env.REPO_GUIDANCE_CHUNK_SIZE) || DEFAULT_GUIDANCE_CHUNK_SIZE;
  const agentsChunks = chunkText(agentsText || '(no disponible)', chunkSize);
  const readmeChunks = chunkText(readmeText || '(no disponible)', chunkSize);

  const chunkSummaries = [];
  const chunkSystemPrompt =
    'Extraé solo reglas y decisiones operativas explícitas del texto. ' +
    'Salida breve en bullets. No inventes.';

  for (const [index, chunk] of agentsChunks.entries()) {
    const summary = await compileGuidance({
      runtime,
      docPayload: `Chunk AGENTS ${index + 1}/${agentsChunks.length}\n<<<\n${chunk}\n>>>`,
      systemPrompt: chunkSystemPrompt,
      model
    });
    if (summary) {
      chunkSummaries.push(`AGENTS chunk ${index + 1}:\n${summary}`);
    }
  }
  for (const [index, chunk] of readmeChunks.entries()) {
    const summary = await compileGuidance({
      runtime,
      docPayload: `Chunk README ${index + 1}/${readmeChunks.length}\n<<<\n${chunk}\n>>>`,
      systemPrompt: chunkSystemPrompt,
      model
    });
    if (summary) {
      chunkSummaries.push(`README chunk ${index + 1}:\n${summary}`);
    }
  }

  const mergedSummaries = chunkSummaries.join('\n\n');
  const compiled = await compileGuidance({
    runtime,
    docPayload: `Resumenes de chunks\n<<<\n${mergedSummaries}\n>>>`,
    systemPrompt: compilerSystemPrompt,
    model
  });
  if (!compiled) {
    throw new Error('Guidance compiler returned empty output after chunking');
  }
  return compiled;
};
