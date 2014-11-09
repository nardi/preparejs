#!/usr/bin/env node

var fs = require('fs'),
    prepare = require('./prepare'),
    url = require('url'),
    path = require('path'),
    http = require('http'),
    fcgi = require('fastcgi-server')
    connect = require('connect');    
    
var version = require('./package.json').version;

console.error('Welcome to Prepare.js version %s!', version);

process.on('uncaughtException', function(error) {
    console.error(error);
    process.exit();
});

var optimist = require('optimist')
    .usage('Usage:\tprepare [--http [port]|--fcgi [socket]] [path]\n'
        + '  Runs JavaScript on the server in a browser-like environment.\n'
        + '  If "path" is a file, executes it and writes the result to stdout.\n'
        + '  Otherwise, if it is a directory, starts a server with that directory as the root directory.')
    .alias('help', 'h')
    .describe({
        http: 'Run as HTTP server (default port 8080)',
        fcgi: 'Run as FastCGI server (default socket /tmp/prepare.sock)',
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
    fcgi: '/tmp/prepare.sock',
    http: 8080
};

var argPath = argv._[0] || '.';

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

    var processRequest = connect()
      .use(connect.logger('dev'))
      .use(prepare.middleware(process.cwd()))
      .use(connect.static(process.cwd()));

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
        console.error('FastCGI server listening on socket %s...', listen);
    else
        console.error('HTTP server listening on port %d...', listen);
}