import { withDatabase } from "@video-editor-agent/db";
import { createService } from "./service.ts";
import { createConversationCoordinator } from "./coordination/conversation.ts";

export const ConversationCoordinator = createConversationCoordinator(withDatabase);

export default createService(withDatabase);
