const { db, nextId } = require('../core/store');
const { Roles } = require('../core/constants');

function registerUser({ name, role }) {
  if (!Object.values(Roles).includes(role)) {
    throw new Error('Invalid role');
  }

  const user = {
    id: nextId('user'),
    name,
    role,
    points: role === Roles.STUDENT ? 0 : undefined,
    createdAt: new Date().toISOString(),
  };

  db.users.set(user.id, user);
  return user;
}

function getUser(userId) {
  const user = db.users.get(userId);
  if (!user) throw new Error('User not found');
  return user;
}

function linkParentToStudent({ parentId, studentId }) {
  const parent = getUser(parentId);
  const student = getUser(studentId);

  if (parent.role !== Roles.PARENT) throw new Error('Only a parent can be linked');
  if (student.role !== Roles.STUDENT) throw new Error('Only a student can be linked');

  const links = db.parentChildLinks.get(studentId) || new Set();
  links.add(parentId);
  db.parentChildLinks.set(studentId, links);

  return { studentId, parentIds: Array.from(links) };
}

function isLinkedParent({ parentId, studentId }) {
  const links = db.parentChildLinks.get(studentId);
  return Boolean(links && links.has(parentId));
}

module.exports = {
  registerUser,
  getUser,
  linkParentToStudent,
  isLinkedParent,
};
