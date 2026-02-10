const Roles = Object.freeze({
  STUDENT: 'student',
  PARENT: 'parent',
});

const TaskStatus = Object.freeze({
  CREATED: 'created',
  SUBMITTED: 'submitted',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const RedemptionStatus = Object.freeze({
  REQUESTED: 'requested',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
});

module.exports = {
  Roles,
  TaskStatus,
  RedemptionStatus,
};
