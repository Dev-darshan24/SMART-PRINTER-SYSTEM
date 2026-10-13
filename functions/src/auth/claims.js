const { auth } = require("../config/firebase");

/**
 * Assign trusted custom claims to an authorized Xerox Center Owner
 */
async function assignOwnerClaims(uid, centerId) {
  if (!uid || !centerId) {
    throw new Error("INVALID_ARGUMENT: uid and centerId are required for owner claims.");
  }
  await auth.setCustomUserClaims(uid, {
    role: "owner",
    centerId: centerId
  });
}

/**
 * Assign trusted custom claims to a platform Superadmin
 */
async function assignSuperadminClaims(uid) {
  if (!uid) {
    throw new Error("INVALID_ARGUMENT: uid is required for superadmin claims.");
  }
  await auth.setCustomUserClaims(uid, {
    role: "superadmin"
  });
}

module.exports = {
  assignOwnerClaims,
  assignSuperadminClaims
};
