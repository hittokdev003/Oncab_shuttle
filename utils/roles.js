'use strict';

const normalizeRoleName = (roleName) => String(roleName || '').trim().toLowerCase();
const hasRole = (user, roleName) => normalizeRoleName(user?.role?.name) === normalizeRoleName(roleName);

module.exports = { normalizeRoleName, hasRole };
