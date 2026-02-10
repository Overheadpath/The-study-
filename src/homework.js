import { TaskStatus } from "./models.js";

/**
 * Homework lifecycle: create -> submit -> pending approval.
 */
export class HomeworkService {
  constructor(store, auth) {
    this.store = store;
    this.auth = auth;
  }

  createTask({ studentId, subject, description, rewardPoints }) {
    this.auth.ensureStudent(studentId);
    return this.store.createTask({ studentId, subject, description, rewardPoints });
  }

  submitProof({ studentId, taskId, text = null, image = null, screenshot = null, codeSnippet = null }) {
    this.auth.ensureStudent(studentId);
    const task = this.store.tasks.get(taskId);
    if (!task || task.studentId !== studentId) {
      throw new Error("Task not found for student.");
    }
    if (task.status !== TaskStatus.CREATED) {
      throw new Error("Only newly created tasks can be submitted.");
    }

    task.proof = { text, image, screenshot, codeSnippet };
    task.status = TaskStatus.SUBMITTED;

    // Transition to pending approval immediately after submission.
    task.status = TaskStatus.PENDING_APPROVAL;
    return task;
  }

  rejectTask({ parentId, taskId, reason }) {
    this.auth.ensureParent(parentId);
    const task = this.store.tasks.get(taskId);
    if (!task) {
      throw new Error("Task not found.");
    }
    this.auth.ensureParentLinkedToStudent(parentId, task.studentId);
    if (task.status === TaskStatus.APPROVED) {
      throw new Error("Approved tasks cannot be rejected.");
    }

    task.status = TaskStatus.REJECTED;
    task.rejectionReason = reason ?? "Not enough proof provided.";
    return task;
  }

  listSubmittedForParent(parentId) {
    this.auth.ensureParent(parentId);
    const studentIds = [...this.store.parentChildLinks.entries()]
      .filter(([, parentIds]) => parentIds.has(parentId))
      .map(([studentId]) => studentId);

    return [...this.store.tasks.values()].filter(
      (task) =>
        studentIds.includes(task.studentId) &&
        [TaskStatus.SUBMITTED, TaskStatus.PENDING_APPROVAL].includes(task.status),
    );
  }
}
