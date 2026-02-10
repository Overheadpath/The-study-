/**
 * Core domain constants for the Verified Learning Loop system.
 */
export const Role = Object.freeze({
  STUDENT: "student",
  PARENT: "parent",
});

export const TaskStatus = Object.freeze({
  CREATED: "created",
  SUBMITTED: "submitted",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const RedemptionStatus = Object.freeze({
  REQUESTED: "requested",
  DELIVERED: "delivered",
});
