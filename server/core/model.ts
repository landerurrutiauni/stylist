import Anthropic from '@anthropic-ai/sdk';
import { analysisOutputSchema } from '../../shared/schema/analysis.ts';
import type { ErrorCode } from '../../shared/schema/events.ts';
import type { ServerConfig } from './config.ts';
import { outputFormat } from './outputSchema.ts';
import { SYSTEM_PROMPT, USER_TASK } from './prompt.ts';

export interface ModelImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

export interface ModelInput {
  frontal: ModelImage;
  profile: ModelImage;
  answersText: string;
}

export interface ModelHooks {
  /** The model has started working (its first block began). */
  onStart(): void;
  /** A chunk of the JSON answer arrived. `reset` is true when a fallback model took over. */
  onText(delta: string, reset: boolean): void;
}

export interface ModelResult {
  text: string;
  stopReason: string | null;
  model: string;
}

/** Runs one analysis against the model. Injected so tests never call the real API. */
export type ModelRunner = (input: ModelInput, hooks: ModelHooks, signal: AbortSignal) => Promise<ModelResult>;

export class ModelError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

const FORMAT = outputFormat(analysisOutputSchema);

export function createAnthropicRunner(config: ServerConfig): ModelRunner {
  const client = new Anthropic({
    apiKey: config.apiKey ?? undefined,
    timeout: config.timeoutMs,
    maxRetries: 1,
  });

  return async (input, hooks, signal) => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: 'Foto frontal:' },
      { type: 'image', source: { type: 'base64', media_type: input.frontal.mime, data: input.frontal.base64 } },
      { type: 'text', text: 'Foto de perfil:' },
      { type: 'image', source: { type: 'base64', media_type: input.profile.mime, data: input.profile.base64 } },
      { type: 'text', text: `Respuestas del cuestionario:\n${input.answersText}\n\n${USER_TASK}` },
    ];

    try {
      const stream = client.beta.messages.stream(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: config.effort, format: FORMAT },
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content }],
          ...(config.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal },
      );

      let started = false;
      let resetPending = false;
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (!started) {
            started = true;
            hooks.onStart();
          }
          // A fallback block marks the point where another model continues;
          // the JSON that follows replaces whatever came before it.
          if (event.content_block.type === 'fallback') resetPending = true;
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          hooks.onText(event.delta.text, resetPending);
          resetPending = false;
        }
      }

      const message = await stream.finalMessage();
      let text = '';
      for (const block of message.content) {
        if (block.type === 'fallback') text = '';
        else if (block.type === 'text') text += block.text;
      }
      return { text, stopReason: message.stop_reason, model: message.model };
    } catch (error) {
      throw toModelError(error, signal);
    }
  };
}

function toModelError(error: unknown, signal: AbortSignal): ModelError {
  if (error instanceof ModelError) return error;
  if (signal.aborted) return new ModelError('provider_timeout', 'Se canceló el análisis.', true);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelError('provider_auth', 'El servidor no puede autenticarse con el proveedor de IA.', false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ModelError('provider_rate_limited', 'El proveedor de IA está recibiendo demasiadas peticiones.', true);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ModelError('provider_timeout', 'El análisis tardó demasiado en responder.', true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ModelError('provider_unavailable', 'No se pudo conectar con el proveedor de IA.', true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ModelError('invalid_request', 'El proveedor de IA rechazó la petición.', false);
  }
  if (error instanceof Anthropic.InternalServerError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500)) {
    return new ModelError('provider_unavailable', 'El proveedor de IA no está disponible ahora mismo.', true);
  }
  if (error instanceof Anthropic.APIError) {
    return new ModelError('provider_unavailable', 'El proveedor de IA devolvió un error.', true);
  }
  return new ModelError('internal', 'Error inesperado durante el análisis.', true);
}
