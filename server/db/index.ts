import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

registerShareableResource({
  type: "floor-session",
  resourceTable: schema.floorSessions,
  sharesTable: schema.floorSessionShares,
  displayName: "Floor session",
  titleColumn: "title",
  getResourcePath: (session) => `/floor/${session.id}`,
  getDb,
});
