const { db } = require('../core/store');
const { Roles, TaskStatus } = require('../core/constants');
const { getUser, isLinkedParent } = require('./authService');
const { getTask, updateTaskStatus } = require('./taskService');
const { authenticateParentWithOS } = require('./biometricAdapter');
const { buildApprovalMessage } = require('./aiService');
const { assertStudentCannotApprove, assertTaskNotAlreadyApproved } = require('./securityService');

async function approveTask({ parentId, taskId, nativeBiometricAuth }) {
  assertStudentCannotApprove({ actorId: parentId });

  const parent = getUser(parentId);
  if (parent.role !== Roles.PARENT) throw new Error('Only parents can approve tasks');

  const task = getTask(taskId);
  if (!isLinkedParent({ parentId, studentId: task.studentId })) {
    throw new Error('Parent is not linked to this student');
  }

  assertTaskNotAlreadyApproved({ taskId });

  const biometricOk = await authenticateParentWithOS({
    promptMessage: 'Authenticate parent approval',
    nativeBiometricAuth,
  });

  if (!biometricOk) {
    throw new Error('Biometric authentication failed. No points awarded.');
  }

  updateTaskStatus({ taskId, status: TaskStatus.APPROVED });

  // Award points only after successful parent + biometric approval.
  const student = getUser(task.studentId);
  student.points += task.rewardValue;

  const log = {
    taskId,
    parentId,
    studentId: task.studentId,
    awardedPoints: task.rewardValue,
    approvedAt: new Date().toISOString(),
  };
  db.approvalLogs.push(log);

  return {
    task: getTask(taskId),
    student,
    aiMessage: buildApprovalMessage({ points: task.rewardValue }),
  };
}

function rejectTask({ parentId, taskId, reason }) {
  assertStudentCannotApprove({ actorId: parentId });

  const parent = getUser(parentId);
  if (parent.role !== Roles.PARENT) throw new Error('Only parents can reject tasks');

  const task = getTask(taskId);
  if (!isLinkedParent({ parentId, studentId: task.studentId })) {
    throw new Error('Parent is not linked to this student');
  }

  updateTaskStatus({ taskId, status: TaskStatus.REJECTED });

  const log = {
    taskId,
    parentId,
    studentId: task.studentId,
    action: 'rejected',
    reason: reason || null,
    approvedAt: new Date().toISOString(),
  };
  db.approvalLogs.push(log);

  return getTask(taskId);
}

module.exports = {
  approveTask,
  rejectTask,
};
