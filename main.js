#!/usr/bin/env node

var fs = require('fs'),
    prepare = require('./prepare'),
    url = require('url'),
    path = require('path'),
    http = require('http'),
    fcgi = require('node-fastcgi')
    connect = require('connect'),
    connect.logger = require('morgan'),
    connect.static = require('serve-static'),
    connect.bodyParser = require('body-parser'),
    Module = require('module');
    
Array.prototype.flatten = function() {
    return Array.prototype.concat.apply([], this);
};
    
var version = require('./package.json').version;

console.error('Welcome to Prepare.js version %s!', version);

process.on('uncaughtException', function(error) {
    console.error(error);
    process.exit(1);
});

var optimist = require('optimist')
    .usage('Usage:\tprepare [--http [port]|--fcgi [socket]] [--path/-p path]\n'
        + '  Runs JavaScript on the server in a browser-like environment.\n'
        + '  If "path" is a file, executes it and writes the result to stdout.\n'
        + '  Otherwise, if it is a directory, starts a server with that directory as the root directory.')
    .alias('help', 'h')
	.alias('path', 'p')
    .describe({
	    path: 'File/directory to work with',
        http: 'Run as HTTP server (optional: port to listen on, default is 8080)',
        fcgi: 'Run as FastCGI server (optional: socket to listen on, default is file descriptor 0)',
        help: 'Display this message'
    }),
    argv = optimist.argv;

if (argv.http && argv.fcgi) {
    console.error(optimist.help());
    throw 'Cannot run in both HTTP and FastCGI mode.';
}

if (argv.help) {
    console.error(optimist.help());
    process.exit();
}

var defaults = {
    fcgi: { fd: 0 },
    http: 8080
};

var argPath = argv.path || '.';

var stats = fs.statSync(argPath);
if (stats.isFile()) {
    prepare({
        file: argPath,
        callback: function (err, html) {
            console.log(html);
        }
    });
} else if (stats.isDirectory()) {
    process.chdir(argPath);
    if (path.dirname(path.resolve(argPath)) !== 'public') {
        try {
            process.chdir('public');
        } catch (e) {}
    }
    
    console.error('Hosting server in ' + process.cwd());

    var isDirectory = function(file) {
        return fs.existsSync(file) && fs.statSync(file).isDirectory();
    }
    
    var modulePaths = Module._nodeModulePaths(process.cwd()).filter(isDirectory)
        .map(function(dir) {
            return fs.readdirSync(dir).map(function(file) {
                return path.join(path.resolve(dir, file), 'public');
            }).filter(isDirectory);
        }).flatten();

    var paths = [process.cwd()].concat(modulePaths);
    
    var processRequest = connect()
        .use(connect.logger('dev'))
        .use(connect.bodyParser.urlencoded({ extended: true }));
    
    paths.forEach(function(path) {
        processRequest = processRequest.use(prepare.middleware(path));
    });
    
    paths.forEach(function(path) {
        processRequest = processRequest.use(connect.static(path));
    });

    var server, listen;
    if (argv.fcgi) {
        server = fcgi;
        listen = typeof argv.fcgi === 'string' ? argv.fcgi : defaults.fcgi;
    } else {
        server = http;
        listen = typeof argv.http === 'number' ? argv.http : defaults.http;
    }
    server.createServer(processRequest).listen(listen);
    
    if (argv.fcgi)
        console.error('FastCGI server listening on %s...', typeof listen.fd === 'number' ? 'file descriptor ' + listen.fd : 'socket ' + listen);
    else
        console.error('HTTP server listening on port %d...', listen);
}