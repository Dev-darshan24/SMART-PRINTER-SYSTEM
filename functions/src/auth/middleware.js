/**
 * Privileged Backend Authorization Middleware
 * Enforces identity, role custom claims, and tenant isolation
 */

function requireAuth(context) {
  if (!context || !context.auth) {
    throw new Error("UNAUTHENTICATED: Caller must be authenticated.");
  }
  return context.auth;
}

function requireSuperadmin(context) {
  const auth = requireAuth(context);
  if (auth.token.role !== "superadmin") {
    throw new Error("PERMISSION_DENIED: Superadmin privileges required.");
  }
  return auth;
}

function requireCenterOwner(context, targetCenterId) {
  const auth = requireAuth(context);
  const role = auth.token.role;
  const callerCenterId = auth.token.centerId;

  // Superadmins can inspect/assist any center
  if (role === "superadmin") {
    return auth;
  }

  // Tenant isolation: Owner can only access their exact assigned center
  if (role !== "owner" || callerCenterId !== targetCenterId) {
    throw new Error("PERMISSION_DENIED: Tenant isolation policy violation.");
  }

  return auth;
}

module.exports = {
  requireAuth,
  requireSuperadmin,
  requireCenterOwner
};
