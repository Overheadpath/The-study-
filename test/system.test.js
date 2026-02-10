import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.js";
import { TaskStatus, RedemptionStatus } from "../src/models.js";

test("student cannot self-approve; parent biometric approval awards points and logs", async () => {
  const app = createApp({ biometricAuthenticator: async () => true });

  app.auth.registerUser({ id: "s1", name: "Student", role: "student" });
  app.auth.registerUser({ id: "p1", name: "Parent", role: "parent" });
  app.auth.linkParentToChild({ parentId: "p1", childId: "s1" });

  const task = app.homework.createTask({
    studentId: "s1",
    subject: "Maths",
    description: "Fractions worksheet",
    rewardPoints: 50,
  });

  app.homework.submitProof({ studentId: "s1", taskId: task.id, text: "Done all questions" });
  assert.equal(task.status, TaskStatus.PENDING_APPROVAL);

  await assert.rejects(() => app.approval.approveTask({ parentId: "s1", taskId: task.id }), /parent role/);

  const result = await app.approval.approveTask({ parentId: "p1", taskId: task.id });
  assert.equal(result.task.status, TaskStatus.APPROVED);
  assert.equal(result.studentPoints, 50);
  assert.equal(app.store.approvalLogs.length, 1);
  assert.equal(app.store.approvalLogs[0].parentId, "p1");
});

test("approval is blocked when biometric fails and duplicate approvals are prevented", async () => {
  const app = createApp({ biometricAuthenticator: async () => false });

  app.auth.registerUser({ id: "s1", name: "Student", role: "student" });
  app.auth.registerUser({ id: "p1", name: "Parent", role: "parent" });
  app.auth.linkParentToChild({ parentId: "p1", childId: "s1" });

  const task = app.homework.createTask({
    studentId: "s1",
    subject: "Coding",
    description: "Build calculator",
    rewardPoints: 40,
  });
  app.homework.submitProof({ studentId: "s1", taskId: task.id, codeSnippet: "function add(a,b){return a+b}" });

  await assert.rejects(
    () => app.approval.approveTask({ parentId: "p1", taskId: task.id }),
    /Biometric authentication failed/,
  );

  const passApp = createApp({ biometricAuthenticator: async () => true });
  passApp.auth.registerUser({ id: "s2", name: "Student 2", role: "student" });
  passApp.auth.registerUser({ id: "p2", name: "Parent 2", role: "parent" });
  passApp.auth.linkParentToChild({ parentId: "p2", childId: "s2" });
  const task2 = passApp.homework.createTask({
    studentId: "s2",
    subject: "English",
    description: "Essay",
    rewardPoints: 30,
  });
  passApp.homework.submitProof({ studentId: "s2", taskId: task2.id, text: "Essay uploaded" });

  await passApp.approval.approveTask({ parentId: "p2", taskId: task2.id });
  await assert.rejects(() => passApp.approval.approveTask({ parentId: "p2", taskId: task2.id }), /already approved/);
});

test("parent-managed rewards can be redeemed and delivered", () => {
  const app = createApp({ biometricAuthenticator: async () => true });

  app.auth.registerUser({ id: "s1", name: "Student", role: "student" });
  app.auth.registerUser({ id: "p1", name: "Parent", role: "parent" });
  app.auth.linkParentToChild({ parentId: "p1", childId: "s1" });

  app.store.users.get("s1").points = 120;

  const reward = app.rewards.createReward({
    parentId: "p1",
    name: "Pokémon Booster Pack",
    image: "pokemon-pack.png",
    pointCost: 100,
    description: "One booster pack from local shop",
  });

  const redemption = app.rewards.redeemReward({ studentId: "s1", rewardId: reward.id });
  assert.equal(app.store.users.get("s1").points, 20);
  assert.equal(redemption.status, RedemptionStatus.REQUESTED);

  const delivered = app.rewards.confirmDelivery({ parentId: "p1", redemptionId: redemption.id });
  assert.equal(delivered.status, RedemptionStatus.DELIVERED);
});
