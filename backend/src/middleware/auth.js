/**
 * middleware/auth.js – authentication & role-based access control
 * ===============================================================
 * The session lookup is injected so the rules can be unit-tested without
 * a database (see test/rbac.test.js). In the app it is Better Auth's
 * auth.api.getSession.
 *
 *   app.use(loadSession(getSession))   – attaches req.user / req.session
 *   requireAuth                        – 401 if not logged in or banned,
 *                                        403 if a password change is pending
 *   requireRole("admin")               – 403 for other roles
 */

export function loadSession(getSession) {
  return async (req, _res, next) => {
    try {
      const result = await getSession(req);
      req.user = result?.user ?? null;
      req.session = result?.session ?? null;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Routes a user with a pending password change may still call */
const PASSWORD_CHANGE_ALLOWED = new Set(["/api/me"]);

export function requireAuth(req, res, next) {
  if (!req.user || req.user.banned) {
    return res.status(401).json({ success: false, error: "Authentication required.", code: "UNAUTHENTICATED" });
  }
  if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.originalUrl.split("?")[0])) {
    return res.status(403).json({
      success: false,
      error: "You must change your password before continuing.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  next();
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: "You do not have permission for this action.", code: "FORBIDDEN" });
      }
      next();
    });
  };
}
