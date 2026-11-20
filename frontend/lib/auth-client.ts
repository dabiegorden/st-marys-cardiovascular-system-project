import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Same origin: Next.js proxies /api/auth/* to the Express API.
// The 2FA step is handled inline on the login page (no automatic redirect).
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
