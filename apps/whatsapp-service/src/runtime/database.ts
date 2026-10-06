import type { Database } from "@video-editor-agent/db";
import type { LocalDatabase } from "@video-editor-agent/db/local";

// Local transport is type-only here; pg never enters the Worker bundle.
export type MessagingDatabase = Database | LocalDatabase;
