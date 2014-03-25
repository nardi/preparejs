(function() {
    Object.defineProperty(window, 'onServer', {'value':true});
    Object.defineProperty(window, 'onClient', {'value':false});

    /*
    var cookies = {};
 
    var reqCookies = (request.headers.cookie || '').split(';');
    reqCookies.forEach(function(c) {
        var cookie = c.split('=').map(Function.prototype.call,
            String.prototype.trim);
        if (cookie[0].length > 0 && cookie[1]) {
            cookies[cookie[0]] = cookie[1];
        }
    });

    var sendCookies = function() {
        var cs = [];
        for (var key in cookies) {
            cs[cs.length] = key + '=' + cookies[key];
        }
        res.setHeader('Set-Cookie', cs);
    };

    Object.defineProperty(window.document, 'cookie', {
        set: function(c) {
            var cookie = c.split('=');
            cookies[cookie[0]] = cookie[1];
            sendCookies();
        },
        get: function() {
            var cs = '';
            for (var key in cookies) {
                cs += key + '=' + cookies[key] + ';';
            }
            return cs;
        }
    });
    */

    var fs = require('fs');

    window.include = function(file) {
        var src;
        try {
            src = fs.sync.readFile(file, 'utf8');
        } catch (e) {
            var req = new XMLHttpRequest();
            req.open('GET', file, false);
            req.send();
            var src = req.responseText;
        }
        if (!src)
            throw 'Could not load file ' + file;
        return window.run(src);
    };
})();