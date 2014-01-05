var path = require('path');

module.exports = function(mod) {
    try {
        return require(path.join(process.cwd(), mod));
    } catch (e) {
        return require(mod);
    }
};