const ALLOWED_TYPES = new Set(['FEEDBACK_PUBLISHED', 'ISSUE_DETECTED']);

/**
 * Valida un mensaje de cola según el contrato de MS3.
 * Acepta JSON plano en string o buffer, y si falla el parseo intenta base64.
 *
 * @param {string|object} rawInput
 * @returns {{ valid: boolean, errors: string[], data: object|null }}
 */
function parseAndValidateMessage(rawInput) {
  let parsed = null;
  const errors = [];

  if (typeof rawInput === 'object' && rawInput !== null) {
    parsed = rawInput;
  } else if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Si falla como JSON plano, intenta decodificar desde base64
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
        parsed = JSON.parse(decoded);
      } catch {
        return {
          valid: false,
          errors: ['El cuerpo del mensaje no es un JSON válido ni está codificado en Base64 válido'],
          data: null,
        };
      }
    }
  } else {
    return {
      valid: false,
      errors: ['Tipo de entrada no admitido para el mensaje'],
      data: null,
    };
  }

  // Validar eventId
  if (!parsed.eventId || typeof parsed.eventId !== 'string' || parsed.eventId.trim() === '') {
    errors.push('El campo "eventId" es obligatorio y debe ser una cadena no vacía');
  }

  // Validar type
  if (!parsed.type || typeof parsed.type !== 'string' || !ALLOWED_TYPES.has(parsed.type)) {
    errors.push(`El campo "type" debe ser uno de los tipos permitidos: ${Array.from(ALLOWED_TYPES).join(', ')}`);
  }

  // Validar courseId
  if (typeof parsed.courseId !== 'number' || !Number.isInteger(parsed.courseId)) {
    errors.push('El campo "courseId" es obligatorio y debe ser un número entero');
  }

  // Validar groupId
  if (typeof parsed.groupId !== 'number' || !Number.isInteger(parsed.groupId)) {
    errors.push('El campo "groupId" es obligatorio y debe ser un número entero');
  }

  // Validar title
  if (!parsed.title || typeof parsed.title !== 'string' || parsed.title.trim() === '') {
    errors.push('El campo "title" es obligatorio y debe ser una cadena no vacía');
  }

  // Validar message
  if (!parsed.message || typeof parsed.message !== 'string' || parsed.message.trim() === '') {
    errors.push('El campo "message" es obligatorio y debe ser una cadena no vacía');
  }

  // Validar createdAt (Epoch en milisegundos)
  if (
    typeof parsed.createdAt !== 'number' ||
    !Number.isInteger(parsed.createdAt) ||
    parsed.createdAt <= 0
  ) {
    errors.push('El campo "createdAt" es obligatorio y debe ser un número entero positivo (Epoch en milisegundos)');
  } else if (parsed.createdAt < 100000000000) {
    // Si tiene menos de 11 dígitos, fue enviado en segundos en vez de milisegundos
    errors.push('El campo "createdAt" debe estar expresado en milisegundos, no en segundos');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      data: null,
    };
  }

  return {
    valid: true,
    errors: [],
    data: {
      eventId: parsed.eventId.trim(),
      type: parsed.type,
      courseId: parsed.courseId,
      groupId: parsed.groupId,
      title: parsed.title.trim(),
      message: parsed.message.trim(),
      createdAt: parsed.createdAt,
      source: parsed.source && typeof parsed.source === 'string' ? parsed.source.trim() : 'ms-analysis',
    },
  };
}

module.exports = {
  ALLOWED_TYPES,
  parseAndValidateMessage,
};
