import { readBodyWithSizeLimit } from "@agent-native/core/server";
import { defineEventHandler } from "h3";

import { toggleVote } from "../../../../../lib/floor.js";
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
  if (session.status === "ended") {
    return publicError(event, 409, "session_closed", "This session has ended.");
  }
  const body = await readBodyWithSizeLimit<{
    questionId?: unknown;
    token?: unknown;
  }>(event, 1024).catch(() => null);
  const token = voterToken(body?.token);
  if (!body || typeof body.questionId !== "string" || !token) {
    return publicError(event, 400, "invalid", "Send a question id and a token.");
  }
  try {
    return await toggleVote(session, body.questionId, token);
  } catch (error) {
    return failureReply(event, error);
  }
});
