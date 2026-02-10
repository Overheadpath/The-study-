import { Role } from "./models.js";

/**
 * Auth + role checks + parent-child linking.
 */
export class AuthService {
  constructor(store) {
    this.store = store;
  }

  registerUser({ id, name, role }) {
    if (!Object.values(Role).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    return this.store.addUser({ id, name, role, points: 0 });
  }

  linkParentToChild({ parentId, childId }) {
    const parent = this.store.users.get(parentId);
    const child = this.store.users.get(childId);

    if (!parent || !child) {
      throw new Error("Parent or student account does not exist.");
    }
    if (parent.role !== Role.PARENT || child.role !== Role.STUDENT) {
      throw new Error("Link must be parent -> student.");
    }
    this.store.linkParentToChild(parentId, childId);
  }

  ensureParent(userId) {
    const user = this.store.users.get(userId);
    if (!user || user.role !== Role.PARENT) {
      throw new Error("Action requires parent role.");
    }
    return user;
  }

  ensureStudent(userId) {
    const user = this.store.users.get(userId);
    if (!user || user.role !== Role.STUDENT) {
      throw new Error("Action requires student role.");
    }
    return user;
  }

  ensureParentLinkedToStudent(parentId, studentId) {
    const linkedParents = this.store.parentChildLinks.get(studentId);
    if (!linkedParents || !linkedParents.has(parentId)) {
      throw new Error("Parent is not linked to this student.");
    }
  }
}
