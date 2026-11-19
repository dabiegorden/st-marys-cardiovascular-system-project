import { createAuthClient } from "better-auth/react";

// Same origin: Next.js proxies /api/auth/* to the Express API.
export const authClient = createAuthClient();
