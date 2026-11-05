import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  // The audience joins without an account: /j/<code> and its JSON endpoints.
  publicPaths: ["/j", "/api/public"],
});
