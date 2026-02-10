const { Roles, TaskStatus } = require('../core/constants');
const { getUser } = require('./authService');
const { getTask } = require('./taskService');

function assertStudentCannotApprove({ actorId }) {
  const user = getUser(actorId);
  if (user.role === Roles.STUDENT) {
    throw new Error('Security rule: students cannot approve tasks');
  }
}

function assertTaskNotAlreadyApproved({ taskId }) {
  const task = getTask(taskId);
  if (task.status === TaskStatus.APPROVED) {
    throw new Error('Security rule: duplicate approvals are blocked');
  }
}

module.exports = {
  assertStudentCannotApprove,
  assertTaskNotAlreadyApproved,
};
