import { TaskStatus } from "./models.js";

/**
 * Parent approval flow with biometric verification and point awarding.
 */
export class ApprovalService {
  constructor(store, auth, biometric, ai) {
    this.store = store;
    this.auth = auth;
    this.biometric = biometric;
    this.ai = ai;
  }

  async approveTask({ parentId, taskId }) {
    this.auth.ensureParent(parentId);
    const task = this.store.tasks.get(taskId);
    if (!task) throw new Error("Task not found.");

    this.auth.ensureParentLinkedToStudent(parentId, task.studentId);

    // Prevent duplicate approvals.
    if (task.status === TaskStatus.APPROVED) {
      throw new Error("Task already approved.");
    }
    if (task.status !== TaskStatus.PENDING_APPROVAL) {
      throw new Error("Task must be pending approval.");
    }

    const biometricOk = await this.biometric.authenticateParent({
      parentId,
      reason: "Approve submitted homework and award points",
    });

    if (!biometricOk) {
      throw new Error("Biometric authentication failed. Approval blocked.");
    }

    task.status = TaskStatus.APPROVED;
    task.approvedBy = parentId;
    task.approvedAt = new Date().toISOString();

    const student = this.store.users.get(task.studentId);
    student.points += task.rewardPoints;

    // Security audit trail.
    this.store.approvalLogs.push({
      taskId: task.id,
      parentId,
      timestamp: task.approvedAt,
      pointsAwarded: task.rewardPoints,
    });

    return {
      task,
      studentPoints: student.points,
      aiMessage: this.ai.generateApprovalMessage({
        points: task.rewardPoints,
      }),
    };
  }
}
