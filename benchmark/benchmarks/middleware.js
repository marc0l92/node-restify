'use strict';

var restify = process.argv.includes('version=head')
    ? require('../../lib')
    : require('restify');

var server = restify.createServer();
var path = '/';
var port = 3000;

module.exports = {
    url: 'http://localhost:' + port + path
};

server.pre(function pre(req, res, next) {
    next();
});

server.pre(function pre(req, res, next) {
    next();
});

server.pre(function pre(req, res, next) {
    next();
});

server.use(function use(req, res, next) {
    next();
});

server.use(function use(req, res, next) {
    next();
});

server.use(function use(req, res, next) {
    next();
});

server.on('after', function after() {});

server.on('after', function after() {});

server.get(path, function onRequest(req, res) {
    res.send('hello world');
});

if (!module.parent) {
    server.listen(port);
}
