/* == Dependency includes == */
var jsdom = require('jsdom'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),
    UglifyJS = require('uglify-js'),
    fibrous = require('fibrous'),
    Module = require('module');

/* === Utility functions === */

// Checks whether a string ends with the specified substring
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

// Converts a string into a plain but readable HTML format.
function toHtml(str) {
    return str.replace(/\n/g, '<br/>').replace(/\t/g, '&emsp;&emsp;').replace(/ /g, '&nbsp;');
}

// Converts a path into a file:/// url.
function pathToFileUrl(p) {
    p = p.replace(/\\/g, '/');
    if (p[0] !== '/') {
      p = '/' + p;
    }
    return 'file://' + p;
}

// Joins the arguments into a path, and reads that file (as utf8).
function readFile() {
    return fs.readFileSync(path.join.apply(path, arguments), 'utf8');
}

// Copies the "props" properties from object "obj" into a new object.
function copySome(obj, props) {
    var copy = {};
    props.forEach(function (prop) {
        copy[prop] = obj[prop];
    });
    return copy;
}

// Includes scripts in a document, before a certain node.
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

/* ==== The Prepare preprocessor ==== */

// Default environment setup scripts for client and server.
var env = { 
    server: readFile(__dirname, 'env', 'server.js'),
    client: UglifyJS.minify(readFile(__dirname, 'env', 'client.js'), {fromString: true}).code
};

var NO_FILE_TO_PROCESS = new Error('No file to process');

// The main Prepare function. Processes a .js.html file, executing server-side scripts as specified,
// or a .html.js file, which is executed in the context of an empty DOM, leaving the user to fill it
// in any way possible (or just directly write a response).
var prepare = module.exports = function(options, callback) {
    var req = options.req, res = options.res,
        dir = options.dir || options.directory || '',
        src = options.src || options.source,
        callback = callback || options.callback;

    var reqpath = options.file || (req ? '.' + url.parse(req.url).pathname : '');

    var html, script;
    if (src) {
        html = src;
    } else {
        try {
            if (reqpath.endsWith('.js.html')) {
                html = readFile(dir, reqpath);
            } else if (reqpath.endsWith('.html.js')) {
                script = readFile(dir, reqpath);
                html = '<html>';
            } else {
                callback(NO_FILE_TO_PROCESS);
                return;
            }
        } catch (e) {
            callback(NO_FILE_TO_PROCESS);
            return;
        }
    }

    // Indicates whether the scripts on the page have finished running.
    var responseState;
    var errors = [];

    // Set up the DOM level object for executing server-side script elements.
    var level = jsdom.level(3, 'html');
    var filename = path.resolve(dir, reqpath);
    var processScript = function(element, code, src) {
        var type = (element.type || '').split('/');
        if (type.indexOf('server') != -1) {
            var doc = element.ownerDocument, window = doc && doc.parentWindow;
            if (window) {
                if (!responseState) {
                    // Prepare the window (just in time) for script execution.
                    responseState = prepareWindow(window, filename, req, res, !!script);
                }
                
                // Set up the currentScript property, so the code can find the element it belongs to.
                window.document.currentScript = element;
                
                try {
                    window.run(code, src);
                } catch (e) {
                    element.raise(
                        'error', 'Running ' + src + ' failed.',
                        {error: e, filename: src}
                    );
                    errors.push(e);
                }
            }
        }
    };
    level.languageProcessors = {
        server: processScript,
        client: processScript,
        keep: processScript
    };
    
    // Run inside a fiber for synchronous code execution support.
    fibrous.run(function() {
        try {
            // Construct a window, executing all the script tags inside as well.
            var window = jsdom.jsdom(html, level, {
                features: {
                    FetchExternalResources: 'script',
                    ProcessExternalResources: 'script'
                },
                url: pathToFileUrl(filename)
            }).parentWindow;

            // Remove the currentScript property, so asynchronous scripts won't think they're actually the last one.
            delete window.document.currentScript;
        
            // If no scripts have been executed, set up the environment anyway, so "finish" works correctly (for the client side).
            if (!responseState) {
                responseState = prepareWindow(window, filename, req, res, !!script);
            }

            if (script) {
                window.document.write('');
                window.run(script);
            }

            finish(responseState, window, req, errors, callback);
        } catch (e) {
            window.close();
            callback(e);
            return;
        }
    });
};

// This is the function that adds additional properties to the window object to make sure it is able to handle user code.
// Because some scripts are run to set up the correct environment, the window object must be fully constructed before this function is executed. 
function prepareWindow(window, filename, req, res, fullResponse) {
    window.require = new Module(filename, module).require;
    window.console = Object.create(console);
    window.console.log = window.console.info = window.console.error;
    window.request = req;
    
    if (fullResponse) {
        window.response = Object.create(res);
    } else {
        window.response = {};
        var responseProps = ['setHeader', 'getHeader', 'removeHeader'];
        for (var i = 0; i < responseProps.length; i++) {
            var n = responseProps[i];
            window.response[n] = res[n];
        }
    }
    var _res = {
        scriptHold: 0,
        execFinished: false
    };
    window.response.hold = function() {
        _res.scriptHold++;
    };
    window.response.release = function() {
        _res.scriptHold--;
        if (_res.scriptHold === 0 && _res.execFinished && _res.onFinish) {
            _res.onFinish();
        }
    };

    // Make sure the response is held until the window is fully loaded.
    window.response.hold();
    window.addEventListener('load', function() {
        window.response.release();
    });
    
    window.response.data = {};

    window.run(env.server);
    
    return _res;
};

// Collects the final document from the window object, cleans it up, and returns it to the caller.
function finish(responseState, window, req, errors, callback) {
    // Set a handler function for when all scripts have finished execution.
    responseState.onFinish = function() {
        if (errors.length > 0) {
            window.close();
            callback(errors);
            return;
        }

        var scripts = window.document.getElementsByTagName('script');

        // Remove server-side code from the document.
        Array.prototype.forEach.call(scripts, function(script) {
            var type = (script.type || '').split('/');
            var server = type.indexOf('server') != -1,
                client = type.indexOf('client') != -1;
            if (server || client) {
                script.removeAttribute('type');
                if (!client) {
                    if (type.indexOf('keep') != -1) {
                        script.innerHTML = '';
                        script.removeAttribute('src');
                    } else {
                        script.parentNode.removeChild(script);
                    }
                }
            }
        });

        scripts = window.document.getElementsByTagName('script');
        
        // Copy abridged request and response objects to the client.
        if (scripts.length > 0) {
            var baseReq = copySome(window.request, ['httpVersion', 'headers',
                'trailers', 'url', 'method', 'httpVersionMajor', 'httpVersionMinor']);
            var prepareJs = env.client + 'request=' + JSON.stringify(baseReq)
                + ';response=' + JSON.stringify(window.response);

            include(window, [{text: prepareJs}], scripts[0]);
        }
        // TODO: remove empty body style tag
        
        // Render the HTML into a string, free resources, and return.
        var doctype = (window.document.doctype ? window.document.doctype : '');
        var html = doctype + window.document.outerHTML;
        window.close();
        callback(null, html);
    };
    
    // If the response has not been held, execute the finish handler immediately.
    responseState.execFinished = true;
    if (!responseState.scriptHold)
        responseState.onFinish();
}

// This returns a "middleware" function relative to the specified directory,
// for use with systems like ''connect''.
prepare.middleware = function(dir) {
    return function(req, res, next) {
        prepare({
            req: req,
            res: res,
            dir: dir,
            callback: function(err, html) {
                if (err) {
                    if (err === NO_FILE_TO_PROCESS) {
                        next();
                    } else {
                        res.statusCode = 500;
                        if (err.length) {
                            err.forEach(function (e) {
                                res.write('<p>' + toHtml((e.stack || e).toString()) + '</p>');
                            });
                            res.end();
                        } else {
                            res.end('<p>' + toHtml((err.stack || err).toString()) + '</p>');
                        }
                    }
                } else {
                    res.end(html);
                }
            }
        });
    };
};