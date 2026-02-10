const { db, nextId } = require('../core/store');
const { Roles, TaskStatus } = require('../core/constants');
const { getUser } = require('./authService');

function createTask({ studentId, subject, description, rewardValue }) {
  const student = getUser(studentId);
  if (student.role !== Roles.STUDENT) throw new Error('Only students can create tasks');

  const now = new Date().toISOString();
  const task = {
    id: nextId('task'),
    studentId,
    subject,
    description,
    rewardValue,
    status: TaskStatus.CREATED,
    statusHistory: [{ status: TaskStatus.CREATED, at: now }],
    proof: null,
    approvals: [],
    createdAt: now,
    updatedAt: now,
  };

  db.tasks.set(task.id, task);
  return task;
}

function submitTaskProof({ studentId, taskId, proof }) {
  const student = getUser(studentId);
  if (student.role !== Roles.STUDENT) throw new Error('Only students can submit proof');

  const task = db.tasks.get(taskId);
  if (!task || task.studentId !== studentId) throw new Error('Task not found for student');

  const now = new Date().toISOString();
  task.proof = {
    text: proof.text || null,
    imageUrl: proof.imageUrl || null,
    screenshotUrl: proof.screenshotUrl || null,
    codeSnippet: proof.codeSnippet || null,
  };

  // Keep explicit status transitions requested by product flow.
  task.status = TaskStatus.SUBMITTED;
  task.statusHistory.push({ status: TaskStatus.SUBMITTED, at: now });
  task.status = TaskStatus.PENDING_APPROVAL;
  task.statusHistory.push({ status: TaskStatus.PENDING_APPROVAL, at: now });
  task.updatedAt = now;

  return task;
}

function updateTaskStatus({ taskId, status }) {
  const task = db.tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  const now = new Date().toISOString();
  task.status = status;
  task.statusHistory.push({ status, at: now });
  task.updatedAt = now;
  return task;
}

function getTask(taskId) {
  const task = db.tasks.get(taskId);
  if (!task) throw new Error('Task not found');
  return task;
}

function listSubmittedTasksForParent() {
  return Array.from(db.tasks.values()).filter((task) => task.status === TaskStatus.PENDING_APPROVAL);
}

module.exports = {
  createTask,
  submitTaskProof,
  updateTaskStatus,
  getTask,
  listSubmittedTasksForParent,
};
