/**
 * Authentication & Role Authorization Controller
 */

import { showToast } from './ui.js';
import { authManager, ROLES } from './auth/authManager.js';

export const USER_ROLES = ROLES;

class AuthController {
  getCurrentUser() {
    return authManager.getCurrentUser();
  }

  login(email, password) {
    return authManager.login(email, password);
  }

  loginWithGoogle() {
    return authManager.loginWithGoogle();
  }

  register(data) {
    return authManager.register(data);
  }

  isLoggedIn() {
    return authManager.isLoggedIn();
  }

  logout() {
    return authManager.logout();
  }

  saveSession() {
    return authManager.saveSession();
  }

  protectPage(allowedRoles = []) {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      showToast("Access Denied: Insufficient privileges", "error");
      setTimeout(() => {
        if (user.role === USER_ROLES.SUPERADMIN) {
          window.location.href = '/admin/';
        } else if (user.role === USER_ROLES.OWNER) {
          window.location.href = '/app/';
        } else {
          window.location.href = '/';
        }
      }, 1000);
      return false;
    }
    return true;
  }
}

export const auth = new AuthController();
