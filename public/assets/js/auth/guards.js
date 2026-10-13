/**
 * Page Route Authorization Guards
 */

import { authManager, ROLES } from './authManager.js';
import { showToast } from '../ui.js';

export function protectRoute(allowedRoles = []) {
  const user = authManager.getCurrentUser();

  if (!user) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    return false;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    showToast("Access Denied: You lack permissions for this section.", "error");
    setTimeout(() => {
      if (user.role === ROLES.SUPERADMIN) {
        window.location.href = "/admin/";
      } else if (user.role === ROLES.OWNER) {
        window.location.href = "/app/";
      } else {
        window.location.href = "/";
      }
    }, 800);
    return false;
  }

  return true;
}

export function guardSuperadmin() {
  return protectRoute([ROLES.SUPERADMIN]);
}

export function guardOwner() {
  return protectRoute([ROLES.OWNER, ROLES.SUPERADMIN]);
}
