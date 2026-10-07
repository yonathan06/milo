import { tool } from "ai";
import { z } from "zod";

const id = z.string().trim().min(1).max(256);
const mediaIds = z.array(id).min(1).max(100);
const outputSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.literal("unimplemented"), tool: z.string(), message: z.string() }),
});

// Return errors as tool results, not exceptions that terminate the model loop.
// No side effects, storage access, source-media access or credentials.
export function unimplemented(name: string): z.infer<typeof outputSchema> {
  return { ok: false, error: { code: "unimplemented", tool: name,
    message: `${name} is not implemented. No action was performed.` } };
}

export const pipelineTools = {
  analyze_media: tool({
    description: "Request analysis of previously uploaded media IDs. Currently unimplemented; never claims media was analyzed.",
    inputSchema: z.object({ mediaIds }),
    outputSchema,
    execute: async () => unimplemented("analyze_media"),
  }),
  create_video: tool({
    description: "Request the asynchronous analysis → director → editors pipeline for uploaded media and a creative brief. Currently unimplemented; creates no job or video.",
    inputSchema: z.object({ mediaIds, brief: z.string().trim().min(1).max(4000),
      ideaCount: z.number().int().min(1).max(10).default(1) }),
    outputSchema,
    execute: async () => unimplemented("create_video"),
  }),
  get_video_status: tool({
    description: "Look up a previously issued pipeline job ID. Currently unimplemented; returns no status or artifacts.",
    inputSchema: z.object({ jobId: id }),
    outputSchema,
    execute: async () => unimplemented("get_video_status"),
  }),
};
