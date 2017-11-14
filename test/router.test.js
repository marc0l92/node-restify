'use strict';
/* eslint-disable func-names */

var restify = require('../lib');
var Router = require('../lib/router');
var clients = require('restify-clients');

if (require.cache[__dirname + '/lib/helper.js']) {
    delete require.cache[__dirname + '/lib/helper.js'];
}
var helper = require('./lib/helper.js');

///--- Globals

var test = helper.test;
var mockReq = {
    params: {},
    startHandlerTimer: function() {},
    endHandlerTimer: function() {}
};
var mockRes = {
    setHeader: function() {},
    send: function() {}
};

///--- Tests

test('clean up xss for 404', function(t) {
    var server = restify.createServer();

    server.listen(3000, function(listenErr) {
        t.ifError(listenErr);

        var client = clients.createStringClient({
            url: 'http://127.0.0.1:3000/'
        });

        client.get(
            {
                path:
                    '/no5_such3_file7.pl?%22%3E%3Cscript%3Ealert(73541);%3C/' +
                    'script%3E',
                headers: {
                    connection: 'close'
                }
            },
            function(clientErr, req, res, data) {
                t.ok(clientErr);
                t.ok(
                    data.indexOf('%22%3E%3Cscript%3Ealert(73541)') === -1,
                    'should not reflect raw url'
                );

                server.close(function() {
                    t.end();
                });
            }
        );
    });
});

test('lookupByName runs a route by name and calls next', function(t) {
    var router = new Router({
        log: {}
    });
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            res.send('hello world');
        }
    ]);

    router.lookupByName(
        'my-route',
        mockReq,
        Object.assign({}, mockRes, {
            send: function(data) {
                t.equal(data, 'hello world');
                t.end();
            }
        })
    );
});

test('lookupByName calls next with err', function(t) {
    var router = new Router({
        log: {}
    });
    var myErr = new Error('My Error');
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            next(myErr);
        }
    ]);

    router.lookupByName('my-route', mockReq, mockRes, function next(err) {
        t.deepEqual(err, myErr);
        t.end();
    });
});

test('lookup runs a route chain by path and calls next', function(t) {
    var router = new Router({
        log: {}
    });
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            res.send('Hello world');
            next(); // no _afterRoute without next()
        }
    ]);

    router.lookup(
        Object.assign(
            {
                getUrl: function() {
                    return { pathname: '/' };
                },
                method: 'GET'
            },
            mockReq
        ),
        mockRes,
        function next(err) {
            t.ifError(err);
            t.end();
        }
    );
});

test('lookup calls next with err', function(t) {
    var router = new Router({
        log: {}
    });
    var myErr = new Error('My Error');
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            next(myErr);
        }
    ]);

    router.lookup(
        Object.assign(
            {
                getUrl: function() {
                    return { pathname: '/' };
                },
                method: 'GET'
            },
            mockReq
        ),
        mockRes,
        function next(err) {
            t.deepEqual(err, myErr);
            t.end();
        }
    );
});

test('lookup emits routed when route found', function(t) {
    var router = new Router({
        log: {}
    });
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            res.send('Hello world');
            next(); // no _afterRoute without next()
        }
    ]);

    router.on('routed', function(req, res, route) {
        t.end();
    });

    router.lookup(
        Object.assign(
            {
                getUrl: function() {
                    return { pathname: '/' };
                },
                method: 'GET'
            },
            mockReq
        ),
        mockRes,
        function next() {}
    );
});

test('route handles 404', function(t) {
    var router = new Router({
        log: {}
    });
    router.lookup(
        Object.assign(
            {
                getUrl: function() {
                    return { pathname: '/' };
                },
                method: 'GET'
            },
            mockReq
        ),
        mockRes,
        function next(err) {
            t.equal(err.statusCode, 404);
            t.end();
        }
    );
});

test('route handles method not allowed (405)', function(t) {
    var router = new Router({
        log: {}
    });
    router.mount({ method: 'GET', path: '/', name: 'my-route' }, [
        function(req, res, next) {
            res.send('Hello world');
        }
    ]);

    router.lookup(
        Object.assign(
            {
                getUrl: function() {
                    return { pathname: '/' };
                },
                method: 'POST'
            },
            mockReq
        ),
        mockRes,
        function next(err) {
            t.equal(err.statusCode, 405);
            t.end();
        }
    );
});
