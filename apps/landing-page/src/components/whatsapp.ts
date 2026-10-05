import { usableReferral } from '../lib/referral.ts';

// Supply the agent's international number before launch. Never invent a recipient.
export function getChatUrl(prefill: string, configuredNumber = '', referral?: string): string {
  const number = configuredNumber.replace(/[\s()+-]/g, '');
  if (number && !/^[1-9]\d{6,14}$/.test(number)) {
    throw new Error('PUBLIC_WHATSAPP_NUMBER must be an international phone number.');
  }
  const ref = usableReferral(referral);
  const message = ref ? `${prefill} [ref: ${ref}]` : prefill;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
