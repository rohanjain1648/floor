import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
export default defineConfig({
  optimizeDeps: {
    entries: [
      "app/entry.client.tsx",
      "app/root.tsx",
      "app/components/layout/{Layout,Sidebar}.tsx",
      "app/components/chat/ChatRouteContent.tsx",
      "app/routes/{home,chat.$threadId}.tsx",
      "app/routes/{floor._index,floor.$sessionId,stage.$sessionId,j.$code}.tsx",
    ],
    // UMD package: pre-bundle it so the browser gets an ES default export.
    include: ["qrcode-generator"],
  },
  plugins: [
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      ssrStubs: ["shiki"],
    }),
  ],
});
