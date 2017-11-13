'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var parseUrl = require('parseurl');

module.exports = Chain;

/**
 * Create a new middleware chain
 *
 * @public
 * @class Chain
 * @example
 * var chain = new Chain();
 * chain.use(function (req, res, next) { next(); })
 * chain.use('/err', function (req, res, next) { next(new Error('Foo')); })
 * chain.use('/abort', function (req, res, next) { next(false); })
 *
 * http.createServer((req, res) => {
 *    chain.handle(req, res, function done(err) {
 *       res.end(err ? err.message : 'hello world');
 *    });
 * })
 */
function Chain() {
    EventEmitter.call(this);

    this.route = '/';
    this.stack = [];
}

util.inherits(Chain, EventEmitter);

/**
 * Static methods
 * @private
 */

/**
 * Invoke a route handle.
 *
 * @private
 * @param {Function} handle - handler function
 * @param {Object} route - middleware path, not equal with req.route
 * @param {Error|false|*} err - error, abort when true value or false
 * @param {Request} req - request
 * @param {Response} res - response
 * @param {Function} _next - next handler
 * @returns {undefined} no return value
 */
Chain.call = function call(handle, route, err, req, res, _next) {
    var arity = handle.length;
    var error = err;
    var hasError = err === false || Boolean(err);

    // Meassure handler timings
    // _name is assigned in the server and router
    req._currentHandler = handle._name;
    req.startHandlerTimer(handle._name);

    function next(nextErr) {
        req.endHandlerTimer(handle._name);
        _next(nextErr, req, res);
    }

    try {
        if (hasError && arity === 4) {
            // error-handling middleware
            handle(err, req, res, next);
            return;
        } else if (!hasError && arity < 4) {
            // request-handling middleware
            handle(req, res, next);
            return;
        }
    } catch (e) {
        // replace the error
        error = e;
    }

    // continue
    next(error, req, res);
};

/**
 * Get get protocol + host for a URL.
 *
 * @private
 * @param {string} url - url
 * @returns {String|undefined} ?
 */
Chain.getProtohost = function getProtohost(url) {
    if (url.length === 0 || url[0] === '/') {
        return undefined;
    }

    var searchIndex = url.indexOf('?');
    var pathLength = searchIndex !== -1 ? searchIndex : url.length;
    var fqdnIndex = url.substr(0, pathLength).indexOf('://');

    return fqdnIndex !== -1
        ? url.substr(0, url.indexOf('/', 3 + fqdnIndex))
        : undefined;
};

/**
 * Public methods.
 * @private
 */

/**
 * Extract handlers from a middle instance
 *
 * @memberof Chain
 * @instance
 * @returns {Function[]} handlers
 */
Chain.prototype.extractHandlers = function extractHandlers() {
    return this.stack.map(function map(stackItem) {
        return stackItem.handle;
    });
};

/**
 * Utilize the given middleware `handle` to the given `route`,
 * defaulting to _/_. This "route" is the mount-point for the
 * middleware, when given a value other than _/_ the middleware
 * is only effective when that segment is present in the request's
 * pathname.
 *
 * For example if we were to mount a function at _/admin_, it would
 * be invoked on _/admin_, and _/admin/settings_, however it would
 * not be invoked for _/_, or _/posts_.
 *
 * @public
 * @memberof Chain
 * @instance
 * @param {String|Function|Server} route - route, callback or server
 * @param {Function|Server} fn - callback or server
 * @returns {Chain} for chaining
 */
Chain.prototype.use = function use(route, fn) {
    var handle = fn;
    var path = route;

    // default route to '/'
    if (typeof route !== 'string') {
        handle = route;
        path = '/';
    }

    // wrap sub-apps
    if (typeof handle.handle === 'function') {
        var server = handle;
        server.route = path;
        handle = function handleFn(req, res, next) {
            server.handle(req, res, next);
        };
    }

    // strip trailing slash
    if (path[path.length - 1] === '/') {
        path = path.slice(0, -1);
    }

    // add the middleware
    this.stack.push({ route: path, handle: handle });

    return this;
};

/**
 * Returns the number of handlers
 *
 * @public
 * @memberof Chain
 * @instance
 * @returns {Number} number of handlers in the stack
 */
Chain.prototype.count = function count() {
    return this.stack.length;
};

/**
 * Handle server requests, punting them down
 * the middleware stack.
 *
 * @public
 * @memberof Chain
 * @instance
 * @param {Request} req - request
 * @param {Response} res - response
 * @param {Function} done - final handler
 * @returns {undefined} no return value
 */
Chain.prototype.handle = function handle(req, res, done) {
    var index = 0;
    var protohost = Chain.getProtohost(req.url) || '';
    var removed = '';
    var slashAdded = false;
    var stack = this.stack;

    // store the original URL
    req.originalUrl = req.originalUrl || req.url;

    function next(err) {
        if (slashAdded) {
            req.url = req.url.substr(1);
            slashAdded = false;
        }

        if (removed.length !== 0) {
            req.url = protohost + removed + req.url.substr(protohost.length);
            removed = '';
        }

        // next callback
        var layer = stack[index++];

        // all done
        if (!layer) {
            setImmediate(done, err);
            return;
        }

        // route data
        var path = parseUrl(req).pathname || '/';
        var route = layer.route;

        // skip this layer if the route doesn't match
        if (
            path.toLowerCase().substr(0, route.length) !== route.toLowerCase()
        ) {
            next(err);
            return;
        }

        // skip if route match does not border "/", ".", or end
        var c = path.length > route.length && path[route.length];
        if (c && c !== '/' && c !== '.') {
            next(err);
            return;
        }

        // trim off the part of the url that matches the route
        if (route.length !== 0 && route !== '/') {
            removed = route;
            req.url =
                protohost + req.url.substr(protohost.length + removed.length);

            // ensure leading slash
            if (!protohost && req.url[0] !== '/') {
                req.url = '/' + req.url;
                slashAdded = true;
            }
        }

        // call the layer handle
        Chain.call(layer.handle, route, err, req, res, next);
    }

    next();
};
