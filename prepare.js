var jsdom = require('jsdom'),
    http = require('http'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    util = require('util'),
    cookify = require('./cookie'),
    memoize = require('memoizee'),
    UglifyJS = require('uglify-js');

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
    
var jqueryUrl = 'http://code.jquery.com/jquery.min.js';
var readExt = function(file) {
    return fs.readFileSync(path.join(__dirname, file), 'utf8');
};
var defaultJs = readExt('ext-default.js');
var defaultServer = defaultJs + readExt('ext-server.js');
var defaultClient = UglifyJS.minify(defaultJs + readExt('ext-client.js'),
    {fromString: true}).code;

function prepareWindow(window, req, res, scripts, fullRes) {
    window.require = require('./relativerequire');
    window.console = Object.create(console);
    window.console.log = window.console.info = window.console.error;
    window.request = req;
    
    if (fullRes) {
        window.response = Object.create(res);
    } else {
        window.response = {};
        var responseProps = ['setHeader', 'getHeader', 'removeHeader'];
        for (var i = 0; i < responseProps.length; i++) {
            var n = responseProps[i];
            window.response[n] = res[n];
        }
    }
    var _async = {
        scriptHold: 0,
        execFinished: false
    };
    window.response.hold = function() {
        _async.scriptHold++;
    };
    window.response.release = function() {
        _async.scriptHold--;
        if (_async.scriptHold === 0 && _async.execFinished && _async.onFinish) {
            _async.onFinish();
        }
    };
    
    window.response.data = {};

    cookify(window, req, res);

    for (var i = 0; i < scripts.length; i++) {
        window.run(scripts[i]);
    }
    
    return _async;
};

function include(window, scripts, before) {
    var insertNode = before;
    var parent = insertNode.parentNode;
    for (var i = 0; i < scripts.length; i++) {
        var node = window.document.createElement('script');
        for (var n in scripts[i]) {
            node[n] = scripts[i][n];
        }
        parent.insertBefore(node, insertNode);
    }
};

function parseExec(html, req, res, jquery, callback) {
    var asyncRes;
    var scripts = [jquery, defaultServer];

    var level = jsdom.level(3, 'html');
    level.languageProcessors = {
        server: function(element, code, filename) {
            var doc = element.ownerDocument, window = doc && doc.parentWindow;
            if (window) {
                if (!asyncRes) {
                    asyncRes = prepareWindow(window, req, res, scripts);
                }
                
                window.document.currentScript = element;
                
                try {
                    window.run(code, filename);
                } catch (e) {
                    element.raise(
                        'error', 'Running ' + filename + ' failed.',
                        {error: e, filename: filename}
                    );
                }
            }
        }
    };
  
    var window = jsdom.jsdom(html, level, {
        features: {
            FetchExternalResources: 'script',
            ProcessExternalResources: 'script'
        }
    }).parentWindow;
    window.document.currentScript = null;
    
    if (!asyncRes) {
        asyncRes = prepareWindow(window, req, res, scripts);
    }
    
    finish(asyncRes, window, req, callback);
};

function newExec(js, req, res, jquery, callback) {
    var scripts = [jquery, defaultServer];
    
    var level = jsdom.level(3, 'html');
    level.languageProcessors = {
        server: function(element, code, filename) {
            var doc = element.ownerDocument, window = doc && doc.parentWindow;
            if (window) {
                window.document.currentScript = element;
                
                try {
                    window.run(code, filename);
                } catch (e) {
                    element.raise(
                        'error', 'Running ' + filename + ' failed.',
                        {error: e, filename: filename}
                    );
                }
            }
        }
    };

    var window = jsdom.jsdom('<html>', level, {
        features: {
            FetchExternalResources: 'script',
            ProcessExternalResources: 'script'
        }
    }).parentWindow;
    var asyncRes = prepareWindow(window, req, res, scripts, true);
    window.document.write('');

    try {
        window.run(js);
    } catch (err) {
        window.close();
        callback(err);
        return;
    }
    
    finish(asyncRes, window, req, callback);
};

function copySome(obj, props) {
    var copy = {};
    props.forEach(function (prop) {
        copy[prop] = obj[prop];
    });
    return copy;
}

function finish(asyncRes, window, req, callback) {
    asyncRes.onFinish = function() {
        var scripts = window.document.getElementsByTagName('script');
        Array.prototype.forEach.call(scripts, function(script) {
            var type = (script.type || '').split('/');
            if (type[type.length - 1] === 'server') {
                if (type[0] !== 'client') {
                    script.innerHTML = '';
                    if (script.src)
                        script.src = '';
                }
                script.removeAttribute('type');
            }
        });

        var baseReq = copySome(window.request, ['httpVersion', 'headers',
            'trailers', 'url', 'method', 'httpVersionMajor', 'httpVersionMinor']);
        var prepareJs = defaultClient + ';request=' + JSON.stringify(baseReq)
            + ';response=' + JSON.stringify(window.response);

        if (scripts.length > 0) {
            include(window, [{src: jqueryUrl}, {text: prepareJs}], scripts[0]);
        }
        // TODO: remove empty body style tag
        
        var html = (window.document.doctype ? window.document.doctype : '')
            + window.document.outerHTML;
        window.close();
        callback(null, html);
    };
    
    asyncRes.execFinished = true;
    if (!asyncRes.scriptHold)
        asyncRes.onFinish();
}

var get = memoize(function(url, callback) {
    http.get(url, function (res) {
        var result = '';
        res.on('data', function (data) { result += data; });
        res.on('end', function () {
            callback(null, result);
        });
    }).on('error', function(err) {
        callback(err);
    });
}, { async: true });

module.exports = function(path, req, res, callback) {
    fs.readFile(path, 'utf8', function(err, data) {
        if (err) {
            callback(err);
        } else if (path.endsWith('.js.html')) {
            if (data.indexOf('<script') === -1) {
                callback(null, data);
            } else {
                get(jqueryUrl, function(err, jquery) {
                    parseExec(data, req, res, jquery, callback);
                });
            }
        } else if (path.endsWith('.html.js')) {
            get(jqueryUrl, function(err, jquery) {
                newExec(data, req, res, jquery, callback);
            });
        } else {
            callback(null, data);
        }
    });
};
