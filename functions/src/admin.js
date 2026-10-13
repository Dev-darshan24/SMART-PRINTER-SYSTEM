const admin = require("firebase-admin");

/**
 * Superadmin-only function to provision a new Xerox center and its single owner
 */
async function provisionCenterAndOwner(data, context) {
  // Enforce caller identity & superadmin claim
  if (!context.auth || context.auth.token.role !== "superadmin") {
    throw new Error("PERMISSION_DENIED: Caller must be a Superadmin.");
  }

  const { name, ownerEmail, initialPassword, address, phone } = data;
  if (!name || !ownerEmail) {
    throw new Error("INVALID_ARGUMENT: Center name and ownerEmail are required.");
  }

  const db = admin.firestore();

  // Check if center or user already exists
  const existingUser = await admin.auth().getUserByEmail(ownerEmail).catch(() => null);
  if (existingUser) {
    throw new Error("ALREADY_EXISTS: A user with this email already exists.");
  }

  // Generate unique center IDs
  const centerRef = db.collection("centers").doc();
  const centerId = centerRef.id;
  const publicId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create Firebase Auth user for owner
  const userRecord = await admin.auth().createUser({
    email: ownerEmail,
    password: initialPassword || "TempPass123!",
    displayName: name + " Owner"
  });

  // Assign trusted custom claims (Never client-settable)
  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: "owner",
    centerId: centerId
  });

  const now = admin.firestore.FieldValue.serverTimestamp();

  // Create Center record
  await centerRef.set({
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
    },
    createdAt: now,
    updatedAt: now
  });

  // Create User profile in Firestore
  await db.collection("users").doc(userRecord.uid).set({
    role: "owner",
    centerId,
    displayName: name + " Owner",
    email: ownerEmail,
    isActive: true,
    createdAt: now,
    lastLoginAt: null
  });

  // Audit log
  await db.collection("auditLogs").add({
    actorUid: context.auth.uid,
    action: "center.provision",
    targetType: "center",
    targetId: centerId,
    centerId,
    createdAt: now,
    metadata: { name, ownerEmail, publicId }
  });

  return { success: true, centerId, publicId, ownerUid: userRecord.uid };
}

module.exports = {
  provisionCenterAndOwner
};
