'use strict';

module.exports = Chain;

/**
 * Create a new middleware chain
 *
 * @public
 * @class Chain
 * @example
 * var chain = new Chain();
 * chain.use(function (req, res, next) { next(); })
 * // chain.use(function (req, res, next) { next(new Error('Foo')); })
 * // chain.use(function (req, res, next) { next(false); })
 *
 * http.createServer((req, res) => {
 *    chain.handle(req, res, function done(err) {
 *       res.end(err ? err.message : 'hello world');
 *    });
 * })
 */
function Chain() {
    this.stack = [];
}

/**
 * Static methods
 * @private
 */

/**
 * Invoke a handler.
 *
 * @private
 * @param {Function} handle - handler function
 * @param {Error|false|*} err - error, abort when true value or false
 * @param {Request} req - request
 * @param {Response} res - response
 * @param {Function} _next - next handler
 * @returns {undefined} no return value
 */
Chain.call = function call(handle, err, req, res, _next) {
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
 * Utilize the given middleware `handle`
 *
 * @public
 * @memberof Chain
 * @instance
 * @param {Function|Chain} handle - handler or Chain instance
 * @returns {undefined} no return value
 */
Chain.prototype.use = function use(handle) {
    // wrap sub-apps
    if (typeof handle.handle === 'function') {
        var server = handle;
        handle = function handleFn(req, res, next) {
            server.handle(req, res, next);
        };
    }

    // _name is assigned in the server and router
    handle._name = handle._name || handle.name;

    // add the middleware
    this.stack.push({ handle: handle });
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
    var stack = this.stack;

    function next(err) {
        // next callback
        var layer = stack[index++];

        // all done
        if (!layer) {
            setImmediate(done, err, req, res);
            return;
        }

        // call the layer handle
        Chain.call(layer.handle, err, req, res, next);
    }

    next();
};
