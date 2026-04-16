
// debug-utils.js
'use strict';

const { logPosition, logMessage, logElement } = require('./log-utils');

function superCreateLogger(file) {
    const createLogger = (_function) => {
        const logPositionBriefly = (line) => logPosition(file, _function, line);
        const logMessageBriefly = (line, message) => logMessage(file, _function, line, message);
        const logElementBriefly = (line, object, name = '') => logElement(file, _function, line, object, name);
        const logger = {
            logPosition: logPositionBriefly,
            logMessage: logMessageBriefly,
            logElement: logElementBriefly,
        };
        return logger;
    }
    return createLogger;
}

// · Examples of use

// ·· Example 1:
// // <DEBUG>
// const superCreateLogger = require('../utils/debug-utils.js');
// const createLogger = superCreateLogger('user-dao');
// const {logMessage} = createLogger('global');
// logMessage(7, 'Error: La variable pool está indefinida');
// // </DEBUG>
 
// ·· Example 2:
// /* <DEBUG/> */ const superCreateLogger = require('../utils/debug-utils.js');
// /* <DEBUG/> */ const createLogger = superCreateLogger('controller');
// /* <DEBUG/> */ const {logPosition, logMessage, logElement} = createLogger('checkAccess');
// /* <DEBUG/> */ logPosition(100);
// /* <DEBUG/> */ logMessage(200, 'Failed try of login');
// /* <DEBUG/> */ logElement(300, user, 'user');

module.exports = superCreateLogger;