import type { ApiError } from '../api/client.ts';

interface Copy {
  title: string;
  body: string;
  /** The way forward is to replace a photo. */
  photos?: boolean;
}

/** What each failure means for the person and what they can do next. */
export function errorCopy(error: ApiError): Copy {
  switch (error.code) {
    case 'offline':
      return {
        title: 'Sin conexión',
        body: 'Tu dispositivo no tiene conexión a Internet. Tus fotos y respuestas siguen aquí; reintenta cuando vuelva la conexión.',
      };
    case 'network':
    case 'provider_unavailable':
      return {
        title: 'El servidor no responde',
        body: 'No ha sido posible completar el análisis ahora mismo. Tus fotos y respuestas siguen en esta sesión.',
      };
    case 'timeout':
    case 'provider_timeout':
      return {
        title: 'El análisis ha tardado demasiado',
        body: 'La respuesta no llegó a tiempo. Tus fotos y respuestas siguen aquí y puedes reintentarlo.',
      };
    case 'not_configured':
    case 'missing_api_key':
      return {
        title: 'Análisis real no disponible',
        body: 'El servidor de esta publicación no tiene configurada la conexión con Anthropic. Puedes ver la demostración con tus respuestas.',
      };
    case 'provider_auth':
      return {
        title: 'El servidor no puede conectar con la IA',
        body: 'La clave configurada en el servidor no es válida. Quien publica FOLIA tiene que revisarla.',
      };
    case 'rate_limited':
    case 'provider_rate_limited':
      return {
        title: 'Demasiados análisis seguidos',
        body: 'Hay un límite de análisis por hora para evitar abusos. Espera un rato y vuelve a intentarlo.',
      };
    case 'daily_limit':
      return {
        title: 'Límite diario alcanzado',
        body: 'FOLIA ha llegado al número máximo de análisis de hoy. Vuelve a intentarlo mañana o mira la demostración.',
      };
    case 'invalid_image':
    case 'unsupported_type':
    case 'image_too_large':
    case 'payload_too_large':
      return {
        title: 'Hay un problema con una foto',
        body: 'El servidor no ha aceptado una de las fotos. Sustitúyela y vuelve a intentarlo.',
        photos: true,
      };
    case 'refused':
      return {
        title: 'No se ha podido analizar',
        body: 'El modelo no ha completado el análisis de estas fotos. Prueba con otras fotos más neutras.',
        photos: true,
      };
    case 'invalid_model_response':
    case 'truncated':
    case 'bad_response':
      return {
        title: 'La respuesta no era válida',
        body: 'El resultado recibido no tenía la estructura completa, así que FOLIA no lo muestra. Puedes reintentarlo.',
      };
    case 'consent_required':
      return { title: 'Falta el consentimiento', body: 'Hace falta aceptar el envío de las fotos antes de analizarlas.' };
    default:
      return {
        title: 'No se ha podido completar el análisis',
        body: 'Ha ocurrido un error inesperado. Tus fotos y respuestas siguen en esta sesión.',
      };
  }
}
