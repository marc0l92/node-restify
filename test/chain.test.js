'use strict';
/* eslint-disable func-names */

var Chain = require('../lib/chain');

if (require.cache[__dirname + '/lib/helper.js']) {
    delete require.cache[__dirname + '/lib/helper.js'];
}
var helper = require('./lib/helper.js');

///--- Globals

var test = helper.test;

test('calls all the handlers', function(t) {
    var chain = new Chain();
    var counter = 0;

    chain.use(function(req, res, next) {
        counter++;
        next();
    });
    chain.use(function(req, res, next) {
        counter++;
        next();
    });
    chain.handle(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {}
        },
        {},
        function() {
            t.equal(counter, 2);
            t.done();
        }
    );
});

test('abort with Error in next', function(t) {
    var chain = new Chain();
    var counter = 0;
    var myError = new Error('Foo');

    chain.use(function(req, res, next) {
        counter++;
        next(myError);
    });
    chain.use(function(req, res, next) {
        counter++;
        next();
    });
    chain.handle(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {}
        },
        {},
        function(err) {
            t.deepEqual(err, myError);
            t.equal(counter, 1);
            t.done();
        }
    );
});

test('abort with false in next', function(t) {
    var chain = new Chain();
    var counter = 0;

    chain.use(function(req, res, next) {
        counter++;
        next(false);
    });
    chain.use(function(req, res, next) {
        counter++;
        next();
    });
    chain.handle(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function() {}
        },
        {},
        function(err) {
            t.equal(err, false);
            t.equal(counter, 1);
            t.done();
        }
    );
});

test('calls req.startHandlerTimer', function(t) {
    var chain = new Chain();

    chain.use(function foo(req, res, next) {
        next();
    });

    chain.handle(
        {
            startHandlerTimer: function(handleName) {
                t.equal(handleName, 'foo');
                t.done();
            },
            endHandlerTimer: function() {}
        },
        {},
        function() {}
    );
});

test('calls req.endHandlerTimer', function(t) {
    var chain = new Chain();

    chain.use(function foo(req, res, next) {
        next();
    });

    chain.handle(
        {
            startHandlerTimer: function() {},
            endHandlerTimer: function(handleName) {
                t.equal(handleName, 'foo');
                t.done();
            }
        },
        {},
        function() {}
    );
});

test('count returns with the number of registered handlers', function(t) {
    var chain = new Chain();
    chain.use(function(req, res, next) {});
    chain.use(function(req, res, next) {});
    t.equal(chain.count(), 2);
    t.end();
});

test('extractHandlers returns with the array of handlers', function(t) {
    var chain = new Chain();
    var handlers = [function(req, res, next) {}, function(req, res, next) {}];
    chain.use(handlers[0]);
    chain.use(handlers[1]);
    t.deepEqual(chain.extractHandlers(), handlers);
    t.end();
});
