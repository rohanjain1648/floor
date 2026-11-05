import { readBodyWithSizeLimit } from "@agent-native/core/server";
import { defineEventHandler } from "h3";

import { insertQuestion } from "../../../../../lib/floor.js";
import {
  failureReply,
  publicError,
  sessionFromRoute,
  voterToken,
} from "../../../../../lib/public-request.js";

export default defineEventHandler(async (event) => {
  const session = await sessionFromRoute(event);
  if (!session) {
    return publicError(event, 404, "not_found", "No session uses that code.");
  }
  const body = await readBodyWithSizeLimit<{
    body?: unknown;
    authorName?: unknown;
    token?: unknown;
  }>(event, 4 * 1024).catch(() => null);
  const token = voterToken(body?.token);
  if (!body || typeof body.body !== "string" || !token) {
    return publicError(event, 400, "invalid", "Send a question and a token.");
  }
  try {
    const row = await insertQuestion(session, {
      body: body.body,
      authorName: typeof body.authorName === "string" ? body.authorName : null,
      authorToken: token,
    });
    return { id: row.id, body: row.body, status: row.status };
  } catch (error) {
    return failureReply(event, error);
  }
});
