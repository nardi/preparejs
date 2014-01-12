module.exports = function(window, req, res) {
    var cookies = {};
    
    var reqCookies = (req.headers.cookie || '').split(';');
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
    
    window.cookie = {
        set: function(k, v) {
            if (v.toString())
                v = v.toString();
            cookies[k] = v;
            sendCookies();
        },
        get: function(k) {
            return cookies[k];
        },
        getAll: function() {
            return Object.create(cookies);
        }
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
};