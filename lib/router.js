// Copyright 2012 Mark Cavage, Inc.  All rights reserved.

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var http = require('http');

var _ = require('lodash');
var assert = require('assert-plus');
var errors = require('restify-errors');
var FindMyWay = require('find-my-way');

var Chain = require('./chain');
var dtrace = require('./dtrace');

///--- Globals

var MethodNotAllowedError = errors.MethodNotAllowedError;
var ResourceNotFoundError = errors.ResourceNotFoundError;

///--- API

/**
 * Router class handles mapping of http verbs and a regexp path,
 * to an array of handler functions.
 *
 * @class
 * @public
 * @param  {Object} options - an options object
 * @param  {Bunyan} options.log - Bunyan logger instance
 * @param  {Boolean} [options.strictRouting] - strict routing
 */
function Router(options) {
    assert.object(options, 'options');
    assert.object(options.log, 'options.log');

    EventEmitter.call(this);

    this.strict = Boolean(options.strictRouting);
    this.log = options.log;
    this.mounts = {};
    this.name = 'RestifyRouter';
    this._anonymusHandlerCounter = 0;

    // Internals
    this.mounts = {};
    this.findMyWay = new FindMyWay({
        defaultRoute: this.defaultRoute.bind(this)
    });
}
util.inherits(Router, EventEmitter);

/**
 * Returns true if the router generated a 404 for an options request.
 *
 * TODO: this is relevant for CORS only. Should move this out eventually to a
 * userland middleware? This also seems a little like overreach, as there is no
 * option to opt out of this behavior today.
 *
 * @private
 * @static
 * @function optionsError
 * @param    {Object}     req - the request object
 * @param    {Object}     res - the response object
 * @returns  {Boolean} is options error
 */
Router.optionsError = function optionsError(req, res) {
    var pathname = req.getUrl().pathname;
    return req.method === 'OPTIONS' && pathname === '*';
};

/**
 * Default route, when no route found
 * Responds with a ResourceNotFoundError error.
 *
 * @private
 * @memberof Router
 * @instance
 * @function defaultRoute
 * @param  {Request} req - request
 * @param  {Response} res - response
 * @param  {Function} next - next
 * @returns {undefined} no return value
 */
Router.prototype.defaultRoute = function defaultRoute(req, res, next) {
    var self = this;
    var pathname = req.getUrl().pathname;

    // Allow CORS
    if (Router.optionsError(req, res, pathname)) {
        res.send(200);
        next(null, req, res);
        return;
    }

    // Check for 405 instead of 404
    var allowedMethods = http.METHODS.filter(function some(method) {
        return self.findMyWay.find(method, pathname);
    });

    if (allowedMethods.length) {
        res.methods = allowedMethods;
        res.setHeader('Allow', allowedMethods.join(', '));
        var methodErr = new MethodNotAllowedError(
            '%s is not allowed',
            req.method
        );
        next(methodErr, req, res);
        return;
    }

    // clean up the url in case of potential xss
    // https://github.com/restify/node-restify/issues/1018
    var err = new ResourceNotFoundError('%s does not exist', pathname);
    next(err, req, res);
};

/**
 * Lookup for route
 *
 * @public
 * @memberof Router
 * @instance
 * @function lookup
 * @param  {Request} req - request
 * @param  {Response} res - response
 * @param  {Function} next - only called when next is called in the last handler
 * @returns {undefined} no return value
 */
Router.prototype.lookup = function lookup(req, res, next) {
    var self = this;
    var url = req.getUrl().pathname;

    // Find find-my-way (fmw) route
    self._dtraceStart(req);
    var fmwRoute = self.findMyWay.find(req.method, url);
    self._dtraceEnd(req, res);

    // Not found
    if (!fmwRoute) {
        self.defaultRoute(req, res, function afterRouter(err) {
            next(err, req, res);
        });
        return;
    }

    // Decorate req
    req.params = Object.assign(req.params, fmwRoute.params);
    req.route = fmwRoute.store.route;

    // Emit routed
    self.emit('routed', req, res, req.route);

    // Call handler chain
    fmwRoute.handler(req, res, next);
};

/**
 * Lookup by name
 *
 * @public
 * @memberof Router
 * @instance
 * @function lookupByName
 * @param {String} name - route name
 * @param  {Request} req - request
 * @param  {Response} res - response
 * @param  {Function} next - only called when next is called in the last handler
 * @returns {undefined} no return value
 */
Router.prototype.lookupByName = function lookupByName(name, req, res, next) {
    var self = this;
    var route = self.mounts[name];

    if (!route) {
        self.defaultRoute(req, res);
        return;
    }

    // Decorate req
    req.route = route;

    route.chain.handle(req, res, next);
};

/**
 * Adds a route.
 *
 * @public
 * @memberof Router
 * @instance
 * @function mount
 * @param    {Object} opts - an options object
 * @param    {String} opts.name - name
 * @param    {String} opts.method - method
 * @param    {String} opts.path - path
 * @param    {Function[]} handlers - handlers
 * @returns  {String} returns the route name if creation is successful.
 * @fires ...String#mount
 */
Router.prototype.mount = function mount(opts, handlers) {
    var self = this;

    assert.object(opts, 'opts');
    assert.string(opts.method, 'opts.method');
    assert.string(opts.name, 'opts.name');
    assert.arrayOfFunc(handlers, 'handlers');

    var chain = new Chain();
    var path = opts.path;

    // Convert RegExp to String for find-my-way
    // TODO: revisit, consider changing RegExp API
    if (_.isRegExp(path)) {
        path = path.source.replace(/\\/g, '');

        if (path[0] === '^') {
            path = path.substring(1);
        }
    }

    // Route
    var route = {
        name: opts.name,
        method: opts.method,
        path: path,
        spec: opts,
        chain: chain
    };

    handlers.forEach(function forEach(handler) {
        // Assign name to anonymus functions
        handler._name =
            handler.name || 'handler-' + self._anonymusHandlerCounter++;

        // Attach to middleware chain
        chain.use(handler);
    });

    self.findMyWay.on(
        route.method,
        route.path,
        function onRoute(req, res, next) {
            chain.handle(req, res, next);
        },
        {
            route: route
        }
    );

    // Store route
    self.mounts[route.name] = route;
    self.emit('mount', route.method, route.path);

    return route;
};

/**
 * Unmounts a route.
 *
 * @public
 * @memberof Router
 * @instance
 * @function unmount
 * @param    {String} name - the route name
 * @returns  {String}        the name of the deleted route.
 */
Router.prototype.unmount = function unmount(name) {
    assert.string(name, 'name');

    var route = this.mounts[name];

    if (route) {
        // TODO: revisit
        throw new Error('Unmount is not implemented');
        // this.findMyWay.off(route.method, route.path);
        // delete this.mounts[name];
    }

    return name;
};

/**
 * toString() serialization.
 *
 * @public
 * @memberof Router
 * @instance
 * @function toString
 * @returns  {String} stringified router
 */
Router.prototype.toString = function toString() {
    return this.findMyWay.prettyPrint();
};

/**
 * Return information about the routes registered in the router.
 *
 * @public
 * @memberof Router
 * @instance
 * @returns {object} The routes in the router.
 */
Router.prototype.getDebugInfo = function getDebugInfo() {
    return _.mapValues(this.mounts, function mapValues(route, routeName) {
        return {
            name: route.name,
            method: route.method.toLowerCase(),
            path: route.path,
            handlers: route.chain.extractHandlers()
        };
    });
};

/**
 * Setup request and calls _onRequest to run middlewares and call router
 *
 * @private
 * @memberof Router
 * @instance
 * @function _dtraceStart
 * @param    {Request}    req - the request object
 * @returns  {undefined} no return value
 * @fires Request,Response#request
 */
Router.prototype._dtraceStart = function _dtraceStart(req) {
    if (!req.dtrace) {
        return;
    }

    dtrace._rstfy_probes['route-start'].fire(function fire() {
        return [
            req.serverName,
            req.route.name,
            req._dtraceId,
            req.method,
            req.href(),
            req.headers
        ];
    });
};

/**
 * Setup request and calls _onRequest to run middlewares and call router
 *
 * @private
 * @memberof Router
 * @instance
 * @function _dtraceEnd
 * @param    {Request}    req - the request object
 * @param    {Response}    res - the response object
 * @returns  {undefined} no return value
 * @fires Request,Response#request
 */
Router.prototype._dtraceEnd = function _dtraceEnd(req, res) {
    if (!req.dtrace) {
        return;
    }

    dtrace._rstfy_probes['route-done'].fire(function fire() {
        return [
            req.serverName,
            req.route.name,
            req._dtraceId,
            res.statusCode || 200,
            res.headers()
        ];
    });
};

module.exports = Router;
