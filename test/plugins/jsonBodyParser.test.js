'use strict';
/* eslint-disable func-names */

// core requires
var net = require('net');
var http = require('http');

// external requires
var assert = require('chai').assert;
var restify = require('../../lib/index.js');
var restifyClients = require('restify-clients');

// local files
var helper = require('../lib/helper');

// local globals
var SERVER;
var CLIENT;
var STRING_CLIENT;
var PORT;

describe('JSON body parser', function() {
    beforeEach(function(done) {
        SERVER = restify.createServer({
            dtrace: helper.dtrace,
            log: helper.getLog('server')
        });

        SERVER.listen(0, '127.0.0.1', function() {
            PORT = SERVER.address().port;
            CLIENT = restifyClients.createJsonClient({
                url: 'http://127.0.0.1:' + PORT,
                dtrace: helper.dtrace,
                retry: false
            });
            STRING_CLIENT = restifyClients.createStringClient({
                url: 'http://127.0.0.1:' + PORT,
                dtrace: helper.dtrace,
                retry: false,
                agent: false,
                contentType: 'application/json',
                accept: 'application/json'
            });

            done();
        });
    });

    afterEach(function(done) {
        CLIENT.close();
        STRING_CLIENT.close();
        SERVER.close(done);
    });

    it('should parse null JSON body', function(done) {
        SERVER.use(
            restify.plugins.jsonBodyParser({
                mapParams: true
            })
        );

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.params.id, 'foo');
            assert.equal(req.body, null);
            res.send();
            next();
        });

        STRING_CLIENT.post('/body/foo?name=markc', 'null', function(
            err,
            _,
            res
        ) {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            done();
        });
    });

    it('should parse empty JSON body', function(done) {
        SERVER.use(restify.plugins.jsonBodyParser());

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.params.id, 'foo');
            assert.deepEqual(req.body, {});
            res.send();
            next();
        });

        CLIENT.post('/body/foo', null, function(err, _, res) {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            done();
        });
    });

    it('should parse req.body and req.params independently', function(done) {
        SERVER.use(restify.plugins.jsonBodyParser());

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.params.id, 'foo');
            assert.equal(req.body.id, 'bar');
            assert.equal(req.body.name, 'alex');
            assert.notDeepEqual(req.body, req.params);
            res.send();
            next();
        });

        CLIENT.post(
            '/body/foo',
            {
                id: 'bar',
                name: 'alex'
            },
            function(err, _, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            }
        );
    });

    // we don't know it in the middlewares
    it('should fail to map array req.body onto req.params', function(done) {
        SERVER.use(
            restify.plugins.jsonBodyParser({
                mapParams: true
            })
        );

        SERVER.post('/body/:id', function(req, res, next) {
            // this handler should never be reached
            res.send();
            next();
        });

        CLIENT.post('/body/foo', [1, 2, 3], function(err, _, res) {
            assert.ok(err);
            assert.equal(err.name, 'InternalServerError');
            assert.equal(res.statusCode, 500);
            done();
        });
    });

    it('should assign req.body onto req.params', function(done) {
        SERVER.use(
            restify.plugins.jsonBodyParser({
                mapParams: true
            })
        );

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.params.id, 'foo');
            assert.equal(req.params.name, 'alex');
            assert.notDeepEqual(req.body, req.params);
            res.send();
            next();
        });

        CLIENT.post(
            '/body/foo',
            {
                id: 'bar',
                name: 'alex'
            },
            function(err, _, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            }
        );
    });

    it('should assign req.body to req.params', function(done) {
        SERVER.use(
            restify.plugins.jsonBodyParser({
                mapParams: true,
                overrideParams: true
            })
        );

        SERVER.post('/body/:id', function(req, res, next) {
            assert.deepEqual(req.params, {
                id: 'foo',
                name: 'alex'
            });
            assert.deepEqual(req.body, {
                id: 'bar',
                name: 'alex'
            });
            res.send();
            next();
        });

        CLIENT.post(
            '/body/foo',
            {
                id: 'bar',
                name: 'alex'
            },
            function(err, _, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            }
        );
    });

    it('should parse JSON body with reviver', function(done) {
        SERVER.use(
            restify.plugins.jsonBodyParser({
                reviver: function reviver(key, value) {
                    if (key === '') {
                        return value;
                    }
                    return value + value;
                }
            })
        );

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.params.id, 'foo');
            assert.equal(req.body.apple, 'redred');
            assert.equal(req.body.orange, 'orangeorange');
            assert.equal(req.body.banana, 'yellowyellow');
            res.send();
            next();
        });

        CLIENT.post(
            '/body/foo',
            {
                apple: 'red',
                orange: 'orange',
                banana: 'yellow'
            },
            function(err, _, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            }
        );
    });

    it('restify-GH-318 get request with body (default)', function(done) {
        SERVER.use(
            restify.plugins.bodyParser({
                mapParams: true
            })
        );

        SERVER.get('/getWithoutBody', function(req, res, next) {
            assert.notEqual(req.params.foo, 'bar');
            res.send();
            next();
        });

        var request =
            'GET /getWithoutBody HTTP/1.1\r\n' +
            'Content-Type: application/json\r\n' +
            'Content-Length: 13\r\n' +
            '\r\n' +
            '{"foo":"bar"}';

        var client = net.connect({ host: '127.0.0.1', port: PORT }, function() {
            client.write(request);
        });
        client.once('data', function(data) {
            client.end();
        });
        client.once('end', function() {
            done();
        });
    });

    it('restify-GH-318 get request with body (requestBodyOnGet=true)', function(
        done
    ) {
        SERVER.use(
            restify.plugins.bodyParser({
                mapParams: true,
                requestBodyOnGet: true
            })
        );

        SERVER.get('/getWithBody', function(req, res, next) {
            assert.equal(req.params.foo, 'bar');
            res.send();
            next();
        });

        var request =
            'GET /getWithBody HTTP/1.1\r\n' +
            'Content-Type: application/json\r\n' +
            'Content-Length: 13\r\n' +
            '\r\n' +
            '{"foo":"bar"}';

        var client = net.connect({ host: '127.0.0.1', port: PORT }, function() {
            client.write(request);
        });

        client.once('data', function(data) {
            client.end();
        });

        client.once('end', function() {
            done();
        });
    });

    it('restify-GH-774 utf8 corruption in body parser', function(done) {
        var slen = 100000;
        SERVER.use(restify.plugins.bodyParser());
        SERVER.post('/utf8', function(req, res, next) {
            assert.notOk(/\ufffd/.test(req.body.text));
            assert.equal(req.body.text.length, slen);
            res.send({ len: req.body.text.length });
            next();
        });

        // create a long string of unicode characters
        var tx = '';

        for (var i = 0; i < slen; ++i) {
            tx += '\u2661';
        }

        CLIENT.post('/utf8', { text: tx }, function(err, _, res) {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            done();
        });
    });

    it('restify-GH-149 limit request body size', function(done) {
        SERVER.use(restify.plugins.bodyParser({ maxBodySize: 1024 }));

        SERVER.post('/', function(req, res, next) {
            res.send(200, { length: req.body.length });
            next();
        });

        var opts = {
            hostname: '127.0.0.1',
            port: PORT,
            path: '/',
            method: 'POST',
            agent: false,
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked'
            }
        };
        var client = http.request(opts, function(res) {
            assert.equal(res.statusCode, 413);
            res.once('end', done);
            res.resume();
        });
        client.write(new Array(1028).join('x'));
        client.end();
    });

    it('restify-GH-149 limit request body size (json)', function(done) {
        SERVER.use(restify.plugins.bodyParser({ maxBodySize: 1024 }));

        SERVER.post('/', function(req, res, next) {
            res.send(200, { length: req.body.length });
            next();
        });

        var opts = {
            hostname: '127.0.0.1',
            port: PORT,
            path: '/',
            method: 'POST',
            agent: false,
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                'transfer-encoding': 'chunked'
            }
        };
        var client = http.request(opts, function(res) {
            assert.equal(res.statusCode, 413);
            res.once('end', done);
            res.resume();
        });
        client.write('{"a":[' + new Array(512).join('1,') + '0]}');
        client.end();
    });

    it('plugins-GH-6: should expose rawBody', function(done) {
        var payload = {
            id: 'bar',
            name: 'alex'
        };

        SERVER.use(restify.plugins.jsonBodyParser());

        SERVER.post('/body/:id', function(req, res, next) {
            assert.equal(req.rawBody, JSON.stringify(payload));
            assert.equal(req.body.id, 'bar');
            assert.equal(req.body.name, 'alex');
            res.send();
            next();
        });

        CLIENT.post('/body/foo', payload, done);
    });
});
