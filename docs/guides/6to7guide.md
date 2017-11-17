---
title: restify 6.x to 7.x migration guide
permalink: /docs/6to7/
---

## Introduction

restify `7.x` comes with a completely new router and middleware logic that
brings significant performance improvement to your application.
From `v7.0.0` restify uses the Radix Tree based
[find-my-way](https://github.com/delvedor/find-my-way) package as a router
backend.

## Breaking Changes

### `req.params` property is not available in `use` and `pre`

`req.params` is only available in route handlers and in `after` handlers.
Earlier route was resolved before any handlers and `req.params` were available
in `pre` and `use` handlers.

It has also effect to the `bodyParser` and `queryParser` params mapping as
router params will have a higher precedence in the case of overlapping
properties.

```js
var server = restify.createServer()
server.pre(function(req, res, next) {
    // req.params is NOT available here
    next();
});
server.use(function(req, res, next) {
    // req.params is NOT available here
    next();
});
server.on('after', function() {
    // req.params is available here
});
server.get('/:userId', function(req, res, next) {
    // req.params is available here
    res.send({ params: req.params });
    next();
);
```

### Non-strict routing is gone

Option `strictRouting` is removed `createServer({ strictRouting: false })`.
Strict routing is the new default.

### Limited `RegExp` usage in router path

restify's new router backend
[find-my-way](https://github.com/delvedor/find-my-way) has limited RegExp
support.

#### Guide to define paths

To register a **parametric** path, use the *colon* before the parameter name.
For **wildcard** use the *star*.
*Remember that static routes are always inserted before parametric and wildcard.*

```js
// parametric
server.get('GET', '/example/:userId', (req, res, next) => {}))
server.get('GET', '/example/:userId/:secretToken', (req, res, next) => {}))

// wildcard
server.get('GET', '/example/*', (req, res, next) => {}))
```

Regular expression routes are supported as well, but pay attention, RegExp are
very expensive in term of performance!

```js
// parametric with RegExp
server.get('GET', '/example/:file(^\\d+).png', () => {}))
```

It's possible to define more than one parameter within the same couple of slash
("/"). Such as:

```js
server.get('/example/near/:lat-:lng/radius/:r', (req, res, next) => {}))
```

*Remember in this case to use the dash ("-") as parameters separator.*

Finally it's possible to have multiple parameters with RegExp.

```js
server.get('/example/at/:hour(^\\d{2})h:minute(^\\d{2})m', (req, res, next) => {
  // req.params => { hour: 12, minute: 15 }
}))
```
In this case as parameter separator it's possible to use whatever character is
not matched by the regular expression.

Having a route with multiple parameters may affect negatively the performance,
so prefer single parameter approach whenever possible, especially on routes
which are on the hot path of your application.

Fore more info see: https://github.com/delvedor/find-my-way

### Remove already deprecated `next.ifError`

`next.ifError(err)` is not available anymore.

### Disable DTrace probes by default

DTrace probes comes with some performance impact that's fine for the sake of
observability but you may don't use it at all.

### Removed `strictNext` server option

Earlier restify through an error with `strictNext` option when a `next()`
function was called more than once. This option is not available in the new
version.

```js
restify.createServer({ dtrace: true })
```

### Router versioning and content type

`accept-version` and `accept` based conditional routing moved to the
`conditioalHandler` plugin, see docs or example:

```js
var server = restify.createServer()

server.use(restify.plugins.conditionalHandler({
   contentType: 'application/json',
   version: '1.0.0'
   handler: function (req, res, next) {
       next();
   })
});

server.get('/hello/:name', restify.plugins.conditionalHandler([
  {
     version: '1.0.0',
     handler: function(req, res, next) { res.send('1.x') }
  },
  {
     version: ['1.5.0', '2.0.0'],
     handler: function(req, res, next) { res.send('1.5.x, 2.x') }
  },
  {
     version: '3.0.0',
     contentType: ['text/html', 'text/html']
     handler: function(req, res, next) { res.send('3.x, text') }
  },
  {
     version: '3.0.0',
     contentType: 'application/json'
     handler: function(req, res, next) { res.send('3.x, json') }
  }
]);

// 'accept-version': '^1.1.0' => 1.5.x, 2.x'
// 'accept-version': '3.x', accept: 'application/json' => '3.x, json'
```
