export interface ProcessingJob {
  version: 1;
  messageId: string;
}

export interface Env {
  DATABASE_URL: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_VERIFY_TOKEN: string;
  DISPATCH_ENABLED?: string;
  PROCESSING_QUEUE: { send(job: ProcessingJob): Promise<unknown> };
}
