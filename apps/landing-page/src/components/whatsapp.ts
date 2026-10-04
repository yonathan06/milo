// Supply the agent's international number before launch. Never invent a recipient.
export function getChatUrl(prefill: string, configuredNumber = ''): string {
  const number = configuredNumber.replace(/[\s()+-]/g, '');
  if (number && !/^[1-9]\d{6,14}$/.test(number)) {
    throw new Error('PUBLIC_WHATSAPP_NUMBER must be an international phone number.');
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(prefill)}`;
}
