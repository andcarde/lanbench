'use strict';

const ROLE_ANNOTATOR = 'annotator';
const ROLE_REVIEWER = 'reviewer';
const ROLE_ADMIN = 'admin';

const ALL_ROLES = Object.freeze([ROLE_ANNOTATOR, ROLE_REVIEWER, ROLE_ADMIN]);

function isValidRole(value) {
    return typeof value === 'string' && ALL_ROLES.includes(value);
}

module.exports = {
    ROLE_ANNOTATOR,
    ROLE_REVIEWER,
    ROLE_ADMIN,
    ALL_ROLES,
    isValidRole
};
