'use strict';

/**
 * @file User-related constants shared across controllers, services and
 * documentation. Currently scoped to the register-code format used by
 * moderator self-registration ([TECHNICAL-DESIGN.md §5.1](../documentation/TECHNICAL-DESIGN.md#51-endpoint-surface)).
 */

/** Pattern of moderator register codes (16 alphanumeric characters). */
const REGISTER_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;

module.exports = {
    REGISTER_CODE_PATTERN
};
