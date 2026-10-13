const { requireSuperadmin } = require("../auth/middleware");
const { assignOwnerClaims } = require("../auth/claims");
const { auth } = require("../config/firebase");
const { createCenterRecord, listAllCenters } = require("../db/centersDb");
const { recordAuditLog } = require("../db/auditDb");

async function provisionCenter(data, context) {
  const superadmin = requireSuperadmin(context);
  const { name, ownerEmail, initialPassword, address, phone } = data;

  if (!name || !ownerEmail) {
    throw new Error("INVALID_ARGUMENT: Center name and ownerEmail are required.");
  }

  // Create Firebase Auth user
  const userRecord = await auth.createUser({
    email: ownerEmail,
    password: initialPassword || "TempOwnerPass2026!",
    displayName: `${name} Owner`
  });

  const centerId = `center_${Date.now()}`;
  const publicId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;

  // Assign trusted custom claims
  await assignOwnerClaims(userRecord.uid, centerId);

  // Write Center to Firestore
  await createCenterRecord(centerId, {
    centerId,
    publicId,
    name,
    ownerUid: userRecord.uid,
    ownerEmail,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    address: address || "",
    phone: phone || "",
    status: "active",
    subscriptionId: null,
    rates: {
      bwSingle: 2.0,
      bwDouble: 3.5,
      colorSingle: 10.0,
      colorDouble: 18.0
    }
  });

  // Audit log
  await recordAuditLog(
    superadmin.uid,
    "center.provision",
    "center",
    centerId,
    centerId,
    { name, ownerEmail, publicId }
  );

  return { success: true, centerId, publicId, ownerUid: userRecord.uid };
}

async function getCentersList(data, context) {
  requireSuperadmin(context);
  return listAllCenters();
}

module.exports = {
  provisionCenter,
  getCentersList
};
