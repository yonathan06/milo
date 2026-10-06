import { withDatabase } from "@video-editor-agent/db";
import { createService } from "./service.ts";

export default createService(withDatabase);
