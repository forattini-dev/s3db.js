import { customAlphabet, urlAlphabet } from 'nanoid';
import { chunk, merge, isString as isString$1, isEmpty, invert, uniq, cloneDeep, get as get$1, set, isFunction as isFunction$1, isPlainObject } from 'lodash-es';
import { PromisePool } from '@supercharge/promise-pool';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { flatten, unflatten } from 'flat';
import FastestValidator from 'fastest-validator';
import { ReadableStream } from 'node:stream/web';

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
function resolve() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : '/';

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
}
// path.normalize(path)
// posix version
function normalize(path) {
  var isPathAbsolute = isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isPathAbsolute).join('/');

  if (!path && !isPathAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isPathAbsolute ? '/' : '') + path;
}
// posix version
function isAbsolute(path) {
  return path.charAt(0) === '/';
}

// posix version
function join() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
}


// path.relative(from, to)
// posix version
function relative(from, to) {
  from = resolve(from).substr(1);
  to = resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
}

var sep = '/';
var delimiter = ':';

function dirname(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
}

function basename(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
}


function extname(path) {
  return splitPath(path)[3];
}
var path = {
  extname: extname,
  basename: basename,
  dirname: dirname,
  sep: sep,
  delimiter: delimiter,
  relative: relative,
  join: join,
  isAbsolute: isAbsolute,
  normalize: normalize,
  resolve: resolve
};
function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b' ?
    function (str, start, len) { return str.substr(start, len) } :
    function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

const idGenerator = customAlphabet(urlAlphabet, 22);
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const passwordGenerator = customAlphabet(passwordAlphabet, 12);

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };
    
// Alias for removeListener added in NodeJS 10.0
// https://nodejs.org/api/events.html#events_emitter_off_eventname_listener
EventEmitter.prototype.off = function(type, listener){
    return this.removeListener(type, listener);
};

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount$1.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount$1;
function listenerCount$1(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

class BaseError extends Error {
  constructor({ verbose, bucket, message, ...rest }) {
    if (verbose) message = message + `

Verbose:

${JSON.stringify(rest, null, 2)}`;
    super(message);
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
    super.name = this.constructor.name;
    this.name = this.constructor.name;
    this.bucket = bucket;
    this.thrownAt = /* @__PURE__ */ new Date();
  }
  toJson() {
    return { ...this };
  }
  toString() {
    return `${this.name} | ${this.message}`;
  }
}
class S3DBError extends BaseError {
  constructor(message, details = {}) {
    super({ message, ...details });
  }
}
class DatabaseError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class ValidationError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class AuthenticationError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class PermissionError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class EncryptionError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class ResourceNotFound extends S3DBError {
  constructor({ bucket, resourceName, id, ...rest }) {
    super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
      bucket,
      resourceName,
      id,
      ...rest
    });
  }
}
class NoSuchBucket extends S3DBError {
  constructor({ bucket, ...rest }) {
    super(`Bucket does not exists [bucket:${bucket}]`, { bucket, ...rest });
  }
}
class NoSuchKey extends S3DBError {
  constructor({ bucket, key, ...rest }) {
    super(`Key [${key}] does not exists [bucket:${bucket}/${key}]`, { bucket, key, ...rest });
  }
}
class NotFound extends NoSuchKey {
}
class MissingMetadata extends S3DBError {
  constructor({ bucket, ...rest }) {
    super(`Missing metadata for bucket [bucket:${bucket}]`, { bucket, ...rest });
  }
}
class InvalidResourceItem extends S3DBError {
  constructor({
    bucket,
    resourceName,
    attributes,
    validation
  }) {
    super(`This item is not valid. Resource=${resourceName} [bucket:${bucket}].
${JSON.stringify(validation, null, 2)}`, {
      bucket,
      resourceName,
      attributes,
      validation
    });
  }
}
class UnknownError extends S3DBError {
}
const ErrorMap = {
  "NotFound": NotFound,
  "NoSuchKey": NoSuchKey,
  "UnknownError": UnknownError,
  "NoSuchBucket": NoSuchBucket,
  "MissingMetadata": MissingMetadata,
  "InvalidResourceItem": InvalidResourceItem
};

const S3_DEFAULT_REGION = "us-east-1";
const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
class ConnectionString {
  constructor(connectionString) {
    let uri;
    try {
      uri = new URL(connectionString);
    } catch (error) {
      throw new Error("Invalid connection string: " + connectionString);
    }
    this.region = S3_DEFAULT_REGION;
    if (uri.protocol === "s3:") this.defineS3(uri);
    else this.defineMinio(uri);
    for (const [k, v] of uri.searchParams.entries()) {
      this[k] = v;
    }
  }
  defineS3(uri) {
    this.bucket = decodeURIComponent(uri.hostname);
    this.accessKeyId = decodeURIComponent(uri.username);
    this.secretAccessKey = decodeURIComponent(uri.password);
    this.endpoint = S3_DEFAULT_ENDPOINT;
    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = "";
    } else {
      let [, ...subpath] = uri.pathname.split("/");
      this.keyPrefix = [...subpath || []].join("/");
    }
  }
  defineMinio(uri) {
    this.forcePathStyle = true;
    this.endpoint = uri.origin;
    this.accessKeyId = decodeURIComponent(uri.username);
    this.secretAccessKey = decodeURIComponent(uri.password);
    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = "s3db";
      this.keyPrefix = "";
    } else {
      let [, bucket, ...subpath] = uri.pathname.split("/");
      this.bucket = decodeURIComponent(bucket);
      this.keyPrefix = [...subpath || []].join("/");
    }
  }
}

class Client extends EventEmitter {
  constructor({
    verbose = false,
    id = null,
    AwsS3Client,
    connectionString,
    parallelism = 10
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? idGenerator();
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.client = AwsS3Client || this.createClient();
  }
  createClient() {
    let options2 = {
      region: this.config.region,
      endpoint: this.config.endpoint
    };
    if (this.config.forcePathStyle) options2.forcePathStyle = true;
    if (this.config.accessKeyId) {
      options2.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      };
    }
    return new S3Client(options2);
  }
  async sendCommand(command) {
    this.emit("command.request", command.constructor.name, command.input);
    const originalWarn = console.warn;
    try {
      console.warn = (message) => {
        if (!message.includes("Stream of unknown length")) {
          originalWarn(message);
        }
      };
    } catch (error) {
      console.error(error);
    }
    const response = await this.client.send(command);
    this.emit("command.response", command.constructor.name, response, command.input);
    try {
      console.warn = originalWarn;
    } catch (error) {
      console.error(error);
    }
    return response;
  }
  errorProxy(error, data) {
    if (this.verbose) {
      data.bucket = this.config.bucket;
      data.config = this.config;
      data.verbose = this.verbose;
    }
    error.data = data;
    const errorClass = ErrorMap[error.name];
    if (errorClass) return new errorClass(data);
    return error;
  }
  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength }) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const stringMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, "_");
        stringMetadata[validKey] = String(v);
      }
    }
    const options2 = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
      Metadata: stringMetadata,
      Body: body || Buffer.alloc(0)
    };
    if (contentType !== void 0) options2.ContentType = contentType;
    if (contentEncoding !== void 0) options2.ContentEncoding = contentEncoding;
    if (contentLength !== void 0) options2.ContentLength = contentLength;
    try {
      const response = await this.sendCommand(new PutObjectCommand(options2));
      this.emit("putObject", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options2
      });
    }
  }
  async getObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const options2 = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    try {
      const response = await this.sendCommand(new GetObjectCommand(options2));
      this.emit("getObject", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options2
      });
    }
  }
  async headObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const options2 = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    try {
      const response = await this.sendCommand(new HeadObjectCommand(options2));
      this.emit("headObject", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options2
      });
    }
  }
  async copyObject({ from, to }) {
    const options2 = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, to) : to,
      CopySource: path.join(this.config.bucket, this.config.keyPrefix ? path.join(this.config.keyPrefix, from) : from)
    };
    try {
      const response = await this.client.send(new CopyObjectCommand(options2));
      this.emit("copyObject", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        from,
        to,
        command: options2
      });
    }
  }
  async exists(key) {
    try {
      await this.headObject(key);
      return true;
    } catch (err) {
      if (err.name === "NoSuchKey") return false;
      else if (err.name === "NotFound") return false;
      throw err;
    }
  }
  async deleteObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const options2 = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    try {
      const response = await this.sendCommand(new DeleteObjectCommand(options2));
      this.emit("deleteObject", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, {
        key,
        command: options2
      });
    }
  }
  async deleteObjects(keys) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const packages = chunk(keys, 1e3);
    const { results, errors } = await PromisePool.for(packages).withConcurrency(this.parallelism).process(async (keys2) => {
      const options2 = {
        Bucket: this.config.bucket,
        Delete: {
          Objects: keys2.map((key) => ({
            Key: keyPrefix ? path.join(keyPrefix, key) : key
          }))
        }
      };
      try {
        const response = await this.sendCommand(new DeleteObjectsCommand(options2));
        return response;
      } catch (error) {
        throw this.errorProxy(error, {
          keys: keys2,
          command: options2
        });
      }
    });
    const report = {
      deleted: results,
      notFound: errors
    };
    this.emit("deleteObjects", report, keys);
    return report;
  }
  /**
   * Delete all objects under a specific prefix using efficient pagination
   * @param {Object} options - Delete options
   * @param {string} options.prefix - S3 prefix to delete
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll({ prefix } = {}) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    let continuationToken;
    let totalDeleted = 0;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix) : prefix,
        ContinuationToken: continuationToken
      });
      const listResponse = await this.client.send(listCommand);
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key }))
          }
        });
        const deleteResponse = await this.client.send(deleteCommand);
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;
        this.emit("deleteAll", {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }
      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : void 0;
    } while (continuationToken);
    this.emit("deleteAllComplete", {
      prefix,
      totalDeleted
    });
    return totalDeleted;
  }
  async moveObject({ from, to }) {
    try {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
      return true;
    } catch (error) {
      throw this.errorProxy(error, {
        from,
        to,
        command: options
      });
    }
  }
  async listObjects({
    prefix,
    maxKeys = 1e3,
    continuationToken
  } = {}) {
    const options2 = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      Prefix: this.config.keyPrefix ? path.join(this.config.keyPrefix, prefix || "") : prefix || ""
    };
    try {
      const response = await this.sendCommand(new ListObjectsV2Command(options2));
      this.emit("listObjects", response, options2);
      return response;
    } catch (error) {
      throw this.errorProxy(error, { command: options2 });
    }
  }
  async count({ prefix } = {}) {
    let count = 0;
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options2 = {
        prefix,
        continuationToken
      };
      const response = await this.listObjects(options2);
      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    this.emit("count", count, { prefix });
    return count;
  }
  async getAllKeys({ prefix } = {}) {
    let keys = [];
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options2 = {
        prefix,
        continuationToken
      };
      const response = await this.listObjects(options2);
      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    if (this.config.keyPrefix) {
      keys = keys.map((x) => x.replace(this.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x);
    }
    this.emit("getAllKeys", keys, { prefix });
    return keys;
  }
  async getContinuationTokenAfterOffset(params = {}) {
    const {
      prefix,
      offset = 1e3
    } = params;
    if (offset === 0) return null;
    let truncated = true;
    let continuationToken;
    let skipped = 0;
    while (truncated) {
      let maxKeys = offset < 1e3 ? offset : offset - skipped > 1e3 ? 1e3 : offset - skipped;
      const options2 = {
        prefix,
        maxKeys,
        continuationToken
      };
      const res = await this.listObjects(options2);
      if (res.Contents) {
        skipped += res.Contents.length;
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (skipped >= offset) {
        break;
      }
    }
    this.emit("getContinuationTokenAfterOffset", continuationToken || null, params);
    return continuationToken || null;
  }
  async getKeysPage(params = {}) {
    const {
      prefix,
      offset = 0,
      amount = 100
    } = params;
    let keys = [];
    let truncated = true;
    let continuationToken;
    if (offset > 0) {
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset
      });
      if (!continuationToken) {
        this.emit("getKeysPage", [], params);
        return [];
      }
    }
    while (truncated) {
      const options2 = {
        prefix,
        continuationToken
      };
      const res = await this.listObjects(options2);
      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
        break;
      }
    }
    if (this.config.keyPrefix) {
      keys = keys.map((x) => x.replace(this.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x);
    }
    this.emit("getKeysPage", keys, params);
    return keys;
  }
  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const { results, errors } = await PromisePool.for(keys).withConcurrency(this.parallelism).process(async (key) => {
      const to = key.replace(prefixFrom, prefixTo);
      try {
        await this.moveObject({
          from: key,
          to
        });
        return to;
      } catch (error) {
        throw this.errorProxy(error, {
          from: key,
          to
        });
      }
    });
    this.emit("moveAllObjects", { results, errors }, { prefixFrom, prefixTo });
    if (errors.length > 0) {
      throw new Error("Some objects could not be moved");
    }
    return results;
  }
}

async function dynamicCrypto() {
  let lib;
  if (typeof process !== "undefined") {
    try {
      const { webcrypto } = await import('crypto');
      lib = webcrypto;
    } catch (error) {
      throw new Error("Crypto API not available");
    }
  } else if (typeof window !== "undefined") {
    lib = window.crypto;
  }
  if (!lib) throw new Error("Could not load any crypto library");
  return lib;
}
async function sha256(message) {
  const cryptoLib = await dynamicCrypto();
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await cryptoLib.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
async function encrypt(content, passphrase) {
  const cryptoLib = await dynamicCrypto();
  const salt = cryptoLib.getRandomValues(new Uint8Array(16));
  const key = await getKeyMaterial(passphrase, salt);
  const iv = cryptoLib.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(content);
  const encryptedContent = await cryptoLib.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedContent);
  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  encryptedData.set(salt);
  encryptedData.set(iv, salt.length);
  encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length);
  return arrayBufferToBase64(encryptedData);
}
async function decrypt(encryptedBase64, passphrase) {
  const cryptoLib = await dynamicCrypto();
  const encryptedData = base64ToArrayBuffer(encryptedBase64);
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const encryptedContent = encryptedData.slice(28);
  const key = await getKeyMaterial(passphrase, salt);
  const decryptedContent = await cryptoLib.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedContent);
  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}
async function getKeyMaterial(passphrase, salt) {
  const cryptoLib = await dynamicCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(passphrase);
  const baseKey = await cryptoLib.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return await cryptoLib.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}
function arrayBufferToBase64(buffer) {
  if (typeof process !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  } else {
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    return window.btoa(binary);
  }
}
function base64ToArrayBuffer(base64) {
  if (typeof process !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var jsonify = {};

var parse;
var hasRequiredParse;

function requireParse () {
	if (hasRequiredParse) return parse;
	hasRequiredParse = 1;

	var at; // The index of the current character
	var ch; // The current character
	var escapee = {
		'"': '"',
		'\\': '\\',
		'/': '/',
		b: '\b',
		f: '\f',
		n: '\n',
		r: '\r',
		t: '\t'
	};
	var text;

	// Call error when something is wrong.
	function error(m) {
		throw {
			name: 'SyntaxError',
			message: m,
			at: at,
			text: text
		};
	}

	function next(c) {
		// If a c parameter is provided, verify that it matches the current character.
		if (c && c !== ch) {
			error("Expected '" + c + "' instead of '" + ch + "'");
		}

		// Get the next character. When there are no more characters, return the empty string.

		ch = text.charAt(at);
		at += 1;
		return ch;
	}

	function number() {
		// Parse a number value.
		var num;
		var str = '';

		if (ch === '-') {
			str = '-';
			next('-');
		}
		while (ch >= '0' && ch <= '9') {
			str += ch;
			next();
		}
		if (ch === '.') {
			str += '.';
			while (next() && ch >= '0' && ch <= '9') {
				str += ch;
			}
		}
		if (ch === 'e' || ch === 'E') {
			str += ch;
			next();
			if (ch === '-' || ch === '+') {
				str += ch;
				next();
			}
			while (ch >= '0' && ch <= '9') {
				str += ch;
				next();
			}
		}
		num = Number(str);
		if (!isFinite(num)) {
			error('Bad number');
		}
		return num;
	}

	function string() {
		// Parse a string value.
		var hex;
		var i;
		var str = '';
		var uffff;

		// When parsing for string values, we must look for " and \ characters.
		if (ch === '"') {
			while (next()) {
				if (ch === '"') {
					next();
					return str;
				} else if (ch === '\\') {
					next();
					if (ch === 'u') {
						uffff = 0;
						for (i = 0; i < 4; i += 1) {
							hex = parseInt(next(), 16);
							if (!isFinite(hex)) {
								break;
							}
							uffff = (uffff * 16) + hex;
						}
						str += String.fromCharCode(uffff);
					} else if (typeof escapee[ch] === 'string') {
						str += escapee[ch];
					} else {
						break;
					}
				} else {
					str += ch;
				}
			}
		}
		error('Bad string');
	}

	// Skip whitespace.
	function white() {
		while (ch && ch <= ' ') {
			next();
		}
	}

	// true, false, or null.
	function word() {
		switch (ch) {
			case 't':
				next('t');
				next('r');
				next('u');
				next('e');
				return true;
			case 'f':
				next('f');
				next('a');
				next('l');
				next('s');
				next('e');
				return false;
			case 'n':
				next('n');
				next('u');
				next('l');
				next('l');
				return null;
			default:
				error("Unexpected '" + ch + "'");
		}
	}

	// Parse an array value.
	function array() {
		var arr = [];

		if (ch === '[') {
			next('[');
			white();
			if (ch === ']') {
				next(']');
				return arr; // empty array
			}
			while (ch) {
				arr.push(value()); // eslint-disable-line no-use-before-define
				white();
				if (ch === ']') {
					next(']');
					return arr;
				}
				next(',');
				white();
			}
		}
		error('Bad array');
	}

	// Parse an object value.
	function object() {
		var key;
		var obj = {};

		if (ch === '{') {
			next('{');
			white();
			if (ch === '}') {
				next('}');
				return obj; // empty object
			}
			while (ch) {
				key = string();
				white();
				next(':');
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					error('Duplicate key "' + key + '"');
				}
				obj[key] = value(); // eslint-disable-line no-use-before-define
				white();
				if (ch === '}') {
					next('}');
					return obj;
				}
				next(',');
				white();
			}
		}
		error('Bad object');
	}

	// Parse a JSON value. It could be an object, an array, a string, a number, or a word.
	function value() {
		white();
		switch (ch) {
			case '{':
				return object();
			case '[':
				return array();
			case '"':
				return string();
			case '-':
				return number();
			default:
				return ch >= '0' && ch <= '9' ? number() : word();
		}
	}

	// Return the json_parse function. It will have access to all of the above functions and variables.
	parse = function (source, reviver) {
		var result;

		text = source;
		at = 0;
		ch = ' ';
		result = value();
		white();
		if (ch) {
			error('Syntax error');
		}

		// If there is a reviver function, we recursively walk the new structure,
		// passing each name/value pair to the reviver function for possible
		// transformation, starting with a temporary root object that holds the result
		// in an empty key. If there is not a reviver function, we simply return the
		// result.

		return typeof reviver === 'function' ? (function walk(holder, key) {
			var k;
			var v;
			var val = holder[key];
			if (val && typeof val === 'object') {
				for (k in value) {
					if (Object.prototype.hasOwnProperty.call(val, k)) {
						v = walk(val, k);
						if (typeof v === 'undefined') {
							delete val[k];
						} else {
							val[k] = v;
						}
					}
				}
			}
			return reviver.call(holder, key, val);
		}({ '': result }, '')) : result;
	};
	return parse;
}

var stringify;
var hasRequiredStringify;

function requireStringify () {
	if (hasRequiredStringify) return stringify;
	hasRequiredStringify = 1;

	var escapable = /[\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
	var gap;
	var indent;
	var meta = { // table of character substitutions
		'\b': '\\b',
		'\t': '\\t',
		'\n': '\\n',
		'\f': '\\f',
		'\r': '\\r',
		'"': '\\"',
		'\\': '\\\\'
	};
	var rep;

	function quote(string) {
		// If the string contains no control characters, no quote characters, and no
		// backslash characters, then we can safely slap some quotes around it.
		// Otherwise we must also replace the offending characters with safe escape sequences.

		escapable.lastIndex = 0;
		return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
			var c = meta[a];
			return typeof c === 'string' ? c
				: '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
		}) + '"' : '"' + string + '"';
	}

	function str(key, holder) {
		// Produce a string from holder[key].
		var i; // The loop counter.
		var k; // The member key.
		var v; // The member value.
		var length;
		var mind = gap;
		var partial;
		var value = holder[key];

		// If the value has a toJSON method, call it to obtain a replacement value.
		if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
			value = value.toJSON(key);
		}

		// If we were called with a replacer function, then call the replacer to obtain a replacement value.
		if (typeof rep === 'function') {
			value = rep.call(holder, key, value);
		}

		// What happens next depends on the value's type.
		switch (typeof value) {
			case 'string':
				return quote(value);

			case 'number':
				// JSON numbers must be finite. Encode non-finite numbers as null.
				return isFinite(value) ? String(value) : 'null';

			case 'boolean':
			case 'null':
				// If the value is a boolean or null, convert it to a string. Note:
				// typeof null does not produce 'null'. The case is included here in
				// the remote chance that this gets fixed someday.
				return String(value);

			case 'object':
				if (!value) {
					return 'null';
				}
				gap += indent;
				partial = [];

				// Array.isArray
				if (Object.prototype.toString.apply(value) === '[object Array]') {
					length = value.length;
					for (i = 0; i < length; i += 1) {
						partial[i] = str(i, value) || 'null';
					}

					// Join all of the elements together, separated with commas, and wrap them in brackets.
					v = partial.length === 0 ? '[]' : gap
						? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']'
						: '[' + partial.join(',') + ']';
					gap = mind;
					return v;
				}

				// If the replacer is an array, use it to select the members to be stringified.
				if (rep && typeof rep === 'object') {
					length = rep.length;
					for (i = 0; i < length; i += 1) {
						k = rep[i];
						if (typeof k === 'string') {
							v = str(k, value);
							if (v) {
								partial.push(quote(k) + (gap ? ': ' : ':') + v);
							}
						}
					}
				} else {
					// Otherwise, iterate through all of the keys in the object.
					for (k in value) {
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							v = str(k, value);
							if (v) {
								partial.push(quote(k) + (gap ? ': ' : ':') + v);
							}
						}
					}
				}

				// Join all of the member texts together, separated with commas, and wrap them in braces.

				v = partial.length === 0 ? '{}' : gap
					? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}'
					: '{' + partial.join(',') + '}';
				gap = mind;
				return v;
		}
	}

	stringify = function (value, replacer, space) {
		var i;
		gap = '';
		indent = '';

		// If the space parameter is a number, make an indent string containing that many spaces.
		if (typeof space === 'number') {
			for (i = 0; i < space; i += 1) {
				indent += ' ';
			}
		} else if (typeof space === 'string') {
			// If the space parameter is a string, it will be used as the indent string.
			indent = space;
		}

		// If there is a replacer, it must be a function or an array. Otherwise, throw an error.
		rep = replacer;
		if (
			replacer
			&& typeof replacer !== 'function'
			&& (typeof replacer !== 'object' || typeof replacer.length !== 'number')
		) {
			throw new Error('JSON.stringify');
		}

		// Make a fake root object containing our value under the key of ''.
		// Return the result of stringifying the value.
		return str('', { '': value });
	};
	return stringify;
}

var hasRequiredJsonify;

function requireJsonify () {
	if (hasRequiredJsonify) return jsonify;
	hasRequiredJsonify = 1;

	jsonify.parse = requireParse();
	jsonify.stringify = requireStringify();
	return jsonify;
}

var isarray;
var hasRequiredIsarray;

function requireIsarray () {
	if (hasRequiredIsarray) return isarray;
	hasRequiredIsarray = 1;
	var toString = {}.toString;

	isarray = Array.isArray || function (arr) {
	  return toString.call(arr) == '[object Array]';
	};
	return isarray;
}

var isArguments;
var hasRequiredIsArguments;

function requireIsArguments () {
	if (hasRequiredIsArguments) return isArguments;
	hasRequiredIsArguments = 1;

	var toStr = Object.prototype.toString;

	isArguments = function isArguments(value) {
		var str = toStr.call(value);
		var isArgs = str === '[object Arguments]';
		if (!isArgs) {
			isArgs = str !== '[object Array]' &&
				value !== null &&
				typeof value === 'object' &&
				typeof value.length === 'number' &&
				value.length >= 0 &&
				toStr.call(value.callee) === '[object Function]';
		}
		return isArgs;
	};
	return isArguments;
}

var implementation$1;
var hasRequiredImplementation$1;

function requireImplementation$1 () {
	if (hasRequiredImplementation$1) return implementation$1;
	hasRequiredImplementation$1 = 1;

	var keysShim;
	if (!Object.keys) {
		// modified from https://github.com/es-shims/es5-shim
		var has = Object.prototype.hasOwnProperty;
		var toStr = Object.prototype.toString;
		var isArgs = requireIsArguments(); // eslint-disable-line global-require
		var isEnumerable = Object.prototype.propertyIsEnumerable;
		var hasDontEnumBug = !isEnumerable.call({ toString: null }, 'toString');
		var hasProtoEnumBug = isEnumerable.call(function () {}, 'prototype');
		var dontEnums = [
			'toString',
			'toLocaleString',
			'valueOf',
			'hasOwnProperty',
			'isPrototypeOf',
			'propertyIsEnumerable',
			'constructor'
		];
		var equalsConstructorPrototype = function (o) {
			var ctor = o.constructor;
			return ctor && ctor.prototype === o;
		};
		var excludedKeys = {
			$applicationCache: true,
			$console: true,
			$external: true,
			$frame: true,
			$frameElement: true,
			$frames: true,
			$innerHeight: true,
			$innerWidth: true,
			$onmozfullscreenchange: true,
			$onmozfullscreenerror: true,
			$outerHeight: true,
			$outerWidth: true,
			$pageXOffset: true,
			$pageYOffset: true,
			$parent: true,
			$scrollLeft: true,
			$scrollTop: true,
			$scrollX: true,
			$scrollY: true,
			$self: true,
			$webkitIndexedDB: true,
			$webkitStorageInfo: true,
			$window: true
		};
		var hasAutomationEqualityBug = (function () {
			/* global window */
			if (typeof window === 'undefined') { return false; }
			for (var k in window) {
				try {
					if (!excludedKeys['$' + k] && has.call(window, k) && window[k] !== null && typeof window[k] === 'object') {
						try {
							equalsConstructorPrototype(window[k]);
						} catch (e) {
							return true;
						}
					}
				} catch (e) {
					return true;
				}
			}
			return false;
		}());
		var equalsConstructorPrototypeIfNotBuggy = function (o) {
			/* global window */
			if (typeof window === 'undefined' || !hasAutomationEqualityBug) {
				return equalsConstructorPrototype(o);
			}
			try {
				return equalsConstructorPrototype(o);
			} catch (e) {
				return false;
			}
		};

		keysShim = function keys(object) {
			var isObject = object !== null && typeof object === 'object';
			var isFunction = toStr.call(object) === '[object Function]';
			var isArguments = isArgs(object);
			var isString = isObject && toStr.call(object) === '[object String]';
			var theKeys = [];

			if (!isObject && !isFunction && !isArguments) {
				throw new TypeError('Object.keys called on a non-object');
			}

			var skipProto = hasProtoEnumBug && isFunction;
			if (isString && object.length > 0 && !has.call(object, 0)) {
				for (var i = 0; i < object.length; ++i) {
					theKeys.push(String(i));
				}
			}

			if (isArguments && object.length > 0) {
				for (var j = 0; j < object.length; ++j) {
					theKeys.push(String(j));
				}
			} else {
				for (var name in object) {
					if (!(skipProto && name === 'prototype') && has.call(object, name)) {
						theKeys.push(String(name));
					}
				}
			}

			if (hasDontEnumBug) {
				var skipConstructor = equalsConstructorPrototypeIfNotBuggy(object);

				for (var k = 0; k < dontEnums.length; ++k) {
					if (!(skipConstructor && dontEnums[k] === 'constructor') && has.call(object, dontEnums[k])) {
						theKeys.push(dontEnums[k]);
					}
				}
			}
			return theKeys;
		};
	}
	implementation$1 = keysShim;
	return implementation$1;
}

var objectKeys;
var hasRequiredObjectKeys;

function requireObjectKeys () {
	if (hasRequiredObjectKeys) return objectKeys;
	hasRequiredObjectKeys = 1;

	var slice = Array.prototype.slice;
	var isArgs = requireIsArguments();

	var origKeys = Object.keys;
	var keysShim = origKeys ? function keys(o) { return origKeys(o); } : requireImplementation$1();

	var originalKeys = Object.keys;

	keysShim.shim = function shimObjectKeys() {
		if (Object.keys) {
			var keysWorksWithArguments = (function () {
				// Safari 5.0 bug
				var args = Object.keys(arguments);
				return args && args.length === arguments.length;
			}(1, 2));
			if (!keysWorksWithArguments) {
				Object.keys = function keys(object) { // eslint-disable-line func-name-matching
					if (isArgs(object)) {
						return originalKeys(slice.call(object));
					}
					return originalKeys(object);
				};
			}
		} else {
			Object.keys = keysShim;
		}
		return Object.keys || keysShim;
	};

	objectKeys = keysShim;
	return objectKeys;
}

var callBind = {exports: {}};

var esObjectAtoms;
var hasRequiredEsObjectAtoms;

function requireEsObjectAtoms () {
	if (hasRequiredEsObjectAtoms) return esObjectAtoms;
	hasRequiredEsObjectAtoms = 1;

	/** @type {import('.')} */
	esObjectAtoms = Object;
	return esObjectAtoms;
}

var esErrors;
var hasRequiredEsErrors;

function requireEsErrors () {
	if (hasRequiredEsErrors) return esErrors;
	hasRequiredEsErrors = 1;

	/** @type {import('.')} */
	esErrors = Error;
	return esErrors;
}

var _eval;
var hasRequired_eval;

function require_eval () {
	if (hasRequired_eval) return _eval;
	hasRequired_eval = 1;

	/** @type {import('./eval')} */
	_eval = EvalError;
	return _eval;
}

var range;
var hasRequiredRange;

function requireRange () {
	if (hasRequiredRange) return range;
	hasRequiredRange = 1;

	/** @type {import('./range')} */
	range = RangeError;
	return range;
}

var ref;
var hasRequiredRef;

function requireRef () {
	if (hasRequiredRef) return ref;
	hasRequiredRef = 1;

	/** @type {import('./ref')} */
	ref = ReferenceError;
	return ref;
}

var syntax;
var hasRequiredSyntax;

function requireSyntax () {
	if (hasRequiredSyntax) return syntax;
	hasRequiredSyntax = 1;

	/** @type {import('./syntax')} */
	syntax = SyntaxError;
	return syntax;
}

var type;
var hasRequiredType;

function requireType () {
	if (hasRequiredType) return type;
	hasRequiredType = 1;

	/** @type {import('./type')} */
	type = TypeError;
	return type;
}

var uri;
var hasRequiredUri;

function requireUri () {
	if (hasRequiredUri) return uri;
	hasRequiredUri = 1;

	/** @type {import('./uri')} */
	uri = URIError;
	return uri;
}

var abs;
var hasRequiredAbs;

function requireAbs () {
	if (hasRequiredAbs) return abs;
	hasRequiredAbs = 1;

	/** @type {import('./abs')} */
	abs = Math.abs;
	return abs;
}

var floor;
var hasRequiredFloor;

function requireFloor () {
	if (hasRequiredFloor) return floor;
	hasRequiredFloor = 1;

	/** @type {import('./floor')} */
	floor = Math.floor;
	return floor;
}

var max;
var hasRequiredMax;

function requireMax () {
	if (hasRequiredMax) return max;
	hasRequiredMax = 1;

	/** @type {import('./max')} */
	max = Math.max;
	return max;
}

var min;
var hasRequiredMin;

function requireMin () {
	if (hasRequiredMin) return min;
	hasRequiredMin = 1;

	/** @type {import('./min')} */
	min = Math.min;
	return min;
}

var pow;
var hasRequiredPow;

function requirePow () {
	if (hasRequiredPow) return pow;
	hasRequiredPow = 1;

	/** @type {import('./pow')} */
	pow = Math.pow;
	return pow;
}

var round;
var hasRequiredRound;

function requireRound () {
	if (hasRequiredRound) return round;
	hasRequiredRound = 1;

	/** @type {import('./round')} */
	round = Math.round;
	return round;
}

var _isNaN;
var hasRequired_isNaN;

function require_isNaN () {
	if (hasRequired_isNaN) return _isNaN;
	hasRequired_isNaN = 1;

	/** @type {import('./isNaN')} */
	_isNaN = Number.isNaN || function isNaN(a) {
		return a !== a;
	};
	return _isNaN;
}

var sign;
var hasRequiredSign;

function requireSign () {
	if (hasRequiredSign) return sign;
	hasRequiredSign = 1;

	var $isNaN = require_isNaN();

	/** @type {import('./sign')} */
	sign = function sign(number) {
		if ($isNaN(number) || number === 0) {
			return number;
		}
		return number < 0 ? -1 : 1;
	};
	return sign;
}

var gOPD;
var hasRequiredGOPD;

function requireGOPD () {
	if (hasRequiredGOPD) return gOPD;
	hasRequiredGOPD = 1;

	/** @type {import('./gOPD')} */
	gOPD = Object.getOwnPropertyDescriptor;
	return gOPD;
}

var gopd;
var hasRequiredGopd;

function requireGopd () {
	if (hasRequiredGopd) return gopd;
	hasRequiredGopd = 1;

	/** @type {import('.')} */
	var $gOPD = requireGOPD();

	if ($gOPD) {
		try {
			$gOPD([], 'length');
		} catch (e) {
			// IE 8 has a broken gOPD
			$gOPD = null;
		}
	}

	gopd = $gOPD;
	return gopd;
}

var esDefineProperty;
var hasRequiredEsDefineProperty;

function requireEsDefineProperty () {
	if (hasRequiredEsDefineProperty) return esDefineProperty;
	hasRequiredEsDefineProperty = 1;

	/** @type {import('.')} */
	var $defineProperty = Object.defineProperty || false;
	if ($defineProperty) {
		try {
			$defineProperty({}, 'a', { value: 1 });
		} catch (e) {
			// IE 8 has a broken defineProperty
			$defineProperty = false;
		}
	}

	esDefineProperty = $defineProperty;
	return esDefineProperty;
}

var shams;
var hasRequiredShams;

function requireShams () {
	if (hasRequiredShams) return shams;
	hasRequiredShams = 1;

	/** @type {import('./shams')} */
	/* eslint complexity: [2, 18], max-statements: [2, 33] */
	shams = function hasSymbols() {
		if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
		if (typeof Symbol.iterator === 'symbol') { return true; }

		/** @type {{ [k in symbol]?: unknown }} */
		var obj = {};
		var sym = Symbol('test');
		var symObj = Object(sym);
		if (typeof sym === 'string') { return false; }

		if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
		if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

		// temp disabled per https://github.com/ljharb/object.assign/issues/17
		// if (sym instanceof Symbol) { return false; }
		// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
		// if (!(symObj instanceof Symbol)) { return false; }

		// if (typeof Symbol.prototype.toString !== 'function') { return false; }
		// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

		var symVal = 42;
		obj[sym] = symVal;
		for (var _ in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
		if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

		if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

		var syms = Object.getOwnPropertySymbols(obj);
		if (syms.length !== 1 || syms[0] !== sym) { return false; }

		if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

		if (typeof Object.getOwnPropertyDescriptor === 'function') {
			// eslint-disable-next-line no-extra-parens
			var descriptor = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(obj, sym));
			if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
		}

		return true;
	};
	return shams;
}

var hasSymbols;
var hasRequiredHasSymbols;

function requireHasSymbols () {
	if (hasRequiredHasSymbols) return hasSymbols;
	hasRequiredHasSymbols = 1;

	var origSymbol = typeof Symbol !== 'undefined' && Symbol;
	var hasSymbolSham = requireShams();

	/** @type {import('.')} */
	hasSymbols = function hasNativeSymbols() {
		if (typeof origSymbol !== 'function') { return false; }
		if (typeof Symbol !== 'function') { return false; }
		if (typeof origSymbol('foo') !== 'symbol') { return false; }
		if (typeof Symbol('bar') !== 'symbol') { return false; }

		return hasSymbolSham();
	};
	return hasSymbols;
}

var Reflect_getPrototypeOf;
var hasRequiredReflect_getPrototypeOf;

function requireReflect_getPrototypeOf () {
	if (hasRequiredReflect_getPrototypeOf) return Reflect_getPrototypeOf;
	hasRequiredReflect_getPrototypeOf = 1;

	/** @type {import('./Reflect.getPrototypeOf')} */
	Reflect_getPrototypeOf = (typeof Reflect !== 'undefined' && Reflect.getPrototypeOf) || null;
	return Reflect_getPrototypeOf;
}

var Object_getPrototypeOf;
var hasRequiredObject_getPrototypeOf;

function requireObject_getPrototypeOf () {
	if (hasRequiredObject_getPrototypeOf) return Object_getPrototypeOf;
	hasRequiredObject_getPrototypeOf = 1;

	var $Object = /*@__PURE__*/ requireEsObjectAtoms();

	/** @type {import('./Object.getPrototypeOf')} */
	Object_getPrototypeOf = $Object.getPrototypeOf || null;
	return Object_getPrototypeOf;
}

var implementation;
var hasRequiredImplementation;

function requireImplementation () {
	if (hasRequiredImplementation) return implementation;
	hasRequiredImplementation = 1;

	/* eslint no-invalid-this: 1 */

	var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
	var toStr = Object.prototype.toString;
	var max = Math.max;
	var funcType = '[object Function]';

	var concatty = function concatty(a, b) {
	    var arr = [];

	    for (var i = 0; i < a.length; i += 1) {
	        arr[i] = a[i];
	    }
	    for (var j = 0; j < b.length; j += 1) {
	        arr[j + a.length] = b[j];
	    }

	    return arr;
	};

	var slicy = function slicy(arrLike, offset) {
	    var arr = [];
	    for (var i = offset, j = 0; i < arrLike.length; i += 1, j += 1) {
	        arr[j] = arrLike[i];
	    }
	    return arr;
	};

	var joiny = function (arr, joiner) {
	    var str = '';
	    for (var i = 0; i < arr.length; i += 1) {
	        str += arr[i];
	        if (i + 1 < arr.length) {
	            str += joiner;
	        }
	    }
	    return str;
	};

	implementation = function bind(that) {
	    var target = this;
	    if (typeof target !== 'function' || toStr.apply(target) !== funcType) {
	        throw new TypeError(ERROR_MESSAGE + target);
	    }
	    var args = slicy(arguments, 1);

	    var bound;
	    var binder = function () {
	        if (this instanceof bound) {
	            var result = target.apply(
	                this,
	                concatty(args, arguments)
	            );
	            if (Object(result) === result) {
	                return result;
	            }
	            return this;
	        }
	        return target.apply(
	            that,
	            concatty(args, arguments)
	        );

	    };

	    var boundLength = max(0, target.length - args.length);
	    var boundArgs = [];
	    for (var i = 0; i < boundLength; i++) {
	        boundArgs[i] = '$' + i;
	    }

	    bound = Function('binder', 'return function (' + joiny(boundArgs, ',') + '){ return binder.apply(this,arguments); }')(binder);

	    if (target.prototype) {
	        var Empty = function Empty() {};
	        Empty.prototype = target.prototype;
	        bound.prototype = new Empty();
	        Empty.prototype = null;
	    }

	    return bound;
	};
	return implementation;
}

var functionBind;
var hasRequiredFunctionBind;

function requireFunctionBind () {
	if (hasRequiredFunctionBind) return functionBind;
	hasRequiredFunctionBind = 1;

	var implementation = requireImplementation();

	functionBind = Function.prototype.bind || implementation;
	return functionBind;
}

var functionCall;
var hasRequiredFunctionCall;

function requireFunctionCall () {
	if (hasRequiredFunctionCall) return functionCall;
	hasRequiredFunctionCall = 1;

	/** @type {import('./functionCall')} */
	functionCall = Function.prototype.call;
	return functionCall;
}

var functionApply;
var hasRequiredFunctionApply;

function requireFunctionApply () {
	if (hasRequiredFunctionApply) return functionApply;
	hasRequiredFunctionApply = 1;

	/** @type {import('./functionApply')} */
	functionApply = Function.prototype.apply;
	return functionApply;
}

var reflectApply;
var hasRequiredReflectApply;

function requireReflectApply () {
	if (hasRequiredReflectApply) return reflectApply;
	hasRequiredReflectApply = 1;

	/** @type {import('./reflectApply')} */
	reflectApply = typeof Reflect !== 'undefined' && Reflect && Reflect.apply;
	return reflectApply;
}

var actualApply;
var hasRequiredActualApply;

function requireActualApply () {
	if (hasRequiredActualApply) return actualApply;
	hasRequiredActualApply = 1;

	var bind = requireFunctionBind();

	var $apply = requireFunctionApply();
	var $call = requireFunctionCall();
	var $reflectApply = requireReflectApply();

	/** @type {import('./actualApply')} */
	actualApply = $reflectApply || bind.call($call, $apply);
	return actualApply;
}

var callBindApplyHelpers;
var hasRequiredCallBindApplyHelpers;

function requireCallBindApplyHelpers () {
	if (hasRequiredCallBindApplyHelpers) return callBindApplyHelpers;
	hasRequiredCallBindApplyHelpers = 1;

	var bind = requireFunctionBind();
	var $TypeError = /*@__PURE__*/ requireType();

	var $call = requireFunctionCall();
	var $actualApply = requireActualApply();

	/** @type {(args: [Function, thisArg?: unknown, ...args: unknown[]]) => Function} TODO FIXME, find a way to use import('.') */
	callBindApplyHelpers = function callBindBasic(args) {
		if (args.length < 1 || typeof args[0] !== 'function') {
			throw new $TypeError('a function is required');
		}
		return $actualApply(bind, $call, args);
	};
	return callBindApplyHelpers;
}

var get;
var hasRequiredGet;

function requireGet () {
	if (hasRequiredGet) return get;
	hasRequiredGet = 1;

	var callBind = requireCallBindApplyHelpers();
	var gOPD = /*@__PURE__*/ requireGopd();

	var hasProtoAccessor;
	try {
		// eslint-disable-next-line no-extra-parens, no-proto
		hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */ ([]).__proto__ === Array.prototype;
	} catch (e) {
		if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ERR_PROTO_ACCESS') {
			throw e;
		}
	}

	// eslint-disable-next-line no-extra-parens
	var desc = !!hasProtoAccessor && gOPD && gOPD(Object.prototype, /** @type {keyof typeof Object.prototype} */ ('__proto__'));

	var $Object = Object;
	var $getPrototypeOf = $Object.getPrototypeOf;

	/** @type {import('./get')} */
	get = desc && typeof desc.get === 'function'
		? callBind([desc.get])
		: typeof $getPrototypeOf === 'function'
			? /** @type {import('./get')} */ function getDunder(value) {
				// eslint-disable-next-line eqeqeq
				return $getPrototypeOf(value == null ? value : $Object(value));
			}
			: false;
	return get;
}

var getProto;
var hasRequiredGetProto;

function requireGetProto () {
	if (hasRequiredGetProto) return getProto;
	hasRequiredGetProto = 1;

	var reflectGetProto = requireReflect_getPrototypeOf();
	var originalGetProto = requireObject_getPrototypeOf();

	var getDunderProto = /*@__PURE__*/ requireGet();

	/** @type {import('.')} */
	getProto = reflectGetProto
		? function getProto(O) {
			// @ts-expect-error TS can't narrow inside a closure, for some reason
			return reflectGetProto(O);
		}
		: originalGetProto
			? function getProto(O) {
				if (!O || (typeof O !== 'object' && typeof O !== 'function')) {
					throw new TypeError('getProto: not an object');
				}
				// @ts-expect-error TS can't narrow inside a closure, for some reason
				return originalGetProto(O);
			}
			: getDunderProto
				? function getProto(O) {
					// @ts-expect-error TS can't narrow inside a closure, for some reason
					return getDunderProto(O);
				}
				: null;
	return getProto;
}

var hasown;
var hasRequiredHasown;

function requireHasown () {
	if (hasRequiredHasown) return hasown;
	hasRequiredHasown = 1;

	var call = Function.prototype.call;
	var $hasOwn = Object.prototype.hasOwnProperty;
	var bind = requireFunctionBind();

	/** @type {import('.')} */
	hasown = bind.call(call, $hasOwn);
	return hasown;
}

var getIntrinsic;
var hasRequiredGetIntrinsic;

function requireGetIntrinsic () {
	if (hasRequiredGetIntrinsic) return getIntrinsic;
	hasRequiredGetIntrinsic = 1;

	var undefined$1;

	var $Object = /*@__PURE__*/ requireEsObjectAtoms();

	var $Error = /*@__PURE__*/ requireEsErrors();
	var $EvalError = /*@__PURE__*/ require_eval();
	var $RangeError = /*@__PURE__*/ requireRange();
	var $ReferenceError = /*@__PURE__*/ requireRef();
	var $SyntaxError = /*@__PURE__*/ requireSyntax();
	var $TypeError = /*@__PURE__*/ requireType();
	var $URIError = /*@__PURE__*/ requireUri();

	var abs = /*@__PURE__*/ requireAbs();
	var floor = /*@__PURE__*/ requireFloor();
	var max = /*@__PURE__*/ requireMax();
	var min = /*@__PURE__*/ requireMin();
	var pow = /*@__PURE__*/ requirePow();
	var round = /*@__PURE__*/ requireRound();
	var sign = /*@__PURE__*/ requireSign();

	var $Function = Function;

	// eslint-disable-next-line consistent-return
	var getEvalledConstructor = function (expressionSyntax) {
		try {
			return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
		} catch (e) {}
	};

	var $gOPD = /*@__PURE__*/ requireGopd();
	var $defineProperty = /*@__PURE__*/ requireEsDefineProperty();

	var throwTypeError = function () {
		throw new $TypeError();
	};
	var ThrowTypeError = $gOPD
		? (function () {
			try {
				// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
				arguments.callee; // IE 8 does not throw here
				return throwTypeError;
			} catch (calleeThrows) {
				try {
					// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
					return $gOPD(arguments, 'callee').get;
				} catch (gOPDthrows) {
					return throwTypeError;
				}
			}
		}())
		: throwTypeError;

	var hasSymbols = requireHasSymbols()();

	var getProto = requireGetProto();
	var $ObjectGPO = requireObject_getPrototypeOf();
	var $ReflectGPO = requireReflect_getPrototypeOf();

	var $apply = requireFunctionApply();
	var $call = requireFunctionCall();

	var needsEval = {};

	var TypedArray = typeof Uint8Array === 'undefined' || !getProto ? undefined$1 : getProto(Uint8Array);

	var INTRINSICS = {
		__proto__: null,
		'%AggregateError%': typeof AggregateError === 'undefined' ? undefined$1 : AggregateError,
		'%Array%': Array,
		'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined$1 : ArrayBuffer,
		'%ArrayIteratorPrototype%': hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined$1,
		'%AsyncFromSyncIteratorPrototype%': undefined$1,
		'%AsyncFunction%': needsEval,
		'%AsyncGenerator%': needsEval,
		'%AsyncGeneratorFunction%': needsEval,
		'%AsyncIteratorPrototype%': needsEval,
		'%Atomics%': typeof Atomics === 'undefined' ? undefined$1 : Atomics,
		'%BigInt%': typeof BigInt === 'undefined' ? undefined$1 : BigInt,
		'%BigInt64Array%': typeof BigInt64Array === 'undefined' ? undefined$1 : BigInt64Array,
		'%BigUint64Array%': typeof BigUint64Array === 'undefined' ? undefined$1 : BigUint64Array,
		'%Boolean%': Boolean,
		'%DataView%': typeof DataView === 'undefined' ? undefined$1 : DataView,
		'%Date%': Date,
		'%decodeURI%': decodeURI,
		'%decodeURIComponent%': decodeURIComponent,
		'%encodeURI%': encodeURI,
		'%encodeURIComponent%': encodeURIComponent,
		'%Error%': $Error,
		'%eval%': eval, // eslint-disable-line no-eval
		'%EvalError%': $EvalError,
		'%Float16Array%': typeof Float16Array === 'undefined' ? undefined$1 : Float16Array,
		'%Float32Array%': typeof Float32Array === 'undefined' ? undefined$1 : Float32Array,
		'%Float64Array%': typeof Float64Array === 'undefined' ? undefined$1 : Float64Array,
		'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined$1 : FinalizationRegistry,
		'%Function%': $Function,
		'%GeneratorFunction%': needsEval,
		'%Int8Array%': typeof Int8Array === 'undefined' ? undefined$1 : Int8Array,
		'%Int16Array%': typeof Int16Array === 'undefined' ? undefined$1 : Int16Array,
		'%Int32Array%': typeof Int32Array === 'undefined' ? undefined$1 : Int32Array,
		'%isFinite%': isFinite,
		'%isNaN%': isNaN,
		'%IteratorPrototype%': hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined$1,
		'%JSON%': typeof JSON === 'object' ? JSON : undefined$1,
		'%Map%': typeof Map === 'undefined' ? undefined$1 : Map,
		'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols || !getProto ? undefined$1 : getProto(new Map()[Symbol.iterator]()),
		'%Math%': Math,
		'%Number%': Number,
		'%Object%': $Object,
		'%Object.getOwnPropertyDescriptor%': $gOPD,
		'%parseFloat%': parseFloat,
		'%parseInt%': parseInt,
		'%Promise%': typeof Promise === 'undefined' ? undefined$1 : Promise,
		'%Proxy%': typeof Proxy === 'undefined' ? undefined$1 : Proxy,
		'%RangeError%': $RangeError,
		'%ReferenceError%': $ReferenceError,
		'%Reflect%': typeof Reflect === 'undefined' ? undefined$1 : Reflect,
		'%RegExp%': RegExp,
		'%Set%': typeof Set === 'undefined' ? undefined$1 : Set,
		'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols || !getProto ? undefined$1 : getProto(new Set()[Symbol.iterator]()),
		'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined$1 : SharedArrayBuffer,
		'%String%': String,
		'%StringIteratorPrototype%': hasSymbols && getProto ? getProto(''[Symbol.iterator]()) : undefined$1,
		'%Symbol%': hasSymbols ? Symbol : undefined$1,
		'%SyntaxError%': $SyntaxError,
		'%ThrowTypeError%': ThrowTypeError,
		'%TypedArray%': TypedArray,
		'%TypeError%': $TypeError,
		'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined$1 : Uint8Array,
		'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined$1 : Uint8ClampedArray,
		'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined$1 : Uint16Array,
		'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined$1 : Uint32Array,
		'%URIError%': $URIError,
		'%WeakMap%': typeof WeakMap === 'undefined' ? undefined$1 : WeakMap,
		'%WeakRef%': typeof WeakRef === 'undefined' ? undefined$1 : WeakRef,
		'%WeakSet%': typeof WeakSet === 'undefined' ? undefined$1 : WeakSet,

		'%Function.prototype.call%': $call,
		'%Function.prototype.apply%': $apply,
		'%Object.defineProperty%': $defineProperty,
		'%Object.getPrototypeOf%': $ObjectGPO,
		'%Math.abs%': abs,
		'%Math.floor%': floor,
		'%Math.max%': max,
		'%Math.min%': min,
		'%Math.pow%': pow,
		'%Math.round%': round,
		'%Math.sign%': sign,
		'%Reflect.getPrototypeOf%': $ReflectGPO
	};

	if (getProto) {
		try {
			null.error; // eslint-disable-line no-unused-expressions
		} catch (e) {
			// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
			var errorProto = getProto(getProto(e));
			INTRINSICS['%Error.prototype%'] = errorProto;
		}
	}

	var doEval = function doEval(name) {
		var value;
		if (name === '%AsyncFunction%') {
			value = getEvalledConstructor('async function () {}');
		} else if (name === '%GeneratorFunction%') {
			value = getEvalledConstructor('function* () {}');
		} else if (name === '%AsyncGeneratorFunction%') {
			value = getEvalledConstructor('async function* () {}');
		} else if (name === '%AsyncGenerator%') {
			var fn = doEval('%AsyncGeneratorFunction%');
			if (fn) {
				value = fn.prototype;
			}
		} else if (name === '%AsyncIteratorPrototype%') {
			var gen = doEval('%AsyncGenerator%');
			if (gen && getProto) {
				value = getProto(gen.prototype);
			}
		}

		INTRINSICS[name] = value;

		return value;
	};

	var LEGACY_ALIASES = {
		__proto__: null,
		'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
		'%ArrayPrototype%': ['Array', 'prototype'],
		'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
		'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
		'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
		'%ArrayProto_values%': ['Array', 'prototype', 'values'],
		'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
		'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
		'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
		'%BooleanPrototype%': ['Boolean', 'prototype'],
		'%DataViewPrototype%': ['DataView', 'prototype'],
		'%DatePrototype%': ['Date', 'prototype'],
		'%ErrorPrototype%': ['Error', 'prototype'],
		'%EvalErrorPrototype%': ['EvalError', 'prototype'],
		'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
		'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
		'%FunctionPrototype%': ['Function', 'prototype'],
		'%Generator%': ['GeneratorFunction', 'prototype'],
		'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
		'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
		'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
		'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
		'%JSONParse%': ['JSON', 'parse'],
		'%JSONStringify%': ['JSON', 'stringify'],
		'%MapPrototype%': ['Map', 'prototype'],
		'%NumberPrototype%': ['Number', 'prototype'],
		'%ObjectPrototype%': ['Object', 'prototype'],
		'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
		'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
		'%PromisePrototype%': ['Promise', 'prototype'],
		'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
		'%Promise_all%': ['Promise', 'all'],
		'%Promise_reject%': ['Promise', 'reject'],
		'%Promise_resolve%': ['Promise', 'resolve'],
		'%RangeErrorPrototype%': ['RangeError', 'prototype'],
		'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
		'%RegExpPrototype%': ['RegExp', 'prototype'],
		'%SetPrototype%': ['Set', 'prototype'],
		'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
		'%StringPrototype%': ['String', 'prototype'],
		'%SymbolPrototype%': ['Symbol', 'prototype'],
		'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
		'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
		'%TypeErrorPrototype%': ['TypeError', 'prototype'],
		'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
		'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
		'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
		'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
		'%URIErrorPrototype%': ['URIError', 'prototype'],
		'%WeakMapPrototype%': ['WeakMap', 'prototype'],
		'%WeakSetPrototype%': ['WeakSet', 'prototype']
	};

	var bind = requireFunctionBind();
	var hasOwn = /*@__PURE__*/ requireHasown();
	var $concat = bind.call($call, Array.prototype.concat);
	var $spliceApply = bind.call($apply, Array.prototype.splice);
	var $replace = bind.call($call, String.prototype.replace);
	var $strSlice = bind.call($call, String.prototype.slice);
	var $exec = bind.call($call, RegExp.prototype.exec);

	/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
	var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
	var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
	var stringToPath = function stringToPath(string) {
		var first = $strSlice(string, 0, 1);
		var last = $strSlice(string, -1);
		if (first === '%' && last !== '%') {
			throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
		} else if (last === '%' && first !== '%') {
			throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
		}
		var result = [];
		$replace(string, rePropName, function (match, number, quote, subString) {
			result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
		});
		return result;
	};
	/* end adaptation */

	var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
		var intrinsicName = name;
		var alias;
		if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
			alias = LEGACY_ALIASES[intrinsicName];
			intrinsicName = '%' + alias[0] + '%';
		}

		if (hasOwn(INTRINSICS, intrinsicName)) {
			var value = INTRINSICS[intrinsicName];
			if (value === needsEval) {
				value = doEval(intrinsicName);
			}
			if (typeof value === 'undefined' && !allowMissing) {
				throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
			}

			return {
				alias: alias,
				name: intrinsicName,
				value: value
			};
		}

		throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
	};

	getIntrinsic = function GetIntrinsic(name, allowMissing) {
		if (typeof name !== 'string' || name.length === 0) {
			throw new $TypeError('intrinsic name must be a non-empty string');
		}
		if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
			throw new $TypeError('"allowMissing" argument must be a boolean');
		}

		if ($exec(/^%?[^%]*%?$/, name) === null) {
			throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
		}
		var parts = stringToPath(name);
		var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

		var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
		var intrinsicRealName = intrinsic.name;
		var value = intrinsic.value;
		var skipFurtherCaching = false;

		var alias = intrinsic.alias;
		if (alias) {
			intrinsicBaseName = alias[0];
			$spliceApply(parts, $concat([0, 1], alias));
		}

		for (var i = 1, isOwn = true; i < parts.length; i += 1) {
			var part = parts[i];
			var first = $strSlice(part, 0, 1);
			var last = $strSlice(part, -1);
			if (
				(
					(first === '"' || first === "'" || first === '`')
					|| (last === '"' || last === "'" || last === '`')
				)
				&& first !== last
			) {
				throw new $SyntaxError('property names with quotes must have matching quotes');
			}
			if (part === 'constructor' || !isOwn) {
				skipFurtherCaching = true;
			}

			intrinsicBaseName += '.' + part;
			intrinsicRealName = '%' + intrinsicBaseName + '%';

			if (hasOwn(INTRINSICS, intrinsicRealName)) {
				value = INTRINSICS[intrinsicRealName];
			} else if (value != null) {
				if (!(part in value)) {
					if (!allowMissing) {
						throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
					}
					return void undefined$1;
				}
				if ($gOPD && (i + 1) >= parts.length) {
					var desc = $gOPD(value, part);
					isOwn = !!desc;

					// By convention, when a data property is converted to an accessor
					// property to emulate a data property that does not suffer from
					// the override mistake, that accessor's getter is marked with
					// an `originalValue` property. Here, when we detect this, we
					// uphold the illusion by pretending to see that original data
					// property, i.e., returning the value rather than the getter
					// itself.
					if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
						value = desc.get;
					} else {
						value = value[part];
					}
				} else {
					isOwn = hasOwn(value, part);
					value = value[part];
				}

				if (isOwn && !skipFurtherCaching) {
					INTRINSICS[intrinsicRealName] = value;
				}
			}
		}
		return value;
	};
	return getIntrinsic;
}

var defineDataProperty;
var hasRequiredDefineDataProperty;

function requireDefineDataProperty () {
	if (hasRequiredDefineDataProperty) return defineDataProperty;
	hasRequiredDefineDataProperty = 1;

	var $defineProperty = /*@__PURE__*/ requireEsDefineProperty();

	var $SyntaxError = /*@__PURE__*/ requireSyntax();
	var $TypeError = /*@__PURE__*/ requireType();

	var gopd = /*@__PURE__*/ requireGopd();

	/** @type {import('.')} */
	defineDataProperty = function defineDataProperty(
		obj,
		property,
		value
	) {
		if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) {
			throw new $TypeError('`obj` must be an object or a function`');
		}
		if (typeof property !== 'string' && typeof property !== 'symbol') {
			throw new $TypeError('`property` must be a string or a symbol`');
		}
		if (arguments.length > 3 && typeof arguments[3] !== 'boolean' && arguments[3] !== null) {
			throw new $TypeError('`nonEnumerable`, if provided, must be a boolean or null');
		}
		if (arguments.length > 4 && typeof arguments[4] !== 'boolean' && arguments[4] !== null) {
			throw new $TypeError('`nonWritable`, if provided, must be a boolean or null');
		}
		if (arguments.length > 5 && typeof arguments[5] !== 'boolean' && arguments[5] !== null) {
			throw new $TypeError('`nonConfigurable`, if provided, must be a boolean or null');
		}
		if (arguments.length > 6 && typeof arguments[6] !== 'boolean') {
			throw new $TypeError('`loose`, if provided, must be a boolean');
		}

		var nonEnumerable = arguments.length > 3 ? arguments[3] : null;
		var nonWritable = arguments.length > 4 ? arguments[4] : null;
		var nonConfigurable = arguments.length > 5 ? arguments[5] : null;
		var loose = arguments.length > 6 ? arguments[6] : false;

		/* @type {false | TypedPropertyDescriptor<unknown>} */
		var desc = !!gopd && gopd(obj, property);

		if ($defineProperty) {
			$defineProperty(obj, property, {
				configurable: nonConfigurable === null && desc ? desc.configurable : !nonConfigurable,
				enumerable: nonEnumerable === null && desc ? desc.enumerable : !nonEnumerable,
				value: value,
				writable: nonWritable === null && desc ? desc.writable : !nonWritable
			});
		} else if (loose || (!nonEnumerable && !nonWritable && !nonConfigurable)) {
			// must fall back to [[Set]], and was not explicitly asked to make non-enumerable, non-writable, or non-configurable
			obj[property] = value; // eslint-disable-line no-param-reassign
		} else {
			throw new $SyntaxError('This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.');
		}
	};
	return defineDataProperty;
}

var hasPropertyDescriptors_1;
var hasRequiredHasPropertyDescriptors;

function requireHasPropertyDescriptors () {
	if (hasRequiredHasPropertyDescriptors) return hasPropertyDescriptors_1;
	hasRequiredHasPropertyDescriptors = 1;

	var $defineProperty = /*@__PURE__*/ requireEsDefineProperty();

	var hasPropertyDescriptors = function hasPropertyDescriptors() {
		return !!$defineProperty;
	};

	hasPropertyDescriptors.hasArrayLengthDefineBug = function hasArrayLengthDefineBug() {
		// node v0.6 has a bug where array lengths can be Set but not Defined
		if (!$defineProperty) {
			return null;
		}
		try {
			return $defineProperty([], 'length', { value: 1 }).length !== 1;
		} catch (e) {
			// In Firefox 4-22, defining length on an array throws an exception.
			return true;
		}
	};

	hasPropertyDescriptors_1 = hasPropertyDescriptors;
	return hasPropertyDescriptors_1;
}

var setFunctionLength;
var hasRequiredSetFunctionLength;

function requireSetFunctionLength () {
	if (hasRequiredSetFunctionLength) return setFunctionLength;
	hasRequiredSetFunctionLength = 1;

	var GetIntrinsic = /*@__PURE__*/ requireGetIntrinsic();
	var define = /*@__PURE__*/ requireDefineDataProperty();
	var hasDescriptors = /*@__PURE__*/ requireHasPropertyDescriptors()();
	var gOPD = /*@__PURE__*/ requireGopd();

	var $TypeError = /*@__PURE__*/ requireType();
	var $floor = GetIntrinsic('%Math.floor%');

	/** @type {import('.')} */
	setFunctionLength = function setFunctionLength(fn, length) {
		if (typeof fn !== 'function') {
			throw new $TypeError('`fn` is not a function');
		}
		if (typeof length !== 'number' || length < 0 || length > 0xFFFFFFFF || $floor(length) !== length) {
			throw new $TypeError('`length` must be a positive 32-bit integer');
		}

		var loose = arguments.length > 2 && !!arguments[2];

		var functionLengthIsConfigurable = true;
		var functionLengthIsWritable = true;
		if ('length' in fn && gOPD) {
			var desc = gOPD(fn, 'length');
			if (desc && !desc.configurable) {
				functionLengthIsConfigurable = false;
			}
			if (desc && !desc.writable) {
				functionLengthIsWritable = false;
			}
		}

		if (functionLengthIsConfigurable || functionLengthIsWritable || !loose) {
			if (hasDescriptors) {
				define(/** @type {Parameters<define>[0]} */ (fn), 'length', length, true, true);
			} else {
				define(/** @type {Parameters<define>[0]} */ (fn), 'length', length);
			}
		}
		return fn;
	};
	return setFunctionLength;
}

var applyBind;
var hasRequiredApplyBind;

function requireApplyBind () {
	if (hasRequiredApplyBind) return applyBind;
	hasRequiredApplyBind = 1;

	var bind = requireFunctionBind();
	var $apply = requireFunctionApply();
	var actualApply = requireActualApply();

	/** @type {import('./applyBind')} */
	applyBind = function applyBind() {
		return actualApply(bind, $apply, arguments);
	};
	return applyBind;
}

var hasRequiredCallBind;

function requireCallBind () {
	if (hasRequiredCallBind) return callBind.exports;
	hasRequiredCallBind = 1;
	(function (module) {

		var setFunctionLength = /*@__PURE__*/ requireSetFunctionLength();

		var $defineProperty = /*@__PURE__*/ requireEsDefineProperty();

		var callBindBasic = requireCallBindApplyHelpers();
		var applyBind = requireApplyBind();

		module.exports = function callBind(originalFunction) {
			var func = callBindBasic(arguments);
			var adjustedLength = originalFunction.length - (arguments.length - 1);
			return setFunctionLength(
				func,
				1 + (adjustedLength > 0 ? adjustedLength : 0),
				true
			);
		};

		if ($defineProperty) {
			$defineProperty(module.exports, 'apply', { value: applyBind });
		} else {
			module.exports.apply = applyBind;
		} 
	} (callBind));
	return callBind.exports;
}

var callBound;
var hasRequiredCallBound;

function requireCallBound () {
	if (hasRequiredCallBound) return callBound;
	hasRequiredCallBound = 1;

	var GetIntrinsic = /*@__PURE__*/ requireGetIntrinsic();

	var callBindBasic = requireCallBindApplyHelpers();

	/** @type {(thisArg: string, searchString: string, position?: number) => number} */
	var $indexOf = callBindBasic([GetIntrinsic('%String.prototype.indexOf%')]);

	/** @type {import('.')} */
	callBound = function callBoundIntrinsic(name, allowMissing) {
		/* eslint no-extra-parens: 0 */

		var intrinsic = /** @type {(this: unknown, ...args: unknown[]) => unknown} */ (GetIntrinsic(name, !!allowMissing));
		if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
			return callBindBasic(/** @type {const} */ ([intrinsic]));
		}
		return intrinsic;
	};
	return callBound;
}

var jsonStableStringify$1;
var hasRequiredJsonStableStringify;

function requireJsonStableStringify () {
	if (hasRequiredJsonStableStringify) return jsonStableStringify$1;
	hasRequiredJsonStableStringify = 1;

	/** @type {typeof JSON.stringify} */
	var jsonStringify = (typeof JSON !== 'undefined' ? JSON : requireJsonify()).stringify;

	var isArray = requireIsarray();
	var objectKeys = requireObjectKeys();
	var callBind = requireCallBind();
	var callBound = /*@__PURE__*/ requireCallBound();

	var $join = callBound('Array.prototype.join');
	var $indexOf = callBound('Array.prototype.indexOf');
	var $splice = callBound('Array.prototype.splice');
	var $sort = callBound('Array.prototype.sort');

	/** @type {(n: number, char: string) => string} */
	var strRepeat = function repeat(n, char) {
		var str = '';
		for (var i = 0; i < n; i += 1) {
			str += char;
		}
		return str;
	};

	/** @type {(parent: import('.').Node, key: import('.').Key, value: unknown) => unknown} */
	var defaultReplacer = function (_parent, _key, value) { return value; };

	/** @type {import('.')} */
	jsonStableStringify$1 = function stableStringify(obj) {
		/** @type {Parameters<import('.')>[1]} */
		var opts = arguments.length > 1 ? arguments[1] : void undefined;
		var space = (opts && opts.space) || '';
		if (typeof space === 'number') { space = strRepeat(space, ' '); }
		var cycles = !!opts && typeof opts.cycles === 'boolean' && opts.cycles;
		/** @type {undefined | typeof defaultReplacer} */
		var replacer = opts && opts.replacer ? callBind(opts.replacer) : defaultReplacer;
		if (opts && typeof opts.collapseEmpty !== 'undefined' && typeof opts.collapseEmpty !== 'boolean') {
			throw new TypeError('`collapseEmpty` must be a boolean, if provided');
		}
		var collapseEmpty = !!opts && opts.collapseEmpty;

		var cmpOpt = typeof opts === 'function' ? opts : opts && opts.cmp;
		/** @type {undefined | (<T extends import('.').NonArrayNode>(node: T) => (a: Exclude<keyof T, symbol | number>, b: Exclude<keyof T, symbol | number>) => number)} */
		var cmp = cmpOpt && function (node) {
			// eslint-disable-next-line no-extra-parens
			var get = /** @type {NonNullable<typeof cmpOpt>} */ (cmpOpt).length > 2
				&& /** @type {import('.').Getter['get']} */ function get(k) { return node[k]; };
			return function (a, b) {
				// eslint-disable-next-line no-extra-parens
				return /** @type {NonNullable<typeof cmpOpt>} */ (cmpOpt)(
					{ key: a, value: node[a] },
					{ key: b, value: node[b] },
					// @ts-expect-error TS doesn't understand the optimization used here
					get ? /** @type {import('.').Getter} */ { __proto__: null, get: get } : void undefined
				);
			};
		};

		/** @type {import('.').Node[]} */
		var seen = [];
		return (/** @type {(parent: import('.').Node, key: string | number, node: unknown, level: number) => string | undefined} */
			function stringify(parent, key, node, level) {
				var indent = space ? '\n' + strRepeat(level, space) : '';
				var colonSeparator = space ? ': ' : ':';

				// eslint-disable-next-line no-extra-parens
				if (node && /** @type {{ toJSON?: unknown }} */ (node).toJSON && typeof /** @type {{ toJSON?: unknown }} */ (node).toJSON === 'function') {
					// eslint-disable-next-line no-extra-parens
					node = /** @type {{ toJSON: Function }} */ (node).toJSON();
				}

				node = replacer(parent, key, node);
				if (node === undefined) {
					return;
				}
				if (typeof node !== 'object' || node === null) {
					return jsonStringify(node);
				}

				/** @type {(out: string[], brackets: '[]' | '{}') => string} */
				var groupOutput = function (out, brackets) {
					return collapseEmpty && out.length === 0
						? brackets
						: (brackets === '[]' ? '[' : '{') + $join(out, ',') + indent + (brackets === '[]' ? ']' : '}');
				};

				if (isArray(node)) {
					var out = [];
					for (var i = 0; i < node.length; i++) {
						var item = stringify(node, i, node[i], level + 1) || jsonStringify(null);
						out[out.length] = indent + space + item;
					}
					return groupOutput(out, '[]');
				}

				if ($indexOf(seen, node) !== -1) {
					if (cycles) { return jsonStringify('__cycle__'); }
					throw new TypeError('Converting circular structure to JSON');
				} else {
					seen[seen.length] = /** @type {import('.').NonArrayNode} */ (node);
				}

				/** @type {import('.').Key[]} */
				// eslint-disable-next-line no-extra-parens
				var keys = $sort(objectKeys(node), cmp && cmp(/** @type {import('.').NonArrayNode} */ (node)));
				var out = [];
				for (var i = 0; i < keys.length; i++) {
					var key = keys[i];
					// eslint-disable-next-line no-extra-parens
					var value = stringify(/** @type {import('.').Node} */ (node), key, /** @type {import('.').NonArrayNode} */ (node)[key], level + 1);

					if (!value) { continue; }

					var keyValue = jsonStringify(key)
						+ colonSeparator
						+ value;

					out[out.length] = indent + space + keyValue;
				}
				$splice(seen, $indexOf(seen, node), 1);
				return groupOutput(out, '{}');
			}({ '': obj }, '', obj, 0)
		);
	};
	return jsonStableStringify$1;
}

var jsonStableStringifyExports = requireJsonStableStringify();
var jsonStableStringify = /*@__PURE__*/getDefaultExportFromCjs(jsonStableStringifyExports);

async function secretHandler(actual, errors, schema) {
  if (!this.passphrase) {
    errors.push({ actual, type: "encryptionKeyMissing" });
    return actual;
  }
  try {
    const res = await encrypt(String(actual), this.passphrase);
    return res;
  } catch (error) {
    errors.push({ actual, type: "encryptionProblem", error });
  }
  return actual;
}
async function jsonHandler(actual, errors, schema) {
  if (isString$1(actual)) return actual;
  return JSON.stringify(actual);
}
class Validator extends FastestValidator {
  constructor({ options, passphrase, autoEncrypt = true } = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,
      messages: {
        encryptionKeyMissing: "Missing configuration for secrets encryption.",
        encryptionProblem: "Problem encrypting secret. Actual: {actual}. Error: {error}"
      },
      defaults: {
        string: {
          trim: true
        },
        object: {
          strict: "remove"
        }
      }
    }, options));
    this.passphrase = passphrase;
    this.autoEncrypt = autoEncrypt;
    this.alias("secret", {
      type: "string",
      custom: this.autoEncrypt ? secretHandler : void 0,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long."
      }
    });
    this.alias("secretAny", {
      type: "any",
      custom: this.autoEncrypt ? secretHandler : void 0
    });
    this.alias("secretNumber", {
      type: "number",
      custom: this.autoEncrypt ? secretHandler : void 0
    });
    this.alias("json", {
      type: "any",
      custom: this.autoEncrypt ? jsonHandler : void 0
    });
  }
}
const ValidatorManager = new Proxy(Validator, {
  instance: null,
  construct(target, args) {
    if (!this.instance) this.instance = new target(...args);
    return this.instance;
  }
});

function toBase36(num) {
  return num.toString(36);
}
function generateBase36Mapping(keys) {
  const mapping = {};
  const reversedMapping = {};
  keys.forEach((key, index) => {
    const base36Key = toBase36(index);
    mapping[key] = base36Key;
    reversedMapping[base36Key] = key;
  });
  return { mapping, reversedMapping };
}
const SchemaActions = {
  trim: (value) => value.trim(),
  encrypt: (value, { passphrase }) => encrypt(value, passphrase),
  decrypt: async (value, { passphrase }) => {
    try {
      const raw = await decrypt(value, passphrase);
      return raw;
    } catch (error) {
      console.warn(`Schema decrypt error: ${error}`, error);
      return value;
    }
  },
  toString: (value) => String(value),
  fromArray: (value, { separator }) => {
    if (value === null || value === void 0 || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return "[]";
    }
    const escapedItems = value.map((item) => {
      if (typeof item === "string") {
        return item.replace(/\\/g, "\\\\").replace(new RegExp(`\\${separator}`, "g"), `\\${separator}`);
      }
      return String(item);
    });
    return escapedItems.join(separator);
  },
  toArray: (value, { separator }) => {
    if (value === null || value === void 0) {
      return value;
    }
    if (value === "[]") {
      return [];
    }
    if (value === "") {
      return [];
    }
    const items = [];
    let current = "";
    let i = 0;
    const str = String(value);
    while (i < str.length) {
      if (str[i] === "\\" && i + 1 < str.length) {
        if (str[i + 1] === separator) {
          current += separator;
          i += 2;
        } else if (str[i + 1] === "\\") {
          current += "\\";
          i += 2;
        } else {
          current += str[i];
          i++;
        }
      } else if (str[i] === separator) {
        items.push(current);
        current = "";
        i++;
      } else {
        current += str[i];
        i++;
      }
    }
    items.push(current);
    return items;
  },
  toJSON: (value) => JSON.stringify(value),
  fromJSON: (value) => JSON.parse(value),
  toNumber: (value) => isString$1(value) ? value.includes(".") ? parseFloat(value) : parseInt(value) : value,
  toBool: (value) => [true, 1, "true", "1", "yes", "y"].includes(value),
  fromBool: (value) => [true, 1, "true", "1", "yes", "y"].includes(value) ? "1" : "0"
};
class Schema {
  constructor(args) {
    const {
      map,
      name,
      attributes,
      passphrase,
      version = 1,
      options = {}
    } = args;
    this.name = name;
    this.version = version;
    this.attributes = attributes || {};
    this.passphrase = passphrase ?? "secret";
    this.options = merge({}, this.defaultOptions(), options);
    this.allNestedObjectsOptional = this.options.allNestedObjectsOptional ?? false;
    const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
    this.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true },
      processedAttributes
    ));
    if (this.options.generateAutoHooks) this.generateAutoHooks();
    if (!isEmpty(map)) {
      this.map = map;
      this.reversedMap = invert(map);
    } else {
      const flatAttrs = flatten(this.attributes, { safe: true });
      const leafKeys = Object.keys(flatAttrs).filter((k) => !k.includes("$$"));
      const objectKeys = this.extractObjectKeys(this.attributes);
      const allKeys = [.../* @__PURE__ */ new Set([...leafKeys, ...objectKeys])];
      const { mapping, reversedMapping } = generateBase36Mapping(allKeys);
      this.map = mapping;
      this.reversedMap = reversedMapping;
    }
  }
  defaultOptions() {
    return {
      autoEncrypt: true,
      autoDecrypt: true,
      arraySeparator: "|",
      generateAutoHooks: true,
      hooks: {
        beforeMap: {},
        afterMap: {},
        beforeUnmap: {},
        afterUnmap: {}
      }
    };
  }
  addHook(hook, attribute, action) {
    if (!this.options.hooks[hook][attribute]) this.options.hooks[hook][attribute] = [];
    this.options.hooks[hook][attribute] = uniq([...this.options.hooks[hook][attribute], action]);
  }
  extractObjectKeys(obj, prefix = "") {
    const objectKeys = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("$$")) continue;
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        objectKeys.push(fullKey);
        if (value.$$type === "object") {
          objectKeys.push(...this.extractObjectKeys(value, fullKey));
        }
      }
    }
    return objectKeys;
  }
  generateAutoHooks() {
    const schema = flatten(cloneDeep(this.attributes), { safe: true });
    for (const [name, definition] of Object.entries(schema)) {
      if (definition.includes("array")) {
        this.addHook("beforeMap", name, "fromArray");
        this.addHook("afterUnmap", name, "toArray");
      }
      if (definition.includes("secret")) {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }
        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
      }
      if (definition.includes("number")) {
        this.addHook("beforeMap", name, "toString");
        this.addHook("afterUnmap", name, "toNumber");
      }
      if (definition.includes("boolean")) {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
      }
      if (definition.includes("json")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
      }
    }
  }
  static import(data) {
    let {
      map,
      name,
      options,
      version,
      attributes
    } = isString$1(data) ? JSON.parse(data) : data;
    attributes = Schema._importAttributes(attributes);
    const schema = new Schema({
      map,
      name,
      options,
      version,
      attributes
    });
    return schema;
  }
  /**
   * Recursively import attributes, parsing only stringified objects (legacy)
   */
  static _importAttributes(attrs) {
    if (typeof attrs === "string") {
      try {
        const parsed = JSON.parse(attrs);
        if (typeof parsed === "object" && parsed !== null) {
          return Schema._importAttributes(parsed);
        }
      } catch (e) {
      }
      return attrs;
    }
    if (Array.isArray(attrs)) {
      return attrs.map((a) => Schema._importAttributes(a));
    }
    if (typeof attrs === "object" && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        out[k] = Schema._importAttributes(v);
      }
      return out;
    }
    return attrs;
  }
  export() {
    const data = {
      version: this.version,
      name: this.name,
      options: this.options,
      attributes: this._exportAttributes(this.attributes),
      map: this.map
    };
    return data;
  }
  /**
   * Recursively export attributes, keeping objects as objects and only serializing leaves as string
   */
  _exportAttributes(attrs) {
    if (typeof attrs === "string") {
      return attrs;
    }
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this._exportAttributes(a));
    }
    if (typeof attrs === "object" && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        out[k] = this._exportAttributes(v);
      }
      return out;
    }
    return attrs;
  }
  async applyHooksActions(resourceItem, hook) {
    for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
      for (const action of actions) {
        const value = get$1(resourceItem, attribute);
        if (value !== void 0 && typeof SchemaActions[action] === "function") {
          set(resourceItem, attribute, await SchemaActions[action](value, {
            passphrase: this.passphrase,
            separator: this.options.arraySeparator
          }));
        }
      }
    }
  }
  async validate(resourceItem, { mutateOriginal = false } = {}) {
    let data = mutateOriginal ? resourceItem : cloneDeep(resourceItem);
    const result = await this.validator(data);
    return result;
  }
  async mapper(resourceItem) {
    const obj = flatten(cloneDeep(resourceItem), { safe: true });
    await this.applyHooksActions(obj, "beforeMap");
    const rest = { "_v": this.version + "" };
    for (const [key, value] of Object.entries(obj)) {
      rest[this.map[key]] = value;
    }
    await this.applyHooksActions(rest, "afterMap");
    return rest;
  }
  async unmapper(mappedResourceItem) {
    const obj = cloneDeep(mappedResourceItem);
    delete obj._v;
    await this.applyHooksActions(obj, "beforeUnmap");
    const rest = {};
    for (const [key, value] of Object.entries(obj)) {
      rest[this.reversedMap[key]] = value;
    }
    await this.applyHooksActions(rest, "afterUnmap");
    return unflatten(rest);
  }
  /**
   * Preprocess attributes to convert nested objects into validator-compatible format
   * @param {Object} attributes - Original attributes
   * @returns {Object} Processed attributes for validator
   */
  preprocessAttributesForValidation(attributes) {
    const processed = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const isExplicitRequired = value.$$type && value.$$type.includes("required");
        const isExplicitOptional = value.$$type && value.$$type.includes("optional");
        const objectConfig = {
          type: "object",
          properties: this.preprocessAttributesForValidation(value),
          strict: false
        };
        if (isExplicitRequired) ; else if (isExplicitOptional || this.allNestedObjectsOptional) {
          objectConfig.optional = true;
        }
        processed[key] = objectConfig;
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }
}

var global$1 = (typeof global !== "undefined" ? global :
  typeof self !== "undefined" ? self :
  typeof window !== "undefined" ? window : {});

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var inited = false;
function init () {
  inited = true;
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }

  revLookup['-'.charCodeAt(0)] = 62;
  revLookup['_'.charCodeAt(0)] = 63;
}

function toByteArray (b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders);

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len;

  var L = 0;

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = (tmp >> 16) & 0xFF;
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[L++] = tmp & 0xFF;
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var output = '';
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[(tmp << 4) & 0x3F];
    output += '==';
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
    output += lookup[tmp >> 10];
    output += lookup[(tmp >> 4) & 0x3F];
    output += lookup[(tmp << 2) & 0x3F];
    output += '=';
  }

  parts.push(output);

  return parts.join('')
}

function read (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

function write (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
}

var toString = {}.toString;

var isArray$1 = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */


var INSPECT_MAX_BYTES = 50;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer$1.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
  ? global$1.TYPED_ARRAY_SUPPORT
  : true;

/*
 * Export kMaxLength after typed array support is determined.
 */
kMaxLength();

function kMaxLength () {
  return Buffer$1.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length);
    that.__proto__ = Buffer$1.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer$1(length);
    }
    that.length = length;
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer$1 (arg, encodingOrOffset, length) {
  if (!Buffer$1.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer$1)) {
    return new Buffer$1(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer$1.poolSize = 8192; // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer$1._augment = function (arr) {
  arr.__proto__ = Buffer$1.prototype;
  return arr
};

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer$1.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
};

if (Buffer$1.TYPED_ARRAY_SUPPORT) {
  Buffer$1.prototype.__proto__ = Uint8Array.prototype;
  Buffer$1.__proto__ = Uint8Array;
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer$1[Symbol.species] === Buffer$1) ;
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer$1.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
};

function allocUnsafe (that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer$1.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer$1.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
};

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer$1.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);

  var actual = that.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual);
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array);
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }

  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array;
    that.__proto__ = Buffer$1.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array);
  }
  return that
}

function fromObject (that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len);
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray$1(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}
Buffer$1.isBuffer = isBuffer;
function internalIsBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer$1.compare = function compare (a, b) {
  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

Buffer$1.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
};

Buffer$1.concat = function concat (list, length) {
  if (!isArray$1(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer$1.alloc(0)
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer$1.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (!internalIsBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer
};

function byteLength (string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer$1.byteLength = byteLength;

function slowToString (encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer$1.prototype._isBuffer = true;

function swap (b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer$1.prototype.swap16 = function swap16 () {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this
};

Buffer$1.prototype.swap32 = function swap32 () {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this
};

Buffer$1.prototype.swap64 = function swap64 () {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this
};

Buffer$1.prototype.toString = function toString () {
  var length = this.length | 0;
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
};

Buffer$1.prototype.equals = function equals (b) {
  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer$1.compare(this, b) === 0
};

Buffer$1.prototype.inspect = function inspect () {
  var str = '';
  var max = INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>'
};

Buffer$1.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!internalIsBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -2147483648) {
    byteOffset = -2147483648;
  }
  byteOffset = +byteOffset;  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1);
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer$1.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (Buffer$1.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer$1.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
};

Buffer$1.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
};

Buffer$1.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
};

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed;
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer$1.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0;
    if (isFinite(length)) {
      length = length | 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer$1.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
};

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf)
  } else {
    return fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res
}

Buffer$1.prototype.slice = function slice (start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf;
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end);
    newBuf.__proto__ = Buffer$1.prototype;
  } else {
    var sliceLen = end - start;
    newBuf = new Buffer$1(sliceLen, undefined);
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start];
    }
  }

  return newBuf
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer$1.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val
};

Buffer$1.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val
};

Buffer$1.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset]
};

Buffer$1.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | (this[offset + 1] << 8)
};

Buffer$1.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return (this[offset] << 8) | this[offset + 1]
};

Buffer$1.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
};

Buffer$1.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
};

Buffer$1.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer$1.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer$1.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
};

Buffer$1.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | (this[offset + 1] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer$1.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | (this[offset] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer$1.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
};

Buffer$1.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
};

Buffer$1.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, true, 23, 4)
};

Buffer$1.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, false, 23, 4)
};

Buffer$1.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, true, 52, 8)
};

Buffer$1.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, false, 52, 8)
};

function checkInt (buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer$1.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  this[offset] = (value & 0xff);
  return offset + 1
};

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8;
  }
}

Buffer$1.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer$1.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
  }
}

Buffer$1.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24);
    this[offset + 2] = (value >>> 16);
    this[offset + 1] = (value >>> 8);
    this[offset] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer$1.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

Buffer$1.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -128);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = (value & 0xff);
  return offset + 1
};

Buffer$1.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer$1.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

Buffer$1.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
    this[offset + 2] = (value >>> 16);
    this[offset + 3] = (value >>> 24);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer$1.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
  if (value < 0) value = 0xffffffff + value + 1;
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4
}

Buffer$1.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
};

Buffer$1.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
};

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8
}

Buffer$1.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
};

Buffer$1.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer$1.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;
  var i;

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else if (len < 1000 || !Buffer$1.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    );
  }

  return len
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer$1.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (code < 256) {
        val = code;
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer$1.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = internalIsBuffer(val)
      ? val
      : utf8ToBytes(new Buffer$1(val, encoding).toString());
    var len = bytes.length;
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        }

        // valid lead
        leadSurrogate = codePoint;

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray
}


function base64ToBytes (str) {
  return toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i];
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}


// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
}

function isFastBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
}

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global$1.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global$1.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}
function nextTick(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
var title = 'browser';
var platform = 'browser';
var browser = true;
var env = {};
var argv = [];
var version = ''; // empty string to avoid regexp issues
var versions = {};
var release = {};
var config = {};

function noop() {}

var on = noop;
var addListener = noop;
var once = noop;
var off = noop;
var removeListener = noop;
var removeAllListeners = noop;
var emit = noop;

function binding$1(name) {
    throw new Error('process.binding is not supported');
}

function cwd () { return '/' }
function chdir (dir) {
    throw new Error('process.chdir is not supported');
}function umask() { return 0; }

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
var performance = global$1.performance || {};
var performanceNow =
  performance.now        ||
  performance.mozNow     ||
  performance.msNow      ||
  performance.oNow       ||
  performance.webkitNow  ||
  function(){ return (new Date()).getTime() };

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
function hrtime(previousTimestamp){
  var clocktime = performanceNow.call(performance)*1e-3;
  var seconds = Math.floor(clocktime);
  var nanoseconds = Math.floor((clocktime%1)*1e9);
  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0];
    nanoseconds = nanoseconds - previousTimestamp[1];
    if (nanoseconds<0) {
      seconds--;
      nanoseconds += 1e9;
    }
  }
  return [seconds,nanoseconds]
}

var startTime = new Date();
function uptime() {
  var currentTime = new Date();
  var dif = currentTime - startTime;
  return dif / 1000;
}

var browser$1 = {
  nextTick: nextTick,
  title: title,
  browser: browser,
  env: env,
  argv: argv,
  version: version,
  versions: versions,
  on: on,
  addListener: addListener,
  once: once,
  off: off,
  removeListener: removeListener,
  removeAllListeners: removeAllListeners,
  emit: emit,
  binding: binding$1,
  cwd: cwd,
  chdir: chdir,
  umask: umask,
  hrtime: hrtime,
  platform: platform,
  release: release,
  config: config,
  uptime: uptime
};

var inherits;
if (typeof Object.create === 'function'){
  inherits = function inherits(ctor, superCtor) {
    // implementation from standard node.js 'util' module
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  inherits = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  };
}

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
function format(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
}

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
function deprecate(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global$1.process)) {
    return function() {
      return deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (browser$1.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (browser$1.throwDeprecation) {
        throw new Error(msg);
      } else if (browser$1.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

var debugs = {};
var debugEnviron;
function debuglog(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = browser$1.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = 0;
      debugs[set] = function() {
        var msg = format.apply(null, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
}

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    _extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var length = output.reduce(function(prev, cur) {
    if (cur.indexOf('\n') >= 0) ;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}

function isBoolean(arg) {
  return typeof arg === 'boolean';
}

function isNull(arg) {
  return arg === null;
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isString(arg) {
  return typeof arg === 'string';
}

function isUndefined(arg) {
  return arg === void 0;
}

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}

function isFunction(arg) {
  return typeof arg === 'function';
}

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

function _extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

promisify.custom = kCustomPromisifiedSymbol;

function BufferList() {
  this.head = null;
  this.tail = null;
  this.length = 0;
}

BufferList.prototype.push = function (v) {
  var entry = { data: v, next: null };
  if (this.length > 0) this.tail.next = entry;else this.head = entry;
  this.tail = entry;
  ++this.length;
};

BufferList.prototype.unshift = function (v) {
  var entry = { data: v, next: this.head };
  if (this.length === 0) this.tail = entry;
  this.head = entry;
  ++this.length;
};

BufferList.prototype.shift = function () {
  if (this.length === 0) return;
  var ret = this.head.data;
  if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
  --this.length;
  return ret;
};

BufferList.prototype.clear = function () {
  this.head = this.tail = null;
  this.length = 0;
};

BufferList.prototype.join = function (s) {
  if (this.length === 0) return '';
  var p = this.head;
  var ret = '' + p.data;
  while (p = p.next) {
    ret += s + p.data;
  }return ret;
};

BufferList.prototype.concat = function (n) {
  if (this.length === 0) return Buffer$1.alloc(0);
  if (this.length === 1) return this.head.data;
  var ret = Buffer$1.allocUnsafe(n >>> 0);
  var p = this.head;
  var i = 0;
  while (p) {
    p.data.copy(ret, i);
    i += p.data.length;
    p = p.next;
  }
  return ret;
};

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var isBufferEncoding = Buffer$1.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     };


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
function StringDecoder(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer$1(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
}

// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

Readable.ReadableState = ReadableState;

var debug = debuglog('stream');
inherits(Readable, EventEmitter);

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') {
    return emitter.prependListener(event, fn);
  } else {
    // This is a hack to make sure that our error handler is attached before any
    // userland ones.  NEVER DO THIS. This is here only because this code needs
    // to continue to work with older versions of Node.js that do not include
    // the prependListener() method. The goal is to eventually remove this hack.
    if (!emitter._events || !emitter._events[event])
      emitter.on(event, fn);
    else if (Array.isArray(emitter._events[event]))
      emitter._events[event].unshift(fn);
    else
      emitter._events[event] = [fn, emitter._events[event]];
  }
}
function listenerCount (emitter, type) {
  return emitter.listeners(type).length;
}
function ReadableState(options, stream) {

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}
function Readable(options) {

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options && typeof options.read === 'function') this._read = options.read;

  EventEmitter.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;

  if (!state.objectMode && typeof chunk === 'string') {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = Buffer$1.from(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var _e = new Error('stream.unshift() after end event');
      stream.emit('error', _e);
    } else {
      var skipAdd;
      if (state.decoder && !addToFront && !encoding) {
        chunk = state.decoder.write(chunk);
        skipAdd = !state.objectMode && chunk.length === 0;
      }

      if (!addToFront) state.reading = false;

      // Don't add to the buffer if we've decoded to an empty string chunk and
      // we're not in object mode
      if (!skipAdd) {
        // if we want the data now, just emit it.
        if (state.flowing && state.length === 0 && !state.sync) {
          stream.emit('data', chunk);
          stream.read(0);
        } else {
          // update the buffer info.
          state.length += state.objectMode ? 1 : chunk.length;
          if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

          if (state.needReadable) emitReadable(stream);
        }
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer$1.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false);

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted) nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (listenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && src.listeners('data').length) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var _i = 0; _i < len; _i++) {
      dests[_i].emit('unpipe', this);
    }return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1) return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = EventEmitter.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function (ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer$1.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

Writable.WritableState = WritableState;
inherits(Writable, EventEmitter);

function nop() {}

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

function WritableState(options, stream) {
  Object.defineProperty(this, 'buffer', {
    get: deprecate(function () {
      return this.getBuffer();
    }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.')
  });
  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function writableStateGetBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};
function Writable(options) {

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex)) return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;
  }

  EventEmitter.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  nextTick(cb, er);
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;
  // Always throw error if a null is written
  // if we are not in object mode then throw
  // if it is not a buffer, string, or undefined.
  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (!Buffer$1.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer$1.isBuffer(chunk)) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer$1.from(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);

  if (Buffer$1.isBuffer(chunk)) encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = new WriteReq(chunk, encoding, cb);
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;
  if (sync) nextTick(cb, er);else cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
        nextTick(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
        afterWrite(stream, state, finished, cb);
      }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    while (entry) {
      buffer[count] = entry;
      entry = entry.next;
      count += 1;
    }

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequestCount = 0;
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else {
      prefinish(stream, state);
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function (err) {
    var entry = _this.entry;
    _this.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err);
      entry = entry.next;
    }
    if (state.corkedRequestsFree) {
      state.corkedRequestsFree.next = _this;
    } else {
      state.corkedRequestsFree = _this;
    }
  };
}

inherits(Duplex, Readable);

var keys = Object.keys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
}
function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

inherits(Transform, Duplex);

function TransformState(stream) {
  this.afterTransform = function (er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
  this.writeencoding = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined) stream.push(data);

  cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}
function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  this.once('prefinish', function () {
    if (typeof this._flush === 'function') this._flush(function (er) {
      done(stream, er);
    });else done(stream);
  });
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('Not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

function done(stream, er) {
  if (er) return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length) throw new Error('Calling transform done when ws.length != 0');

  if (ts.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}

inherits(PassThrough, Transform);
function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

inherits(Stream, EventEmitter);
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EventEmitter.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EventEmitter.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

class ResourceIdsReader extends EventEmitter {
  constructor({ resource }) {
    super();
    this.resource = resource;
    this.client = resource.client;
    this.stream = new ReadableStream({
      highWaterMark: this.client.parallelism * 3,
      start: this._start.bind(this),
      pull: this._pull.bind(this),
      cancel: this._cancel.bind(this)
    });
  }
  build() {
    return this.stream.getReader();
  }
  async _start(controller) {
    this.controller = controller;
    this.continuationToken = null;
    this.closeNextIteration = false;
  }
  async _pull(controller) {
    if (this.closeNextIteration) {
      controller.close();
      return;
    }
    const response = await this.client.listObjects({
      prefix: `resource=${this.resource.name}`,
      continuationToken: this.continuationToken
    });
    const keys = response?.Contents.map((x) => x.Key).map((x) => x.replace(this.client.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x).map((x) => x.replace(`resource=${this.resource.name}/id=`, ""));
    this.continuationToken = response.NextContinuationToken;
    this.enqueue(keys);
    if (!response.IsTruncated) this.closeNextIteration = true;
  }
  enqueue(ids) {
    ids.forEach((key) => {
      this.controller.enqueue(key);
      this.emit("id", key);
    });
  }
  _cancel(reason) {
    console.warn("Stream cancelled", reason);
  }
}

class ResourceIdsPageReader extends ResourceIdsReader {
  enqueue(ids) {
    this.controller.enqueue(ids);
    this.emit("page", ids);
  }
}

class ResourceReader extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super();
    if (!resource) {
      throw new Error("Resource is required for ResourceReader");
    }
    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.input = new ResourceIdsPageReader({ resource: this.resource });
    this.transform = new Transform({
      objectMode: true,
      transform: this._transform.bind(this)
    });
    this.input.on("data", (chunk) => {
      this.transform.write(chunk);
    });
    this.input.on("end", () => {
      this.transform.end();
    });
    this.input.on("error", (error) => {
      this.emit("error", error);
    });
    this.transform.on("data", (data) => {
      this.emit("data", data);
    });
    this.transform.on("end", () => {
      this.emit("end");
    });
    this.transform.on("error", (error) => {
      this.emit("error", error);
    });
  }
  build() {
    return this;
  }
  async _transform(chunk, encoding, callback) {
    try {
      await PromisePool.for(chunk).withConcurrency(this.concurrency).handleError(async (error, content) => {
        this.emit("error", error, content);
      }).process(async (id) => {
        const data = await this.resource.get(id);
        this.push(data);
        return data;
      });
      callback();
    } catch (error) {
      callback(error);
    }
  }
  resume() {
    this.input.resume();
  }
}

class ResourceWriter extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super();
    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.buffer = [];
    this.writing = false;
    this.writable = new Writable({
      objectMode: true,
      write: this._write.bind(this)
    });
    this.writable.on("finish", () => {
      this.emit("finish");
    });
    this.writable.on("error", (error) => {
      this.emit("error", error);
    });
  }
  build() {
    return this;
  }
  write(chunk) {
    this.buffer.push(chunk);
    this._maybeWrite().catch((error) => {
      this.emit("error", error);
    });
    return true;
  }
  end() {
    this.ended = true;
    this._maybeWrite().catch((error) => {
      this.emit("error", error);
    });
  }
  async _maybeWrite() {
    if (this.writing) return;
    if (this.buffer.length === 0 && !this.ended) return;
    this.writing = true;
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      try {
        await PromisePool.for(batch).withConcurrency(this.concurrency).handleError(async (error, content) => {
          this.emit("error", error, content);
        }).process(async (item) => {
          await this.resource.insert(item);
        });
      } catch (error) {
        this.emit("error", error);
      }
    }
    this.writing = false;
    if (this.ended) {
      this.writable.emit("finish");
    }
  }
  async _write(chunk, encoding, callback) {
    callback();
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

function calculateUTF8Bytes(str) {
  if (typeof str !== "string") {
    str = String(str);
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i);
    if (codePoint <= 127) {
      bytes += 1;
    } else if (codePoint <= 2047) {
      bytes += 2;
    } else if (codePoint <= 65535) {
      bytes += 3;
    } else if (codePoint <= 1114111) {
      bytes += 4;
      if (codePoint > 65535) {
        i++;
      }
    }
  }
  return bytes;
}
function calculateAttributeNamesSize(mappedObject) {
  let totalSize = 0;
  for (const key of Object.keys(mappedObject)) {
    totalSize += calculateUTF8Bytes(key);
  }
  return totalSize;
}
function transformValue(value) {
  if (value === null || value === void 0) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return value.map((item) => String(item)).join("|");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function calculateAttributeSizes(mappedObject) {
  const sizes = {};
  for (const [key, value] of Object.entries(mappedObject)) {
    const transformedValue = transformValue(value);
    const byteSize = calculateUTF8Bytes(transformedValue);
    sizes[key] = byteSize;
  }
  return sizes;
}
function calculateTotalSize(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((total, size) => total + size, 0);
  const namesSize = calculateAttributeNamesSize(mappedObject);
  return valueTotal + namesSize;
}
function getSizeBreakdown(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const namesSize = calculateAttributeNamesSize(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((sum, size) => sum + size, 0);
  const total = valueTotal + namesSize;
  const sortedAttributes = Object.entries(valueSizes).sort(([, a], [, b]) => b - a).map(([key, size]) => ({
    attribute: key,
    size,
    percentage: (size / total * 100).toFixed(2) + "%"
  }));
  return {
    total,
    valueSizes,
    namesSize,
    valueTotal,
    breakdown: sortedAttributes,
    // Add detailed breakdown including names
    detailedBreakdown: {
      values: valueTotal,
      names: namesSize,
      total
    }
  };
}

const S3_METADATA_LIMIT_BYTES = 2048;
async function handleInsert$4({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: "" };
}
async function handleUpdate$4({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: "" };
}
async function handleUpsert$4({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: "" };
}
async function handleGet$4({ resource, metadata, body }) {
  return { metadata, body };
}

var enforceLimits = /*#__PURE__*/Object.freeze({
  __proto__: null,
  S3_METADATA_LIMIT_BYTES: S3_METADATA_LIMIT_BYTES,
  handleGet: handleGet$4,
  handleInsert: handleInsert$4,
  handleUpdate: handleUpdate$4,
  handleUpsert: handleUpsert$4
});

async function handleInsert$3({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit("exceedsLimit", {
      operation: "insert",
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}
async function handleUpdate$3({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit("exceedsLimit", {
      operation: "update",
      id,
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}
async function handleUpsert$3({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit("exceedsLimit", {
      operation: "upsert",
      id,
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}
async function handleGet$3({ resource, metadata, body }) {
  return { metadata, body };
}

var userManaged = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$3,
  handleInsert: handleInsert$3,
  handleUpdate: handleUpdate$3,
  handleUpsert: handleUpsert$3
});

const TRUNCATE_SUFFIX = "...";
const TRUNCATE_SUFFIX_BYTES = calculateUTF8Bytes(TRUNCATE_SUFFIX);
async function handleInsert$2({ resource, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}
async function handleUpdate$2({ resource, id, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}
async function handleUpsert$2({ resource, id, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}
async function handleGet$2({ resource, metadata, body }) {
  return { metadata, body };
}
function handleTruncate({ resource, data, mappedData }) {
  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedAttributes = Object.entries(attributeSizes).sort(([, sizeA], [, sizeB]) => sizeA - sizeB);
  const result = {};
  let currentSize = 0;
  for (const [key, size] of sortedAttributes) {
    const availableSpace = S3_METADATA_LIMIT_BYTES - currentSize;
    if (size <= availableSpace) {
      result[key] = mappedData[key];
      currentSize += size;
    } else if (availableSpace > TRUNCATE_SUFFIX_BYTES) {
      const maxContentBytes = availableSpace - TRUNCATE_SUFFIX_BYTES;
      const originalValue = transformValue(mappedData[key]);
      let truncatedValue = "";
      let bytes = 0;
      for (let i = 0; i < originalValue.length; i++) {
        const char = originalValue[i];
        const charBytes = calculateUTF8Bytes(char);
        if (bytes + charBytes <= maxContentBytes) {
          truncatedValue += char;
          bytes += charBytes;
        } else {
          break;
        }
      }
      result[key] = truncatedValue + TRUNCATE_SUFFIX;
      currentSize = S3_METADATA_LIMIT_BYTES;
      break;
    } else {
      break;
    }
  }
  return { mappedData: result, body: "" };
}

var dataTruncate = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$2,
  handleInsert: handleInsert$2,
  handleUpdate: handleUpdate$2,
  handleUpsert: handleUpsert$2
});

const OVERFLOW_FLAG = "$overflow";
const OVERFLOW_FLAG_VALUE = "true";
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);
async function handleInsert$1({ resource, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}
async function handleUpdate$1({ resource, id, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}
async function handleUpsert$1({ resource, id, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}
async function handleGet$1({ resource, metadata, body }) {
  if (metadata[OVERFLOW_FLAG] === OVERFLOW_FLAG_VALUE) {
    try {
      const bodyData = body ? JSON.parse(body) : {};
      const cleanMetadata = { ...metadata };
      delete cleanMetadata[OVERFLOW_FLAG];
      const mergedData = { ...cleanMetadata, ...bodyData };
      return { metadata: mergedData, body: "" };
    } catch (error) {
      return { metadata, body };
    }
  }
  return { metadata, body };
}
function handleOverflow({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize <= S3_METADATA_LIMIT_BYTES) {
    return { mappedData, body: "" };
  }
  const availableMetadataSpace = S3_METADATA_LIMIT_BYTES - OVERFLOW_FLAG_BYTES;
  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedAttributes = Object.entries(attributeSizes).sort(([, sizeA], [, sizeB]) => sizeA - sizeB);
  const metadataAttributes = {};
  const bodyAttributes = {};
  let currentMetadataSize = 0;
  for (const [key, size] of sortedAttributes) {
    if (currentMetadataSize + size <= availableMetadataSpace) {
      metadataAttributes[key] = mappedData[key];
      currentMetadataSize += size;
    } else {
      bodyAttributes[key] = mappedData[key];
    }
  }
  metadataAttributes[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
  const bodyContent = Object.keys(bodyAttributes).length > 0 ? JSON.stringify(bodyAttributes) : "";
  return {
    mappedData: metadataAttributes,
    body: bodyContent
  };
}

var bodyOverflow = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$1,
  handleInsert: handleInsert$1,
  handleUpdate: handleUpdate$1,
  handleUpsert: handleUpsert$1
});

async function handleInsert({ resource, data, mappedData }) {
  const bodyContent = JSON.stringify(mappedData);
  return {
    mappedData: {},
    body: bodyContent
  };
}
async function handleUpdate({ resource, id, data, mappedData }) {
  const bodyContent = JSON.stringify(mappedData);
  return {
    mappedData: {},
    body: bodyContent
  };
}
async function handleUpsert({ resource, id, data, mappedData }) {
  const bodyContent = JSON.stringify(mappedData);
  return {
    mappedData: {},
    body: bodyContent
  };
}
async function handleGet({ resource, metadata, body }) {
  try {
    const bodyData = body ? JSON.parse(body) : {};
    return {
      metadata: bodyData,
      body: ""
    };
  } catch (error) {
    console.warn(`Failed to parse body-only content:`, error.message);
    return {
      metadata,
      body: ""
    };
  }
}

var bodyOnly = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet,
  handleInsert: handleInsert,
  handleUpdate: handleUpdate,
  handleUpsert: handleUpsert
});

const behaviors = {
  "user-managed": userManaged,
  "enforce-limits": enforceLimits,
  "data-truncate": dataTruncate,
  "body-overflow": bodyOverflow,
  "body-only": bodyOnly
};
function getBehavior(behaviorName) {
  const behavior = behaviors[behaviorName];
  if (!behavior) {
    throw new Error(`Unknown behavior: ${behaviorName}. Available behaviors: ${Object.keys(behaviors).join(", ")}`);
  }
  return behavior;
}
const AVAILABLE_BEHAVIORS = Object.keys(behaviors);
const DEFAULT_BEHAVIOR = "user-managed";

function createIdGeneratorWithSize(size) {
  return customAlphabet(urlAlphabet, size);
}
class Resource extends EventEmitter {
  /**
   * Create a new Resource instance
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.client - S3 client instance
   * @param {string} [config.version='v0'] - Resource version
   * @param {Object} [config.attributes={}] - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
   * @param {string} [config.passphrase='secret'] - Encryption passphrase
   * @param {number} [config.parallelism=10] - Parallelism for bulk operations
   * @param {Array} [config.observers=[]] - Observer instances
   * @param {boolean} [config.cache=false] - Enable caching
   * @param {boolean} [config.autoDecrypt=true] - Auto-decrypt secret fields
   * @param {boolean} [config.timestamps=false] - Enable automatic timestamps
   * @param {Object} [config.partitions={}] - Partition definitions
   * @param {boolean} [config.paranoid=true] - Security flag for dangerous operations
   * @param {boolean} [config.allNestedObjectsOptional=false] - Make nested objects optional
   * @param {Object} [config.hooks={}] - Custom hooks
   * @param {Object} [config.options={}] - Additional options
   * @param {Function} [config.idGenerator] - Custom ID generator function
   * @param {number} [config.idSize=22] - Size for auto-generated IDs
   * @param {boolean} [config.versioningEnabled=false] - Enable versioning for this resource
   * @example
   * const users = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: {
   *     name: 'string|required',
   *     email: 'string|required',
   *     password: 'secret|required'
   *   },
   *   behavior: 'user-managed',
   *   passphrase: 'my-secret-key',
   *   timestamps: true,
   *   partitions: {
   *     byRegion: {
   *       fields: { region: 'string' }
   *     }
   *   },
   *   hooks: {
   *     preInsert: [async (data) => {
   *       console.log('Pre-insert hook:', data);
   *       return data;
   *     }]
   *   }
   * });
   * 
   * // With custom ID size
   * const shortIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idSize: 8 // Generate 8-character IDs
   * });
   * 
   * // With custom ID generator function
   * const customIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
   * });
   * 
   * // With custom ID generator using size parameter
   * const longIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: 32 // Generate 32-character IDs (same as idSize: 32)
   * });
   */
  constructor(config) {
    super();
    const validation = validateResourceConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid Resource configuration:
${validation.errors.join("\n")}`);
    }
    const {
      name,
      client,
      version = "1",
      attributes = {},
      behavior = DEFAULT_BEHAVIOR,
      passphrase = "secret",
      parallelism = 10,
      observers = [],
      cache = false,
      autoDecrypt = true,
      timestamps = false,
      partitions = {},
      paranoid = true,
      allNestedObjectsOptional = true,
      hooks = {},
      idGenerator: customIdGenerator,
      idSize = 22,
      versioningEnabled = false
    } = config;
    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? "secret";
    this.versioningEnabled = versioningEnabled;
    this.idGenerator = this.configureIdGenerator(customIdGenerator, idSize);
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoDecrypt,
      allNestedObjectsOptional
    };
    this.hooks = {
      preInsert: [],
      afterInsert: [],
      preUpdate: [],
      afterUpdate: [],
      preDelete: [],
      afterDelete: []
    };
    this.attributes = attributes || {};
    this.applyConfiguration();
    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr) && this.hooks[event]) {
          for (const fn of hooksArr) {
            if (typeof fn === "function") {
              this.hooks[event].push(fn.bind(this));
            }
          }
        }
      }
    }
  }
  /**
   * Configure ID generator based on provided options
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {Function} Configured ID generator function
   * @private
   */
  configureIdGenerator(customIdGenerator, idSize) {
    if (typeof customIdGenerator === "function") {
      return customIdGenerator;
    }
    if (typeof customIdGenerator === "number" && customIdGenerator > 0) {
      return createIdGeneratorWithSize(customIdGenerator);
    }
    if (typeof idSize === "number" && idSize > 0) {
      return createIdGeneratorWithSize(idSize);
    }
    return idGenerator;
  }
  /**
   * Get resource options (for backward compatibility with tests)
   */
  get options() {
    return {
      timestamps: this.config.timestamps,
      partitions: this.config.partitions || {},
      cache: this.config.cache,
      autoDecrypt: this.config.autoDecrypt,
      paranoid: this.config.paranoid,
      allNestedObjectsOptional: this.config.allNestedObjectsOptional
    };
  }
  export() {
    const exported = this.schema.export();
    exported.behavior = this.behavior;
    exported.timestamps = this.config.timestamps;
    exported.partitions = this.config.partitions || {};
    exported.paranoid = this.config.paranoid;
    exported.allNestedObjectsOptional = this.config.allNestedObjectsOptional;
    exported.autoDecrypt = this.config.autoDecrypt;
    exported.cache = this.config.cache;
    exported.hooks = this.hooks;
    return exported;
  }
  /**
   * Apply configuration settings (timestamps, partitions, hooks)
   * This method ensures that all configuration-dependent features are properly set up
   */
  applyConfiguration() {
    if (this.config.timestamps) {
      if (!this.attributes.createdAt) {
        this.attributes.createdAt = "string|optional";
      }
      if (!this.attributes.updatedAt) {
        this.attributes.updatedAt = "string|optional";
      }
      if (!this.config.partitions) {
        this.config.partitions = {};
      }
      if (!this.config.partitions.byCreatedDate) {
        this.config.partitions.byCreatedDate = {
          fields: {
            createdAt: "date|maxlength:10"
          }
        };
      }
      if (!this.config.partitions.byUpdatedDate) {
        this.config.partitions.byUpdatedDate = {
          fields: {
            updatedAt: "date|maxlength:10"
          }
        };
      }
    }
    this.setupPartitionHooks();
    if (this.versioningEnabled) {
      if (!this.config.partitions.byVersion) {
        this.config.partitions.byVersion = {
          fields: {
            _v: "string"
          }
        };
      }
    }
    this.schema = new Schema({
      name: this.name,
      attributes: this.attributes,
      passphrase: this.passphrase,
      version: this.version,
      options: {
        autoDecrypt: this.config.autoDecrypt,
        allNestedObjectsOptional: this.config.allNestedObjectsOptional
      }
    });
    this.validatePartitions();
  }
  /**
   * Update resource attributes and rebuild schema
   * @param {Object} newAttributes - New attributes definition
   */
  updateAttributes(newAttributes) {
    const oldAttributes = this.attributes;
    this.attributes = newAttributes;
    this.applyConfiguration();
    return { oldAttributes, newAttributes };
  }
  /**
   * Add a hook function for a specific event
   * @param {string} event - Hook event (preInsert, afterInsert, etc.)
   * @param {Function} fn - Hook function
   */
  addHook(event, fn) {
    if (this.hooks[event]) {
      this.hooks[event].push(fn.bind(this));
    }
  }
  /**
   * Execute hooks for a specific event
   * @param {string} event - Hook event
   * @param {*} data - Data to pass to hooks
   * @returns {*} Modified data
   */
  async executeHooks(event, data) {
    if (!this.hooks[event]) return data;
    let result = data;
    for (const hook of this.hooks[event]) {
      result = await hook(result);
    }
    return result;
  }
  /**
   * Setup automatic partition hooks
   */
  setupPartitionHooks() {
    if (!this.config.partitions) {
      return;
    }
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
      return;
    }
    if (!this.hooks.afterInsert) {
      this.hooks.afterInsert = [];
    }
    this.hooks.afterInsert.push(async (data) => {
      await this.createPartitionReferences(data);
      return data;
    });
    if (!this.hooks.afterDelete) {
      this.hooks.afterDelete = [];
    }
    this.hooks.afterDelete.push(async (data) => {
      await this.deletePartitionReferences(data);
      return data;
    });
  }
  async validate(data) {
    const result = {
      original: cloneDeep(data),
      isValid: false,
      errors: []
    };
    const check = await this.schema.validate(data, { mutateOriginal: true });
    if (check === true) {
      result.isValid = true;
    } else {
      result.errors = check;
    }
    result.data = data;
    return result;
  }
  /**
   * Validate that all partition fields exist in current resource attributes
   * @throws {Error} If partition fields don't exist in current schema
   */
  validatePartitions() {
    if (!this.config.partitions) {
      return;
    }
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
      return;
    }
    const currentAttributes = Object.keys(this.attributes || {});
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (!partitionDef.fields) {
        continue;
      }
      for (const fieldName of Object.keys(partitionDef.fields)) {
        if (!this.fieldExistsInAttributes(fieldName)) {
          throw new Error(
            `Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(", ")}.`
          );
        }
      }
    }
  }
  /**
   * Check if a field (including nested fields) exists in the current attributes
   * @param {string} fieldName - Field name (can be nested like 'utm.source')
   * @returns {boolean} True if field exists
   */
  fieldExistsInAttributes(fieldName) {
    if (fieldName.startsWith("_")) {
      return true;
    }
    if (!fieldName.includes(".")) {
      return Object.keys(this.attributes || {}).includes(fieldName);
    }
    const keys = fieldName.split(".");
    let currentLevel = this.attributes || {};
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return false;
      }
      currentLevel = currentLevel[key];
    }
    return true;
  }
  /**
   * Apply a single partition rule to a field value
   * @param {*} value - The field value
   * @param {string} rule - The partition rule
   * @returns {*} Transformed value
   */
  applyPartitionRule(value, rule) {
    if (value === void 0 || value === null) {
      return value;
    }
    let transformedValue = value;
    if (typeof rule === "string" && rule.includes("maxlength:")) {
      const maxLengthMatch = rule.match(/maxlength:(\d+)/);
      if (maxLengthMatch) {
        const maxLength = parseInt(maxLengthMatch[1]);
        if (typeof transformedValue === "string" && transformedValue.length > maxLength) {
          transformedValue = transformedValue.substring(0, maxLength);
        }
      }
    }
    if (rule.includes("date")) {
      if (transformedValue instanceof Date) {
        transformedValue = transformedValue.toISOString().split("T")[0];
      } else if (typeof transformedValue === "string") {
        try {
          if (transformedValue.includes("T") && transformedValue.includes("Z")) {
            transformedValue = transformedValue.split("T")[0];
          } else {
            const date = new Date(transformedValue);
            if (!isNaN(date.getTime())) {
              transformedValue = date.toISOString().split("T")[0];
            }
          }
        } catch (e) {
        }
      }
    }
    return transformedValue;
  }
  /**
   * Get the main resource key (new format without version in path)
   * @param {string} id - Resource ID
   * @returns {string} The main S3 key path
   */
  getResourceKey(id) {
    return join(`resource=${this.name}`, `data`, `id=${id}`);
  }
  /**
   * Generate partition key for a resource in a specific partition
   * @param {Object} params - Partition key parameters
   * @param {string} params.partitionName - Name of the partition
   * @param {string} params.id - Resource ID
   * @param {Object} params.data - Resource data for partition value extraction
   * @returns {string|null} The partition key path or null if required fields are missing
   * @example
   * const partitionKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { utm: { source: 'google' } }
   * });
   * // Returns: 'resource=users/partition=byUtmSource/utm.source=google/id=user-123'
   * 
   * // Returns null if required field is missing
   * const nullKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { name: 'John' } // Missing utm.source
   * });
   * // Returns: null
   */
  getPartitionKey({ partitionName, id, data }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new Error(`Partition '${partitionName}' not found`);
    }
    const partition = this.config.partitions[partitionName];
    const partitionSegments = [];
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const fieldValue = this.getNestedFieldValue(data, fieldName);
      const transformedValue = this.applyPartitionRule(fieldValue, rule);
      if (transformedValue === void 0 || transformedValue === null) {
        return null;
      }
      partitionSegments.push(`${fieldName}=${transformedValue}`);
    }
    if (partitionSegments.length === 0) {
      return null;
    }
    const finalId = id || data?.id;
    if (!finalId) {
      return null;
    }
    return join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
  }
  /**
   * Get nested field value from data object using dot notation
   * @param {Object} data - Data object
   * @param {string} fieldPath - Field path (e.g., "utm.source", "address.city")
   * @returns {*} Field value
   */
  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath];
    }
    const keys = fieldPath.split(".");
    let currentLevel = data;
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return void 0;
      }
      currentLevel = currentLevel[key];
    }
    return currentLevel;
  }
  /**
   * Calculate estimated content length for body data
   * @param {string|Buffer} body - Body content
   * @returns {number} Estimated content length in bytes
   */
  calculateContentLength(body) {
    if (!body) return 0;
    if (Buffer.isBuffer(body)) return body.length;
    if (typeof body === "string") return Buffer.byteLength(body, "utf8");
    if (typeof body === "object") return Buffer.byteLength(JSON.stringify(body), "utf8");
    return Buffer.byteLength(String(body), "utf8");
  }
  /**
   * Insert a new resource object
   * @param {Object} attributes - Resource attributes
   * @param {string} [attributes.id] - Custom ID (optional, auto-generated if not provided)
   * @returns {Promise<Object>} The created resource object with all attributes
   * @example
   * // Insert with auto-generated ID
   * const user = await resource.insert({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   age: 30
   * });
   * console.log(user.id); // Auto-generated ID
   * 
   * // Insert with custom ID
   * const user = await resource.insert({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async insert({ id, ...attributes }) {
    if (this.options.timestamps) {
      attributes.createdAt = (/* @__PURE__ */ new Date()).toISOString();
      attributes.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    const completeData = { id, ...attributes };
    const preProcessedData = await this.executeHooks("preInsert", completeData);
    const {
      errors,
      isValid,
      data: validated
    } = await this.validate(preProcessedData);
    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors
      });
    }
    const { id: validatedId, ...validatedAttributes } = validated;
    const finalId = validatedId || id || this.idGenerator();
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: validatedAttributes,
      mappedData
    });
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(finalId);
    let contentType = void 0;
    if (body && body !== "") {
      try {
        JSON.parse(body);
        contentType = "application/json";
      } catch {
      }
    }
    await this.client.putObject({
      metadata: finalMetadata,
      key,
      body,
      contentType,
      contentLength: this.calculateContentLength(body)
    });
    const final = merge({ id: finalId }, validatedAttributes);
    await this.executeHooks("afterInsert", final);
    this.emit("insert", final);
    return final;
  }
  /**
   * Retrieve a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   * @example
   * const user = await resource.get('user-123');
   * console.log(user.name); // 'John Doe'
   * console.log(user._lastModified); // Date object
   * console.log(user._hasContent); // boolean
   */
  async get(id) {
    const key = this.getResourceKey(id);
    try {
      const request = await this.client.headObject(key);
      const objectVersionRaw = request.Metadata?._v || this.version;
      const objectVersion = typeof objectVersionRaw === "string" && objectVersionRaw.startsWith("v") ? objectVersionRaw.slice(1) : objectVersionRaw;
      const schema = await this.getSchemaForVersion(objectVersion);
      let metadata = await schema.unmapper(request.Metadata);
      const behaviorImpl = getBehavior(this.behavior);
      let body = "";
      if (request.ContentLength > 0) {
        try {
          const fullObject = await this.client.getObject(key);
          body = await streamToString(fullObject.Body);
        } catch (error) {
          console.warn(`Failed to read body for resource ${id}:`, error.message);
          body = "";
        }
      }
      const { metadata: processedMetadata } = await behaviorImpl.handleGet({
        resource: this,
        metadata,
        body
      });
      let data = processedMetadata;
      data.id = id;
      data._contentLength = request.ContentLength;
      data._lastModified = request.LastModified;
      data._hasContent = request.ContentLength > 0;
      data._mimeType = request.ContentType || null;
      data._v = objectVersion;
      if (request.VersionId) data._versionId = request.VersionId;
      if (request.Expiration) data._expiresAt = request.Expiration;
      data._definitionHash = this.getDefinitionHash();
      if (objectVersion !== this.version) {
        data = await this.applyVersionMapping(data, objectVersion, this.version);
      }
      this.emit("get", data);
      return data;
    } catch (error) {
      if (error.message.includes("Cipher job failed") || error.message.includes("OperationError") || error.originalError?.message?.includes("Cipher job failed")) {
        try {
          console.warn(`Decryption failed for resource ${id}, attempting to get raw metadata`);
          const request = await this.client.headObject(key);
          const objectVersion = this.extractVersionFromKey(key) || this.version;
          const tempSchema = new Schema({
            name: this.name,
            attributes: this.attributes,
            passphrase: this.passphrase,
            version: objectVersion,
            options: {
              ...this.config,
              autoDecrypt: false,
              // Disable decryption
              autoEncrypt: false
              // Disable encryption
            }
          });
          let metadata = await tempSchema.unmapper(request.Metadata);
          const behaviorImpl = getBehavior(this.behavior);
          let body = "";
          if (request.ContentLength > 0) {
            try {
              const fullObject = await this.client.getObject(key);
              body = await streamToString(fullObject.Body);
            } catch (bodyError) {
              console.warn(`Failed to read body for resource ${id}:`, bodyError.message);
              body = "";
            }
          }
          const { metadata: processedMetadata } = await behaviorImpl.handleGet({
            resource: this,
            metadata,
            body
          });
          let data = processedMetadata;
          data.id = id;
          data._contentLength = request.ContentLength;
          data._lastModified = request.LastModified;
          data._hasContent = request.ContentLength > 0;
          data._mimeType = request.ContentType || null;
          data._version = objectVersion;
          data._decryptionFailed = true;
          if (request.VersionId) data._versionId = request.VersionId;
          if (request.Expiration) data._expiresAt = request.Expiration;
          data._definitionHash = this.getDefinitionHash();
          this.emit("get", data);
          return data;
        } catch (fallbackError) {
          console.error(`Fallback attempt also failed for resource ${id}:`, fallbackError.message);
        }
      }
      const enhancedError = new Error(`Failed to get resource with id '${id}': ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.resourceId = id;
      enhancedError.resourceKey = key;
      throw enhancedError;
    }
  }
  /**
   * Check if a resource exists by ID
   * @param {string} id - Resource ID
   * @returns {Promise<boolean>} True if resource exists, false otherwise
   * @example
   * const exists = await resource.exists('user-123');
   * if (exists) {
   *   console.log('User exists');
   * }
   */
  async exists(id) {
    try {
      const key = this.getResourceKey(id);
      await this.client.headObject(key);
      return true;
    } catch (error) {
      return false;
    }
  }
  /**
   * Update an existing resource object
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update (partial update supported)
   * @returns {Promise<Object>} The updated resource object with all attributes
   * @example
   * // Update specific fields
   * const updatedUser = await resource.update('user-123', {
   *   name: 'John Updated',
   *   age: 31
   * });
   * 
   * // Update with timestamps (if enabled)
   * const updatedUser = await resource.update('user-123', {
   *   email: 'newemail@example.com'
   * });
   * console.log(updatedUser.updatedAt); // ISO timestamp
   */
  async update(id, attributes) {
    const originalData = await this.get(id);
    if (this.config.timestamps) {
      attributes.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    const preProcessedData = await this.executeHooks("preUpdate", attributes);
    const completeData = { ...originalData, ...preProcessedData, id };
    const { isValid, errors, data: validated } = await this.validate(completeData);
    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors
      });
    }
    const { id: validatedId, ...validatedAttributes } = validated;
    const oldData = { ...originalData, id };
    const newData = { ...validatedAttributes, id };
    await this.handlePartitionReferenceUpdates(oldData, newData);
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this,
      id,
      data: validatedAttributes,
      mappedData
    });
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(id);
    let existingContentType = void 0;
    let finalBody = body;
    if (body === "" && this.behavior !== "body-overflow") {
      try {
        const existingObject = await this.client.getObject(key);
        if (existingObject.ContentLength > 0) {
          const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
          const existingBodyString = existingBodyBuffer.toString();
          try {
            JSON.parse(existingBodyString);
          } catch {
            finalBody = existingBodyBuffer;
            existingContentType = existingObject.ContentType;
          }
        }
      } catch (error) {
      }
    }
    let finalContentType = existingContentType;
    if (finalBody && finalBody !== "" && !finalContentType) {
      try {
        JSON.parse(finalBody);
        finalContentType = "application/json";
      } catch {
      }
    }
    if (this.versioningEnabled && originalData._v !== this.version) {
      await this.createHistoricalVersion(id, originalData);
    }
    await this.client.putObject({
      key,
      body: finalBody,
      contentType: finalContentType,
      metadata: finalMetadata
    });
    validatedAttributes.id = id;
    await this.executeHooks("afterUpdate", validatedAttributes);
    this.emit("update", preProcessedData, validatedAttributes);
    return validatedAttributes;
  }
  /**
   * Delete a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   * @example
   * await resource.delete('user-123');
   * console.log('User deleted successfully');
   */
  async delete(id) {
    let objectData;
    try {
      objectData = await this.get(id);
    } catch (error) {
      objectData = { id };
    }
    await this.executeHooks("preDelete", objectData);
    const key = this.getResourceKey(id);
    const response = await this.client.deleteObject(key);
    await this.executeHooks("afterDelete", objectData);
    this.emit("delete", id);
    return response;
  }
  /**
   * Insert or update a resource object (upsert operation)
   * @param {Object} params - Upsert parameters
   * @param {string} params.id - Resource ID (required for upsert)
   * @param {...Object} params - Resource attributes (any additional properties)
   * @returns {Promise<Object>} The inserted or updated resource object
   * @example
   * // Will insert if doesn't exist, update if exists
   * const user = await resource.upsert({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async upsert({ id, ...attributes }) {
    const exists = await this.exists(id);
    if (exists) {
      return this.update(id, attributes);
    }
    return this.insert({ id, ...attributes });
  }
  /**
   * Count resources with optional partition filtering
   * @param {Object} [params] - Count parameters
   * @param {string} [params.partition] - Partition name to count in
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @returns {Promise<number>} Total count of matching resources
   * @example
   * // Count all resources
   * const total = await resource.count();
   * 
   * // Count in specific partition
   * const googleUsers = await resource.count({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // Count in multi-field partition
   * const usElectronics = await resource.count({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async count({ partition = null, partitionValues = {} } = {}) {
    let prefix;
    if (partition && Object.keys(partitionValues).length > 0) {
      const partitionDef = this.config.partitions[partition];
      if (!partitionDef) {
        throw new Error(`Partition '${partition}' not found`);
      }
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== void 0 && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.name}/data`;
    }
    const count = await this.client.count({ prefix });
    this.emit("count", count);
    return count;
  }
  /**
   * Insert multiple resources in parallel
   * @param {Object[]} objects - Array of resource objects to insert
   * @returns {Promise<Object[]>} Array of inserted resource objects
   * @example
   * const users = [
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' },
   *   { name: 'Bob', email: 'bob@example.com' }
   * ];
   * const insertedUsers = await resource.insertMany(users);
   * console.log(`Inserted ${insertedUsers.length} users`);
   */
  async insertMany(objects) {
    const { results } = await PromisePool.for(objects).withConcurrency(this.parallelism).handleError(async (error, content) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (attributes) => {
      const result = await this.insert(attributes);
      return result;
    });
    this.emit("insertMany", objects.length);
    return results;
  }
  /**
   * Delete multiple resources by their IDs in parallel
   * @param {string[]} ids - Array of resource IDs to delete
   * @returns {Promise<Object[]>} Array of S3 delete responses
   * @example
   * const deletedIds = ['user-1', 'user-2', 'user-3'];
   * const results = await resource.deleteMany(deletedIds);
   * console.log(`Deleted ${deletedIds.length} users`);
   */
  async deleteMany(ids) {
    const packages = chunk(
      ids.map((id) => this.getResourceKey(id)),
      1e3
    );
    const { results } = await PromisePool.for(packages).withConcurrency(this.parallelism).handleError(async (error, content) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (keys) => {
      const response = await this.client.deleteObjects(keys);
      keys.forEach((key) => {
        const parts = key.split("/");
        const idPart = parts.find((part) => part.startsWith("id="));
        const id = idPart ? idPart.replace("id=", "") : null;
        if (id) {
          this.emit("deleted", id);
          this.observers.map((x) => x.emit("deleted", this.name, id));
        }
      });
      return response;
    });
    this.emit("deleteMany", ids.length);
    return results;
  }
  async deleteAll() {
    if (this.config.paranoid !== false) {
      throw new Error(
        `deleteAll() is a dangerous operation and requires paranoid: false option. Current paranoid setting: ${this.config.paranoid}`
      );
    }
    const prefix = `resource=${this.name}/data`;
    const deletedCount = await this.client.deleteAll({ prefix });
    this.emit("deleteAll", {
      version: this.version,
      prefix,
      deletedCount
    });
    return { deletedCount, version: this.version };
  }
  /**
   * Delete all data for this resource across ALL versions
   * @returns {Promise<Object>} Deletion report
   */
  async deleteAllData() {
    if (this.config.paranoid !== false) {
      throw new Error(
        `deleteAllData() is a dangerous operation and requires paranoid: false option. Current paranoid setting: ${this.config.paranoid}`
      );
    }
    const prefix = `resource=${this.name}`;
    const deletedCount = await this.client.deleteAll({ prefix });
    this.emit("deleteAllData", {
      resource: this.name,
      prefix,
      deletedCount
    });
    return { deletedCount, resource: this.name };
  }
  /**
   * List resource IDs with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results to return
   * @param {number} [params.offset=0] - Offset for pagination
   * @returns {Promise<string[]>} Array of resource IDs (strings)
   * @example
   * // List all IDs
   * const allIds = await resource.listIds();
   * 
   * // List IDs with pagination
   * const firstPageIds = await resource.listIds({ limit: 10, offset: 0 });
   * const secondPageIds = await resource.listIds({ limit: 10, offset: 10 });
   * 
   * // List IDs from specific partition
   * const googleUserIds = await resource.listIds({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // List IDs from multi-field partition
   * const usElectronicsIds = await resource.listIds({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    let prefix;
    if (partition && Object.keys(partitionValues).length > 0) {
      if (!this.config.partitions || !this.config.partitions[partition]) {
        throw new Error(`Partition '${partition}' not found`);
      }
      const partitionDef = this.config.partitions[partition];
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== void 0 && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.name}/data`;
    }
    const keys = await this.client.getKeysPage({
      prefix,
      offset,
      amount: limit || 1e3
      // Default to 1000 if no limit specified
    });
    const ids = keys.map((key) => {
      const parts = key.split("/");
      const idPart = parts.find((part) => part.startsWith("id="));
      return idPart ? idPart.replace("id=", "") : null;
    }).filter(Boolean);
    this.emit("listIds", ids.length);
    return ids;
  }
  /**
   * List resources with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results
   * @param {number} [params.offset=0] - Number of results to skip
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * // List all resources
   * const allUsers = await resource.list();
   * 
   * // List with pagination
   * const first10 = await resource.list({ limit: 10, offset: 0 });
   * 
   * // List from specific partition
   * const usUsers = await resource.list({
   *   partition: 'byCountry',
   *   partitionValues: { 'profile.country': 'US' }
   * });
   */
  async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    try {
      if (!partition) {
        return await this.listMain({ limit, offset });
      }
      return await this.listPartition({ partition, partitionValues, limit, offset });
    } catch (error) {
      return this.handleListError(error, { partition, partitionValues });
    }
  }
  /**
   * List resources from main resource (no partition)
   */
  async listMain({ limit, offset = 0 }) {
    const ids = await this.listIds({ limit, offset });
    const results = await this.processListResults(ids, "main");
    this.emit("list", { count: results.length, errors: 0 });
    return results;
  }
  /**
   * List resources from specific partition
   */
  async listPartition({ partition, partitionValues, limit, offset = 0 }) {
    if (!this.config.partitions?.[partition]) {
      console.warn(`Partition '${partition}' not found in resource '${this.name}'`);
      this.emit("list", { partition, partitionValues, count: 0, errors: 0 });
      return [];
    }
    const partitionDef = this.config.partitions[partition];
    const prefix = this.buildPartitionPrefix(partition, partitionDef, partitionValues);
    const keys = await this.client.getAllKeys({ prefix });
    const ids = this.extractIdsFromKeys(keys).slice(offset);
    const filteredIds = limit ? ids.slice(0, limit) : ids;
    const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);
    this.emit("list", { partition, partitionValues, count: results.length, errors: 0 });
    return results;
  }
  /**
   * Build partition prefix from partition definition and values
   */
  buildPartitionPrefix(partition, partitionDef, partitionValues) {
    const partitionSegments = [];
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== void 0 && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    if (partitionSegments.length > 0) {
      return `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
    }
    return `resource=${this.name}/partition=${partition}`;
  }
  /**
   * Extract IDs from S3 keys
   */
  extractIdsFromKeys(keys) {
    return keys.map((key) => {
      const parts = key.split("/");
      const idPart = parts.find((part) => part.startsWith("id="));
      return idPart ? idPart.replace("id=", "") : null;
    }).filter(Boolean);
  }
  /**
   * Process list results with error handling
   */
  async processListResults(ids, context = "main") {
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      console.warn(`Failed to get ${context} resource ${id}:`, error.message);
      return null;
    }).process(async (id) => {
      try {
        return await this.get(id);
      } catch (error) {
        return this.handleResourceError(error, id, context);
      }
    });
    return results.filter((item) => item !== null);
  }
  /**
   * Process partition results with error handling
   */
  async processPartitionResults(ids, partition, partitionDef, keys) {
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      console.warn(`Failed to get partition resource ${id}:`, error.message);
      return null;
    }).process(async (id) => {
      try {
        const actualPartitionValues = this.extractPartitionValuesFromKey(id, keys, sortedFields);
        return await this.getFromPartition({
          id,
          partitionName: partition,
          partitionValues: actualPartitionValues
        });
      } catch (error) {
        return this.handleResourceError(error, id, "partition");
      }
    });
    return results.filter((item) => item !== null);
  }
  /**
   * Extract partition values from S3 key for specific ID
   */
  extractPartitionValuesFromKey(id, keys, sortedFields) {
    const keyForId = keys.find((key) => key.includes(`id=${id}`));
    if (!keyForId) {
      throw new Error(`Partition key not found for ID ${id}`);
    }
    const keyParts = keyForId.split("/");
    const actualPartitionValues = {};
    for (const [fieldName] of sortedFields) {
      const fieldPart = keyParts.find((part) => part.startsWith(`${fieldName}=`));
      if (fieldPart) {
        const value = fieldPart.replace(`${fieldName}=`, "");
        actualPartitionValues[fieldName] = value;
      }
    }
    return actualPartitionValues;
  }
  /**
   * Handle resource-specific errors
   */
  handleResourceError(error, id, context) {
    if (error.message.includes("Cipher job failed") || error.message.includes("OperationError")) {
      console.warn(`Decryption failed for ${context} resource ${id}, returning basic info`);
      return {
        id,
        _decryptionFailed: true,
        _error: error.message,
        ...context === "partition" && { _partition: context }
      };
    }
    throw error;
  }
  /**
   * Handle list method errors
   */
  handleListError(error, { partition, partitionValues }) {
    if (error.message.includes("Partition '") && error.message.includes("' not found")) {
      console.warn(`Partition error in list method:`, error.message);
      this.emit("list", { partition, partitionValues, count: 0, errors: 1 });
      return [];
    }
    console.error(`Critical error in list method:`, error.message);
    this.emit("list", { partition, partitionValues, count: 0, errors: 1 });
    return [];
  }
  /**
   * Get multiple resources by their IDs
   * @param {string[]} ids - Array of resource IDs
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * const users = await resource.getMany(['user-1', 'user-2', 'user-3']);
   * users.forEach(user => console.log(user.name));
   */
  async getMany(ids) {
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.client.parallelism).handleError(async (error, id) => {
      console.warn(`Failed to get resource ${id}:`, error.message);
      return {
        id,
        _error: error.message,
        _decryptionFailed: error.message.includes("Cipher job failed") || error.message.includes("OperationError")
      };
    }).process(async (id) => {
      this.emit("id", id);
      try {
        const data = await this.get(id);
        this.emit("data", data);
        return data;
      } catch (error) {
        if (error.message.includes("Cipher job failed") || error.message.includes("OperationError")) {
          console.warn(`Decryption failed for ${id}, returning basic info`);
          return {
            id,
            _decryptionFailed: true,
            _error: error.message
          };
        }
        throw error;
      }
    });
    this.emit("getMany", ids.length);
    return results;
  }
  /**
   * Get all resources (equivalent to list() without pagination)
   * @returns {Promise<Object[]>} Array of all resource objects
   * @example
   * const allUsers = await resource.getAll();
   * console.log(`Total users: ${allUsers.length}`);
   */
  async getAll() {
    let ids = await this.listIds();
    if (ids.length === 0) return [];
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.client.parallelism).handleError(async (error, id) => {
      console.warn(`Failed to get resource ${id}:`, error.message);
      return {
        id,
        _error: error.message,
        _decryptionFailed: error.message.includes("Cipher job failed") || error.message.includes("OperationError")
      };
    }).process(async (id) => {
      try {
        const data = await this.get(id);
        return data;
      } catch (error) {
        if (error.message.includes("Cipher job failed") || error.message.includes("OperationError")) {
          console.warn(`Decryption failed for ${id}, returning basic info`);
          return {
            id,
            _decryptionFailed: true,
            _error: error.message
          };
        }
        throw error;
      }
    });
    this.emit("getAll", results.length);
    return results;
  }
  /**
   * Get a page of resources with pagination metadata
   * @param {Object} [params] - Page parameters
   * @param {number} [params.offset=0] - Offset for pagination
   * @param {number} [params.size=100] - Page size
   * @param {string} [params.partition] - Partition name to page from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {boolean} [params.skipCount=false] - Skip total count for performance (useful for large collections)
   * @returns {Promise<Object>} Page result with items and pagination info
   * @example
   * // Get first page of all resources
   * const page = await resource.page({ offset: 0, size: 10 });
   * console.log(`Page ${page.page + 1} of ${page.totalPages}`);
   * console.log(`Showing ${page.items.length} of ${page.totalItems} total`);
   * 
   * // Get page from specific partition
   * const googlePage = await resource.page({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' },
   *   offset: 0,
   *   size: 5
   * });
   * 
   * // Skip count for performance in large collections
   * const fastPage = await resource.page({ 
   *   offset: 0, 
   *   size: 100, 
   *   skipCount: true 
   * });
   * console.log(`Got ${fastPage.items.length} items`); // totalItems will be null
   */
  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
    try {
      let totalItems = null;
      let totalPages = null;
      if (!skipCount) {
        try {
          totalItems = await this.count({ partition, partitionValues });
          totalPages = Math.ceil(totalItems / size);
        } catch (countError) {
          console.warn(`Failed to get count for page:`, countError.message);
          totalItems = null;
          totalPages = null;
        }
      }
      const page = Math.floor(offset / size);
      let items = [];
      try {
        items = await this.list({
          partition,
          partitionValues,
          limit: size,
          offset
        });
      } catch (listError) {
        console.warn(`Failed to get items for page:`, listError.message);
        items = [];
      }
      const result = {
        items,
        totalItems,
        page,
        pageSize: size,
        totalPages,
        // Add additional metadata for debugging
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: items.length,
          skipCount,
          hasTotalItems: totalItems !== null
        }
      };
      this.emit("page", result);
      return result;
    } catch (error) {
      console.error(`Critical error in page method:`, error.message);
      return {
        items: [],
        totalItems: null,
        page: Math.floor(offset / size),
        pageSize: size,
        totalPages: null,
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: 0,
          skipCount,
          hasTotalItems: false,
          error: error.message
        }
      };
    }
  }
  readable() {
    const stream = new ResourceReader({ resource: this });
    return stream.build();
  }
  writable() {
    const stream = new ResourceWriter({ resource: this });
    return stream.build();
  }
  /**
   * Set binary content for a resource
   * @param {Object} params - Content parameters
   * @param {string} params.id - Resource ID
   * @param {Buffer|string} params.buffer - Content buffer or string
   * @param {string} [params.contentType='application/octet-stream'] - Content type
   * @returns {Promise<Object>} Updated resource data
   * @example
   * // Set image content
   * const imageBuffer = fs.readFileSync('image.jpg');
   * await resource.setContent({
   *   id: 'user-123',
   *   buffer: imageBuffer,
   *   contentType: 'image/jpeg'
   * });
   * 
   * // Set text content
   * await resource.setContent({
   *   id: 'document-456',
   *   buffer: 'Hello World',
   *   contentType: 'text/plain'
   * });
   */
  async setContent({ id, buffer, contentType = "application/octet-stream" }) {
    const currentData = await this.get(id);
    if (!currentData) {
      throw new Error(`Resource with id '${id}' not found`);
    }
    const updatedData = {
      ...currentData,
      _hasContent: true,
      _contentLength: buffer.length,
      _mimeType: contentType
    };
    await this.client.putObject({
      key: this.getResourceKey(id),
      metadata: await this.schema.mapper(updatedData),
      body: buffer,
      contentType
    });
    this.emit("setContent", { id, contentType, contentLength: buffer.length });
    return updatedData;
  }
  /**
   * Retrieve binary content associated with a resource
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Object with buffer and contentType
   * @example
   * const content = await resource.content('user-123');
   * if (content.buffer) {
   *   console.log('Content type:', content.contentType);
   *   console.log('Content size:', content.buffer.length);
   *   // Save to file
   *   fs.writeFileSync('output.jpg', content.buffer);
   * } else {
   *   console.log('No content found');
   * }
   */
  async content(id) {
    const key = this.getResourceKey(id);
    try {
      const response = await this.client.getObject(key);
      const buffer = Buffer.from(await response.Body.transformToByteArray());
      const contentType = response.ContentType || null;
      this.emit("content", id, buffer.length, contentType);
      return {
        buffer,
        contentType
      };
    } catch (error) {
      if (error.name === "NoSuchKey") {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw error;
    }
  }
  /**
   * Check if binary content exists for a resource
   * @param {string} id - Resource ID
   * @returns {boolean}
   */
  async hasContent(id) {
    const key = this.getResourceKey(id);
    try {
      const response = await this.client.headObject(key);
      return response.ContentLength > 0;
    } catch (error) {
      return false;
    }
  }
  /**
   * Delete binary content but preserve metadata
   * @param {string} id - Resource ID
   */
  async deleteContent(id) {
    const key = this.getResourceKey(id);
    const existingObject = await this.client.headObject(key);
    const existingMetadata = existingObject.Metadata || {};
    const response = await this.client.putObject({
      key,
      body: "",
      metadata: existingMetadata
    });
    this.emit("deleteContent", id);
    return response;
  }
  /**
   * Generate definition hash for this resource
   * @returns {string} SHA256 hash of the resource definition (name + attributes)
   */
  getDefinitionHash() {
    const definition = {
      attributes: this.attributes,
      behavior: this.behavior
    };
    const stableString = jsonStableStringify(definition);
    return `sha256:${createHash("sha256").update(stableString).digest("hex")}`;
  }
  /**
   * Extract version from S3 key
   * @param {string} key - S3 object key
   * @returns {string|null} Version string or null
   */
  extractVersionFromKey(key) {
    const parts = key.split("/");
    const versionPart = parts.find((part) => part.startsWith("v="));
    return versionPart ? versionPart.replace("v=", "") : null;
  }
  /**
   * Get schema for a specific version
   * @param {string} version - Version string (e.g., 'v0', 'v1')
   * @returns {Object} Schema object for the version
   */
  async getSchemaForVersion(version) {
    if (version === this.version) {
      return this.schema;
    }
    try {
      const compatibleSchema = new Schema({
        name: this.name,
        attributes: this.attributes,
        passphrase: this.passphrase,
        version,
        options: {
          ...this.config,
          // For older versions, be more lenient with decryption
          autoDecrypt: true,
          autoEncrypt: true
        }
      });
      return compatibleSchema;
    } catch (error) {
      console.warn(`Failed to create compatible schema for version ${version}, using current schema:`, error.message);
      return this.schema;
    }
  }
  /**
   * Create partition references after insert
   * @param {Object} data - Inserted object data
   */
  async createPartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        const partitionMetadata = {
          _v: String(this.version)
        };
        await this.client.putObject({
          key: partitionKey,
          metadata: partitionMetadata,
          body: "",
          contentType: void 0
        });
      }
    }
  }
  /**
   * Delete partition references after delete
   * @param {Object} data - Deleted object data
   */
  async deletePartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    const keysToDelete = [];
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        keysToDelete.push(partitionKey);
      }
    }
    if (keysToDelete.length > 0) {
      try {
        await this.client.deleteObjects(keysToDelete);
      } catch (error) {
        console.warn("Some partition objects could not be deleted:", error.message);
      }
    }
  }
  /**
   * Query resources with simple filtering and pagination
   * @param {Object} [filter={}] - Filter criteria (exact field matches)
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Maximum number of results
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.partition] - Partition name to query from
   * @param {Object} [options.partitionValues] - Partition field values to filter by
   * @returns {Promise<Object[]>} Array of filtered resource objects
   * @example
   * // Query all resources (no filter)
   * const allUsers = await resource.query();
   * 
   * // Query with simple filter
   * const activeUsers = await resource.query({ status: 'active' });
   * 
   * // Query with multiple filters
   * const usElectronics = await resource.query({
   *   category: 'electronics',
   *   region: 'US'
   * });
   * 
   * // Query with pagination
   * const firstPage = await resource.query(
   *   { status: 'active' },
   *   { limit: 10, offset: 0 }
   * );
   * 
   * // Query within partition
   * const googleUsers = await resource.query(
   *   { status: 'active' },
   *   {
   *     partition: 'byUtmSource',
   *     partitionValues: { 'utm.source': 'google' },
   *     limit: 5
   *   }
   * );
   */
  async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
    if (Object.keys(filter).length === 0) {
      return await this.list({ partition, partitionValues, limit, offset });
    }
    const results = [];
    let currentOffset = offset;
    const batchSize = Math.min(limit, 50);
    while (results.length < limit) {
      const batch = await this.list({
        partition,
        partitionValues,
        limit: batchSize,
        offset: currentOffset
      });
      if (batch.length === 0) {
        break;
      }
      const filteredBatch = batch.filter((doc) => {
        return Object.entries(filter).every(([key, value]) => {
          return doc[key] === value;
        });
      });
      results.push(...filteredBatch);
      currentOffset += batchSize;
      if (batch.length < batchSize) {
        break;
      }
    }
    return results.slice(0, limit);
  }
  /**
   * Handle partition reference updates with change detection
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdates(oldData, newData) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      try {
        await this.handlePartitionReferenceUpdate(partitionName, partition, oldData, newData);
      } catch (error) {
        console.warn(`Failed to update partition references for ${partitionName}:`, error.message);
      }
    }
    const id = newData.id || oldData.id;
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const prefix = `resource=${this.name}/partition=${partitionName}`;
      let allKeys = [];
      try {
        allKeys = await this.client.getAllKeys({ prefix });
      } catch (error) {
        console.warn(`Aggressive cleanup: could not list keys for partition ${partitionName}:`, error.message);
        continue;
      }
      const validKey = this.getPartitionKey({ partitionName, id, data: newData });
      for (const key of allKeys) {
        if (key.endsWith(`/id=${id}`) && key !== validKey) {
          try {
            await this.client.deleteObject(key);
          } catch (error) {
            console.warn(`Aggressive cleanup: could not delete stale partition key ${key}:`, error.message);
          }
        }
      }
    }
  }
  /**
   * Handle partition reference update for a specific partition
   * @param {string} partitionName - Name of the partition
   * @param {Object} partition - Partition definition
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
    const id = newData.id || oldData.id;
    const oldPartitionKey = this.getPartitionKey({ partitionName, id, data: oldData });
    const newPartitionKey = this.getPartitionKey({ partitionName, id, data: newData });
    if (oldPartitionKey !== newPartitionKey) {
      if (oldPartitionKey) {
        try {
          await this.client.deleteObject(oldPartitionKey);
        } catch (error) {
          console.warn(`Old partition object could not be deleted for ${partitionName}:`, error.message);
        }
      }
      if (newPartitionKey) {
        try {
          const partitionMetadata = {
            _v: String(this.version)
          };
          await this.client.putObject({
            key: newPartitionKey,
            metadata: partitionMetadata,
            body: "",
            contentType: void 0
          });
        } catch (error) {
          console.warn(`New partition object could not be created for ${partitionName}:`, error.message);
        }
      }
    } else if (newPartitionKey) {
      try {
        const partitionMetadata = {
          _v: String(this.version)
        };
        await this.client.putObject({
          key: newPartitionKey,
          metadata: partitionMetadata,
          body: "",
          contentType: void 0
        });
      } catch (error) {
        console.warn(`Partition object could not be updated for ${partitionName}:`, error.message);
      }
    }
  }
  /**
   * Update partition objects to keep them in sync (legacy method for backward compatibility)
   * @param {Object} data - Updated object data
   */
  async updatePartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      if (!partition || !partition.fields || typeof partition.fields !== "object") {
        console.warn(`Skipping invalid partition '${partitionName}' in resource '${this.name}'`);
        continue;
      }
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        const partitionMetadata = {
          _v: String(this.version)
        };
        try {
          await this.client.putObject({
            key: partitionKey,
            metadata: partitionMetadata,
            body: "",
            contentType: void 0
          });
        } catch (error) {
          console.warn(`Partition object could not be updated for ${partitionName}:`, error.message);
        }
      }
    }
  }
  /**
   * Get a resource object directly from a specific partition
   * @param {Object} params - Partition parameters
   * @param {string} params.id - Resource ID
   * @param {string} params.partitionName - Name of the partition
   * @param {Object} params.partitionValues - Values for partition fields
   * @returns {Promise<Object>} The resource object with partition metadata
   * @example
   * // Get user from UTM source partition
   * const user = await resource.getFromPartition({
   *   id: 'user-123',
   *   partitionName: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * console.log(user._partition); // 'byUtmSource'
   * console.log(user._partitionValues); // { 'utm.source': 'google' }
   * 
   * // Get product from multi-field partition
   * const product = await resource.getFromPartition({
   *   id: 'product-456',
   *   partitionName: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async getFromPartition({ id, partitionName, partitionValues = {} }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new Error(`Partition '${partitionName}' not found`);
    }
    const partition = this.config.partitions[partitionName];
    const partitionSegments = [];
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== void 0 && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    if (partitionSegments.length === 0) {
      throw new Error(`No partition values provided for partition '${partitionName}'`);
    }
    const partitionKey = join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
    try {
      await this.client.headObject(partitionKey);
    } catch (error) {
      throw new Error(`Resource with id '${id}' not found in partition '${partitionName}'`);
    }
    const data = await this.get(id);
    data._partition = partitionName;
    data._partitionValues = partitionValues;
    this.emit("getFromPartition", data);
    return data;
  }
  /**
   * Create a historical version of an object
   * @param {string} id - Resource ID
   * @param {Object} data - Object data to store historically
   */
  async createHistoricalVersion(id, data) {
    const historicalKey = join(`resource=${this.name}`, `historical`, `id=${id}`);
    const historicalData = {
      ...data,
      _v: data._v || this.version,
      _historicalTimestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const mappedData = await this.schema.mapper(historicalData);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: historicalData,
      mappedData
    });
    const finalMetadata = {
      ...processedMetadata,
      _v: data._v || this.version,
      _historicalTimestamp: historicalData._historicalTimestamp
    };
    let contentType = void 0;
    if (body && body !== "") {
      try {
        JSON.parse(body);
        contentType = "application/json";
      } catch {
      }
    }
    await this.client.putObject({
      key: historicalKey,
      metadata: finalMetadata,
      body,
      contentType
    });
  }
  /**
   * Apply version mapping to convert an object from one version to another
   * @param {Object} data - Object data to map
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {Object} Mapped object data
   */
  async applyVersionMapping(data, fromVersion, toVersion) {
    if (fromVersion === toVersion) {
      return data;
    }
    const mappedData = {
      ...data,
      _v: toVersion,
      _originalVersion: fromVersion,
      _versionMapped: true
    };
    return mappedData;
  }
}
function validateResourceConfig(config) {
  const errors = [];
  if (!config.name) {
    errors.push("Resource 'name' is required");
  } else if (typeof config.name !== "string") {
    errors.push("Resource 'name' must be a string");
  } else if (config.name.trim() === "") {
    errors.push("Resource 'name' cannot be empty");
  }
  if (!config.client) {
    errors.push("S3 'client' is required");
  }
  if (!config.attributes) {
    errors.push("Resource 'attributes' are required");
  } else if (typeof config.attributes !== "object" || Array.isArray(config.attributes)) {
    errors.push("Resource 'attributes' must be an object");
  } else if (Object.keys(config.attributes).length === 0) {
    errors.push("Resource 'attributes' cannot be empty");
  }
  if (config.version !== void 0 && typeof config.version !== "string") {
    errors.push("Resource 'version' must be a string");
  }
  if (config.behavior !== void 0 && typeof config.behavior !== "string") {
    errors.push("Resource 'behavior' must be a string");
  }
  if (config.passphrase !== void 0 && typeof config.passphrase !== "string") {
    errors.push("Resource 'passphrase' must be a string");
  }
  if (config.parallelism !== void 0) {
    if (typeof config.parallelism !== "number" || !Number.isInteger(config.parallelism)) {
      errors.push("Resource 'parallelism' must be an integer");
    } else if (config.parallelism < 1) {
      errors.push("Resource 'parallelism' must be greater than 0");
    }
  }
  if (config.observers !== void 0 && !Array.isArray(config.observers)) {
    errors.push("Resource 'observers' must be an array");
  }
  const booleanFields = ["cache", "autoDecrypt", "timestamps", "paranoid", "allNestedObjectsOptional"];
  for (const field of booleanFields) {
    if (config[field] !== void 0 && typeof config[field] !== "boolean") {
      errors.push(`Resource '${field}' must be a boolean`);
    }
  }
  if (config.idGenerator !== void 0) {
    if (typeof config.idGenerator !== "function" && typeof config.idGenerator !== "number") {
      errors.push("Resource 'idGenerator' must be a function or a number (size)");
    } else if (typeof config.idGenerator === "number" && config.idGenerator <= 0) {
      errors.push("Resource 'idGenerator' size must be greater than 0");
    }
  }
  if (config.idSize !== void 0) {
    if (typeof config.idSize !== "number" || !Number.isInteger(config.idSize)) {
      errors.push("Resource 'idSize' must be an integer");
    } else if (config.idSize <= 0) {
      errors.push("Resource 'idSize' must be greater than 0");
    }
  }
  if (config.partitions !== void 0) {
    if (typeof config.partitions !== "object" || Array.isArray(config.partitions)) {
      errors.push("Resource 'partitions' must be an object");
    } else {
      for (const [partitionName, partitionDef] of Object.entries(config.partitions)) {
        if (typeof partitionDef !== "object" || Array.isArray(partitionDef)) {
          errors.push(`Partition '${partitionName}' must be an object`);
        } else if (!partitionDef.fields) {
          errors.push(`Partition '${partitionName}' must have a 'fields' property`);
        } else if (typeof partitionDef.fields !== "object" || Array.isArray(partitionDef.fields)) {
          errors.push(`Partition '${partitionName}.fields' must be an object`);
        } else {
          for (const [fieldName, fieldType] of Object.entries(partitionDef.fields)) {
            if (typeof fieldType !== "string") {
              errors.push(`Partition '${partitionName}.fields.${fieldName}' must be a string`);
            }
          }
        }
      }
    }
  }
  if (config.hooks !== void 0) {
    if (typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
      errors.push("Resource 'hooks' must be an object");
    } else {
      const validHookEvents = ["preInsert", "afterInsert", "preUpdate", "afterUpdate", "preDelete", "afterDelete"];
      for (const [event, hooksArr] of Object.entries(config.hooks)) {
        if (!validHookEvents.includes(event)) {
          errors.push(`Invalid hook event '${event}'. Valid events: ${validHookEvents.join(", ")}`);
        } else if (!Array.isArray(hooksArr)) {
          errors.push(`Resource 'hooks.${event}' must be an array`);
        } else {
          for (let i = 0; i < hooksArr.length; i++) {
            const hook = hooksArr[i];
            if (typeof hook !== "function") {
              if (typeof hook === "string") continue;
              continue;
            }
          }
        }
      }
    }
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

class Database extends EventEmitter {
  constructor(options) {
    super();
    this.version = "1";
    this.s3dbVersion = (() => {
      try {
        return true ? "6.0.0" : "latest";
      } catch (e) {
        return "latest";
      }
    })();
    this.resources = {};
    this.savedMetadata = null;
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.pluginList = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";
    this.versioningEnabled = options.versioningEnabled || false;
    let connectionString = options.connectionString;
    if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
      const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;
      if (endpoint) {
        const url = new URL(endpoint);
        if (accessKeyId) url.username = encodeURIComponent(accessKeyId);
        if (secretAccessKey) url.password = encodeURIComponent(secretAccessKey);
        url.pathname = `/${bucket || "s3db"}`;
        if (forcePathStyle) {
          url.searchParams.set("forcePathStyle", "true");
        }
        connectionString = url.toString();
      } else if (accessKeyId && secretAccessKey) {
        const params = new URLSearchParams();
        params.set("region", region || "us-east-1");
        if (forcePathStyle) {
          params.set("forcePathStyle", "true");
        }
        connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || "s3db"}?${params.toString()}`;
      }
    }
    this.client = options.client || new Client({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString
    });
    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;
  }
  async connect() {
    await this.startPlugins();
    let metadata = null;
    if (await this.client.exists(`s3db.json`)) {
      const request = await this.client.getObject(`s3db.json`);
      metadata = JSON.parse(await streamToString(request?.Body));
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }
    this.savedMetadata = metadata;
    const definitionChanges = this.detectDefinitionChanges(metadata);
    for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
      const currentVersion = resourceMetadata.currentVersion || "v0";
      const versionData = resourceMetadata.versions?.[currentVersion];
      if (versionData) {
        this.resources[name] = new Resource({
          name,
          client: this.client,
          version: currentVersion,
          attributes: versionData.attributes,
          behavior: versionData.behavior || "user-managed",
          parallelism: this.parallelism,
          passphrase: this.passphrase,
          observers: [this],
          cache: this.cache,
          timestamps: versionData.timestamps !== void 0 ? versionData.timestamps : false,
          partitions: resourceMetadata.partitions || versionData.partitions || {},
          paranoid: versionData.paranoid !== void 0 ? versionData.paranoid : true,
          allNestedObjectsOptional: versionData.allNestedObjectsOptional !== void 0 ? versionData.allNestedObjectsOptional : true,
          autoDecrypt: versionData.autoDecrypt !== void 0 ? versionData.autoDecrypt : true,
          hooks: versionData.hooks || {},
          versioningEnabled: this.versioningEnabled
        });
      }
    }
    if (definitionChanges.length > 0) {
      this.emit("resourceDefinitionsChanged", {
        changes: definitionChanges,
        metadata: this.savedMetadata
      });
    }
    this.emit("connected", /* @__PURE__ */ new Date());
  }
  /**
   * Detect changes in resource definitions compared to saved metadata
   * @param {Object} savedMetadata - The metadata loaded from s3db.json
   * @returns {Array} Array of change objects
   */
  detectDefinitionChanges(savedMetadata) {
    const changes = [];
    for (const [name, currentResource] of Object.entries(this.resources)) {
      const currentHash = this.generateDefinitionHash(currentResource.export());
      const savedResource = savedMetadata.resources?.[name];
      if (!savedResource) {
        changes.push({
          type: "new",
          resourceName: name,
          currentHash,
          savedHash: null
        });
      } else {
        const currentVersion = savedResource.currentVersion || "v0";
        const versionData = savedResource.versions?.[currentVersion];
        const savedHash = versionData?.hash;
        if (savedHash !== currentHash) {
          changes.push({
            type: "changed",
            resourceName: name,
            currentHash,
            savedHash,
            fromVersion: currentVersion,
            toVersion: this.getNextVersion(savedResource.versions)
          });
        }
      }
    }
    for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
      if (!this.resources[name]) {
        const currentVersion = savedResource.currentVersion || "v0";
        const versionData = savedResource.versions?.[currentVersion];
        changes.push({
          type: "deleted",
          resourceName: name,
          currentHash: null,
          savedHash: versionData?.hash,
          deletedVersion: currentVersion
        });
      }
    }
    return changes;
  }
  /**
   * Generate a consistent hash for a resource definition
   * @param {Object} definition - Resource definition to hash
   * @param {string} behavior - Resource behavior
   * @returns {string} SHA256 hash
   */
  generateDefinitionHash(definition, behavior = void 0) {
    const attributes = definition.attributes;
    const stableAttributes = { ...attributes };
    if (definition.timestamps) {
      delete stableAttributes.createdAt;
      delete stableAttributes.updatedAt;
    }
    const hashObj = {
      attributes: stableAttributes,
      behavior: behavior || definition.behavior || "user-managed"
    };
    const stableString = jsonStableStringify(hashObj);
    return `sha256:${createHash("sha256").update(stableString).digest("hex")}`;
  }
  /**
   * Get the next version number for a resource
   * @param {Object} versions - Existing versions object
   * @returns {string} Next version string (e.g., 'v1', 'v2')
   */
  getNextVersion(versions = {}) {
    const versionNumbers = Object.keys(versions).filter((v) => v.startsWith("v")).map((v) => parseInt(v.substring(1))).filter((n) => !isNaN(n));
    const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : -1;
    return `v${maxVersion + 1}`;
  }
  async startPlugins() {
    const db = this;
    if (!isEmpty(this.pluginList)) {
      const plugins = this.pluginList.map((p) => isFunction$1(p) ? new p(this) : p);
      const setupProms = plugins.map(async (plugin) => {
        if (plugin.beforeSetup) await plugin.beforeSetup();
        await plugin.setup(db);
        if (plugin.afterSetup) await plugin.afterSetup();
      });
      await Promise.all(setupProms);
      const startProms = plugins.map(async (plugin) => {
        if (plugin.beforeStart) await plugin.beforeStart();
        await plugin.start();
        if (plugin.afterStart) await plugin.afterStart();
      });
      await Promise.all(startProms);
    }
  }
  /**
   * Register and setup a plugin
   * @param {Plugin} plugin - Plugin instance to register
   * @param {string} [name] - Optional name for the plugin (defaults to plugin.constructor.name)
   */
  async usePlugin(plugin, name = null) {
    const pluginName = name || plugin.constructor.name.replace("Plugin", "").toLowerCase();
    this.plugins[pluginName] = plugin;
    if (this.isConnected()) {
      await plugin.setup(this);
      await plugin.start();
    }
    return plugin;
  }
  async uploadMetadataFile() {
    const metadata = {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      resources: {}
    };
    Object.entries(this.resources).forEach(([name, resource]) => {
      const resourceDef = resource.export();
      const definitionHash = this.generateDefinitionHash(resourceDef);
      const existingResource = this.savedMetadata?.resources?.[name];
      const currentVersion = existingResource?.currentVersion || "v0";
      const existingVersionData = existingResource?.versions?.[currentVersion];
      let version, isNewVersion;
      if (!existingVersionData || existingVersionData.hash !== definitionHash) {
        version = this.getNextVersion(existingResource?.versions);
        isNewVersion = true;
      } else {
        version = currentVersion;
        isNewVersion = false;
      }
      metadata.resources[name] = {
        currentVersion: version,
        partitions: resource.config.partitions || {},
        versions: {
          ...existingResource?.versions,
          // Preserve previous versions
          [version]: {
            hash: definitionHash,
            attributes: resourceDef.attributes,
            behavior: resourceDef.behavior || "user-managed",
            timestamps: resource.config.timestamps,
            partitions: resource.config.partitions,
            paranoid: resource.config.paranoid,
            allNestedObjectsOptional: resource.config.allNestedObjectsOptional,
            autoDecrypt: resource.config.autoDecrypt,
            cache: resource.config.cache,
            hooks: resource.config.hooks,
            createdAt: isNewVersion ? (/* @__PURE__ */ new Date()).toISOString() : existingVersionData?.createdAt
          }
        }
      };
      if (resource.version !== version) {
        resource.version = version;
        resource.emit("versionUpdated", { oldVersion: currentVersion, newVersion: version });
      }
    });
    await this.client.putObject({
      key: "s3db.json",
      body: JSON.stringify(metadata, null, 2),
      contentType: "application/json"
    });
    this.savedMetadata = metadata;
    this.emit("metadataUploaded", metadata);
  }
  blankMetadataStructure() {
    return {
      version: `1`,
      s3dbVersion: this.s3dbVersion,
      resources: {}
    };
  }
  /**
   * Check if a resource exists by name
   * @param {string} name - Resource name
   * @returns {boolean} True if resource exists, false otherwise
   */
  resourceExists(name) {
    return !!this.resources[name];
  }
  /**
   * Check if a resource exists with the same definition hash
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes
   * @param {string} [config.behavior] - Resource behavior
   * @param {Object} [config.options] - Resource options (deprecated, use root level parameters)
   * @returns {Object} Result with exists and hash information
   */
  resourceExistsWithSameHash({ name, attributes, behavior = "user-managed", options = {} }) {
    if (!this.resources[name]) {
      return { exists: false, sameHash: false, hash: null };
    }
    const existingResource = this.resources[name];
    const existingHash = this.generateDefinitionHash(existingResource.export());
    const mockResource = new Resource({
      name,
      attributes,
      behavior,
      client: this.client,
      version: existingResource.version,
      passphrase: this.passphrase,
      versioningEnabled: this.versioningEnabled,
      ...options
    });
    const newHash = this.generateDefinitionHash(mockResource.export());
    return {
      exists: true,
      sameHash: existingHash === newHash,
      hash: newHash,
      existingHash
    };
  }
  async createResource({ name, attributes, behavior = "user-managed", hooks, ...config }) {
    if (this.resources[name]) {
      const existingResource = this.resources[name];
      Object.assign(existingResource.config, {
        cache: this.cache,
        ...config
      });
      if (behavior) {
        existingResource.behavior = behavior;
      }
      existingResource.versioningEnabled = this.versioningEnabled;
      existingResource.updateAttributes(attributes);
      if (hooks) {
        for (const [event, hooksArr] of Object.entries(hooks)) {
          if (Array.isArray(hooksArr) && existingResource.hooks[event]) {
            for (const fn of hooksArr) {
              if (typeof fn === "function") {
                existingResource.hooks[event].push(fn.bind(existingResource));
              }
            }
          }
        }
      }
      const newHash = this.generateDefinitionHash(existingResource.export(), existingResource.behavior);
      const existingMetadata2 = this.savedMetadata?.resources?.[name];
      const currentVersion = existingMetadata2?.currentVersion || "v0";
      const existingVersionData = existingMetadata2?.versions?.[currentVersion];
      if (!existingVersionData || existingVersionData.hash !== newHash) {
        await this.uploadMetadataFile();
      }
      this.emit("s3db.resourceUpdated", name);
      return existingResource;
    }
    const existingMetadata = this.savedMetadata?.resources?.[name];
    const version = existingMetadata?.currentVersion || "v0";
    const resource = new Resource({
      name,
      attributes,
      behavior,
      observers: [this],
      client: this.client,
      version,
      passphrase: this.passphrase,
      cache: this.cache,
      hooks,
      versioningEnabled: this.versioningEnabled,
      ...config
    });
    this.resources[name] = resource;
    await this.uploadMetadataFile();
    this.emit("s3db.resourceCreated", name);
    return resource;
  }
  resource(name) {
    if (!this.resources[name]) {
      return Promise.reject(`resource ${name} does not exist`);
    }
    return this.resources[name];
  }
  /**
   * List all resource names
   * @returns {Array} Array of resource names
   */
  async listResources() {
    return Object.keys(this.resources).map((name) => ({ name }));
  }
  /**
   * Get a specific resource by name
   * @param {string} name - Resource name
   * @returns {Resource} Resource instance
   */
  async getResource(name) {
    if (!this.resources[name]) {
      throw new Error(`Resource not found: ${name}`);
    }
    return this.resources[name];
  }
  /**
   * Get database configuration
   * @returns {Object} Configuration object
   */
  get config() {
    return {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      parallelism: this.parallelism,
      verbose: this.verbose
    };
  }
  isConnected() {
    return !!this.savedMetadata;
  }
}
class S3db extends Database {
}

class Cache extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
  }
  // to implement:
  async _set(key, data) {
  }
  async _get(key) {
  }
  async _del(key) {
  }
  async _clear(key) {
  }
  validateKey(key) {
    if (key === null || key === void 0 || typeof key !== "string" || !key) {
      throw new Error("Invalid key");
    }
  }
  // generic class methods
  async set(key, data) {
    this.validateKey(key);
    await this._set(key, data);
    this.emit("set", data);
    return data;
  }
  async get(key) {
    this.validateKey(key);
    const data = await this._get(key);
    this.emit("get", data);
    return data;
  }
  async del(key) {
    this.validateKey(key);
    const data = await this._del(key);
    this.emit("delete", data);
    return data;
  }
  async delete(key) {
    return this.del(key);
  }
  async clear() {
    const data = await this._clear();
    this.emit("clear", data);
    return data;
  }
}

class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize || 0;
    this.ttl = config.ttl || 0;
  }
  async _set(key, data) {
    if (this.maxSize > 0 && Object.keys(this.cache).length >= this.maxSize) {
      const oldestKey = Object.entries(this.meta).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
      if (oldestKey) {
        delete this.cache[oldestKey];
        delete this.meta[oldestKey];
      }
    }
    this.cache[key] = data;
    this.meta[key] = { ts: Date.now() };
    return data;
  }
  async _get(key) {
    if (!Object.prototype.hasOwnProperty.call(this.cache, key)) return null;
    if (this.ttl > 0) {
      const now = Date.now();
      const meta = this.meta[key];
      if (meta && now - meta.ts > this.ttl * 1e3) {
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    return this.cache[key];
  }
  async _del(key) {
    delete this.cache[key];
    delete this.meta[key];
    return true;
  }
  async _clear() {
    this.cache = {};
    this.meta = {};
    return true;
  }
  async size() {
    return Object.keys(this.cache).length;
  }
  async keys() {
    return Object.keys(this.cache);
  }
}

var msg = {
  2:      'need dictionary',     /* Z_NEED_DICT       2  */
  1:      'stream end',          /* Z_STREAM_END      1  */
  0:      '',                    /* Z_OK              0  */
  '-1':   'file error',          /* Z_ERRNO         (-1) */
  '-2':   'stream error',        /* Z_STREAM_ERROR  (-2) */
  '-3':   'data error',          /* Z_DATA_ERROR    (-3) */
  '-4':   'insufficient memory', /* Z_MEM_ERROR     (-4) */
  '-5':   'buffer error',        /* Z_BUF_ERROR     (-5) */
  '-6':   'incompatible version' /* Z_VERSION_ERROR (-6) */
};

function ZStream() {
  /* next input byte */
  this.input = null; // JS specific, because we have no pointers
  this.next_in = 0;
  /* number of bytes available at input */
  this.avail_in = 0;
  /* total number of input bytes read so far */
  this.total_in = 0;
  /* next output byte should be put there */
  this.output = null; // JS specific, because we have no pointers
  this.next_out = 0;
  /* remaining free space at output */
  this.avail_out = 0;
  /* total number of bytes output so far */
  this.total_out = 0;
  /* last error message, NULL if no error */
  this.msg = ''/*Z_NULL*/;
  /* not visible by applications */
  this.state = null;
  /* best guess about the data type: binary or text */
  this.data_type = 2/*Z_UNKNOWN*/;
  /* adler32 value of the uncompressed data */
  this.adler = 0;
}

function arraySet(dest, src, src_offs, len, dest_offs) {
  if (src.subarray && dest.subarray) {
    dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
    return;
  }
  // Fallback to ordinary array
  for (var i = 0; i < len; i++) {
    dest[dest_offs + i] = src[src_offs + i];
  }
}


var Buf8 = Uint8Array;
var Buf16 = Uint16Array;
var Buf32 = Int32Array;
// Enable/Disable typed arrays use, for testing
//

/* Public constants ==========================================================*/
/* ===========================================================================*/


//var Z_FILTERED          = 1;
//var Z_HUFFMAN_ONLY      = 2;
//var Z_RLE               = 3;
var Z_FIXED$2 = 4;
//var Z_DEFAULT_STRATEGY  = 0;

/* Possible values of the data_type field (though see inflate()) */
var Z_BINARY$1 = 0;
var Z_TEXT$1 = 1;
//var Z_ASCII             = 1; // = Z_TEXT
var Z_UNKNOWN$2 = 2;

/*============================================================================*/


function zero$1(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}

// From zutil.h

var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES = 2;
/* The three kinds of block type */

var MIN_MATCH$1 = 3;
var MAX_MATCH$1 = 258;
/* The minimum and maximum match lengths */

// From deflate.h
/* ===========================================================================
 * Internal compression state.
 */

var LENGTH_CODES$1 = 29;
/* number of length codes, not counting the special END_BLOCK code */

var LITERALS$1 = 256;
/* number of literal bytes 0..255 */

var L_CODES$1 = LITERALS$1 + 1 + LENGTH_CODES$1;
/* number of Literal or Length codes, including the END_BLOCK code */

var D_CODES$1 = 30;
/* number of distance codes */

var BL_CODES$1 = 19;
/* number of codes used to transfer the bit lengths */

var HEAP_SIZE$1 = 2 * L_CODES$1 + 1;
/* maximum heap size */

var MAX_BITS$1 = 15;
/* All codes must not exceed MAX_BITS bits */

var Buf_size = 16;
/* size of bit buffer in bi_buf */


/* ===========================================================================
 * Constants
 */

var MAX_BL_BITS = 7;
/* Bit length codes must not exceed MAX_BL_BITS bits */

var END_BLOCK = 256;
/* end of block literal code */

var REP_3_6 = 16;
/* repeat previous bit length 3-6 times (2 bits of repeat count) */

var REPZ_3_10 = 17;
/* repeat a zero length 3-10 times  (3 bits of repeat count) */

var REPZ_11_138 = 18;
/* repeat a zero length 11-138 times  (7 bits of repeat count) */

/* eslint-disable comma-spacing,array-bracket-spacing */
var extra_lbits = /* extra bits for each length code */ [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

var extra_dbits = /* extra bits for each distance code */ [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

var extra_blbits = /* extra bits for each bit length code */ [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];

var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
/* eslint-enable comma-spacing,array-bracket-spacing */

/* The lengths of the bit length codes are sent in order of decreasing
 * probability, to avoid transmitting the lengths for unused bit length codes.
 */

/* ===========================================================================
 * Local data. These are initialized only once.
 */

// We pre-fill arrays with 0 to avoid uninitialized gaps

var DIST_CODE_LEN = 512; /* see definition of array dist_code below */

// !!!! Use flat array insdead of structure, Freq = i*2, Len = i*2+1
var static_ltree = new Array((L_CODES$1 + 2) * 2);
zero$1(static_ltree);
/* The static literal tree. Since the bit lengths are imposed, there is no
 * need for the L_CODES extra codes used during heap construction. However
 * The codes 286 and 287 are needed to build a canonical tree (see _tr_init
 * below).
 */

var static_dtree = new Array(D_CODES$1 * 2);
zero$1(static_dtree);
/* The static distance tree. (Actually a trivial tree since all codes use
 * 5 bits.)
 */

var _dist_code = new Array(DIST_CODE_LEN);
zero$1(_dist_code);
/* Distance codes. The first 256 values correspond to the distances
 * 3 .. 258, the last 256 values correspond to the top 8 bits of
 * the 15 bit distances.
 */

var _length_code = new Array(MAX_MATCH$1 - MIN_MATCH$1 + 1);
zero$1(_length_code);
/* length code for each normalized match length (0 == MIN_MATCH) */

var base_length = new Array(LENGTH_CODES$1);
zero$1(base_length);
/* First normalized length for each code (0 = MIN_MATCH) */

var base_dist = new Array(D_CODES$1);
zero$1(base_dist);
/* First normalized distance for each code (0 = distance of 1) */


function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {

  this.static_tree = static_tree; /* static tree or NULL */
  this.extra_bits = extra_bits; /* extra bits for each code or NULL */
  this.extra_base = extra_base; /* base index for extra_bits */
  this.elems = elems; /* max number of elements in the tree */
  this.max_length = max_length; /* max bit length for the codes */

  // show if `static_tree` has data or dummy - needed for monomorphic objects
  this.has_stree = static_tree && static_tree.length;
}


var static_l_desc;
var static_d_desc;
var static_bl_desc;


function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree; /* the dynamic tree */
  this.max_code = 0; /* largest code with non zero frequency */
  this.stat_desc = stat_desc; /* the corresponding static tree */
}



function d_code(dist) {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
}


/* ===========================================================================
 * Output a short LSB first on the stream.
 * IN assertion: there is enough room in pendingBuf.
 */
function put_short(s, w) {
  //    put_byte(s, (uch)((w) & 0xff));
  //    put_byte(s, (uch)((ush)(w) >> 8));
  s.pending_buf[s.pending++] = (w) & 0xff;
  s.pending_buf[s.pending++] = (w >>> 8) & 0xff;
}


/* ===========================================================================
 * Send a value on a given number of bits.
 * IN assertion: length <= 16 and value fits in length bits.
 */
function send_bits(s, value, length) {
  if (s.bi_valid > (Buf_size - length)) {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    put_short(s, s.bi_buf);
    s.bi_buf = value >> (Buf_size - s.bi_valid);
    s.bi_valid += length - Buf_size;
  } else {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    s.bi_valid += length;
  }
}


function send_code(s, c, tree) {
  send_bits(s, tree[c * 2] /*.Code*/ , tree[c * 2 + 1] /*.Len*/ );
}


/* ===========================================================================
 * Reverse the first len bits of a code, using straightforward code (a faster
 * method would use a table)
 * IN assertion: 1 <= len <= 15
 */
function bi_reverse(code, len) {
  var res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
}


/* ===========================================================================
 * Flush the bit buffer, keeping at most 7 bits in it.
 */
function bi_flush(s) {
  if (s.bi_valid === 16) {
    put_short(s, s.bi_buf);
    s.bi_buf = 0;
    s.bi_valid = 0;

  } else if (s.bi_valid >= 8) {
    s.pending_buf[s.pending++] = s.bi_buf & 0xff;
    s.bi_buf >>= 8;
    s.bi_valid -= 8;
  }
}


/* ===========================================================================
 * Compute the optimal bit lengths for a tree and update the total bit length
 * for the current block.
 * IN assertion: the fields freq and dad are set, heap[heap_max] and
 *    above are the tree nodes sorted by increasing frequency.
 * OUT assertions: the field len is set to the optimal bit length, the
 *     array bl_count contains the frequencies for each bit length.
 *     The length opt_len is updated; static_len is also updated if stree is
 *     not null.
 */
function gen_bitlen(s, desc) {
//    deflate_state *s;
//    tree_desc *desc;    /* the tree descriptor */
  var tree = desc.dyn_tree;
  var max_code = desc.max_code;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var extra = desc.stat_desc.extra_bits;
  var base = desc.stat_desc.extra_base;
  var max_length = desc.stat_desc.max_length;
  var h; /* heap index */
  var n, m; /* iterate over the tree elements */
  var bits; /* bit length */
  var xbits; /* extra bits */
  var f; /* frequency */
  var overflow = 0; /* number of elements with bit length too large */

  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    s.bl_count[bits] = 0;
  }

  /* In a first pass, compute the optimal bit lengths (which may
   * overflow in the case of the bit length tree).
   */
  tree[s.heap[s.heap_max] * 2 + 1] /*.Len*/ = 0; /* root of the heap */

  for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
    n = s.heap[h];
    bits = tree[tree[n * 2 + 1] /*.Dad*/ * 2 + 1] /*.Len*/ + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n * 2 + 1] /*.Len*/ = bits;
    /* We overwrite tree[n].Dad which is no longer needed */

    if (n > max_code) {
      continue;
    } /* not a leaf node */

    s.bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n * 2] /*.Freq*/ ;
    s.opt_len += f * (bits + xbits);
    if (has_stree) {
      s.static_len += f * (stree[n * 2 + 1] /*.Len*/ + xbits);
    }
  }
  if (overflow === 0) {
    return;
  }

  // Trace((stderr,"\nbit length overflow\n"));
  /* This happens for example on obj2 and pic of the Calgary corpus */

  /* Find the first bit length which could increase: */
  do {
    bits = max_length - 1;
    while (s.bl_count[bits] === 0) {
      bits--;
    }
    s.bl_count[bits]--; /* move one leaf down the tree */
    s.bl_count[bits + 1] += 2; /* move one overflow item as its brother */
    s.bl_count[max_length]--;
    /* The brother of the overflow item also moves one step up,
     * but this does not affect bl_count[max_length]
     */
    overflow -= 2;
  } while (overflow > 0);

  /* Now recompute all bit lengths, scanning in increasing frequency.
   * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
   * lengths instead of fixing only the wrong ones. This idea is taken
   * from 'ar' written by Haruhiko Okumura.)
   */
  for (bits = max_length; bits !== 0; bits--) {
    n = s.bl_count[bits];
    while (n !== 0) {
      m = s.heap[--h];
      if (m > max_code) {
        continue;
      }
      if (tree[m * 2 + 1] /*.Len*/ !== bits) {
        // Trace((stderr,"code %d bits %d->%d\n", m, tree[m].Len, bits));
        s.opt_len += (bits - tree[m * 2 + 1] /*.Len*/ ) * tree[m * 2] /*.Freq*/ ;
        tree[m * 2 + 1] /*.Len*/ = bits;
      }
      n--;
    }
  }
}


/* ===========================================================================
 * Generate the codes for a given tree and bit counts (which need not be
 * optimal).
 * IN assertion: the array bl_count contains the bit length statistics for
 * the given tree and the field len is set for all tree elements.
 * OUT assertion: the field code is set for all tree elements of non
 *     zero code length.
 */
function gen_codes(tree, max_code, bl_count) {
//    ct_data *tree;             /* the tree to decorate */
//    int max_code;              /* largest code with non zero frequency */
//    ushf *bl_count;            /* number of codes at each bit length */

  var next_code = new Array(MAX_BITS$1 + 1); /* next code value for each bit length */
  var code = 0; /* running code value */
  var bits; /* bit index */
  var n; /* code index */

  /* The distribution counts are first used to generate the code values
   * without bit reversal.
   */
  for (bits = 1; bits <= MAX_BITS$1; bits++) {
    next_code[bits] = code = (code + bl_count[bits - 1]) << 1;
  }
  /* Check that the bit counts in bl_count are consistent. The last code
   * must be all ones.
   */
  //Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
  //        "inconsistent bit counts");
  //Tracev((stderr,"\ngen_codes: max_code %d ", max_code));

  for (n = 0; n <= max_code; n++) {
    var len = tree[n * 2 + 1] /*.Len*/ ;
    if (len === 0) {
      continue;
    }
    /* Now reverse the bits */
    tree[n * 2] /*.Code*/ = bi_reverse(next_code[len]++, len);

    //Tracecv(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
    //     n, (isgraph(n) ? n : ' '), len, tree[n].Code, next_code[len]-1));
  }
}


/* ===========================================================================
 * Initialize the various 'constant' tables.
 */
function tr_static_init() {
  var n; /* iterates over tree elements */
  var bits; /* bit counter */
  var length; /* length value */
  var code; /* code value */
  var dist; /* distance index */
  var bl_count = new Array(MAX_BITS$1 + 1);
  /* number of codes at each bit length for an optimal tree */

  // do check in _tr_init()
  //if (static_init_done) return;

  /* For some embedded targets, global variables are not initialized: */
  /*#ifdef NO_INIT_GLOBAL_POINTERS
    static_l_desc.static_tree = static_ltree;
    static_l_desc.extra_bits = extra_lbits;
    static_d_desc.static_tree = static_dtree;
    static_d_desc.extra_bits = extra_dbits;
    static_bl_desc.extra_bits = extra_blbits;
  #endif*/

  /* Initialize the mapping length (0..255) -> length code (0..28) */
  length = 0;
  for (code = 0; code < LENGTH_CODES$1 - 1; code++) {
    base_length[code] = length;
    for (n = 0; n < (1 << extra_lbits[code]); n++) {
      _length_code[length++] = code;
    }
  }
  //Assert (length == 256, "tr_static_init: length != 256");
  /* Note that the length 255 (match length 258) can be represented
   * in two different ways: code 284 + 5 bits or code 285, so we
   * overwrite length_code[255] to use the best encoding:
   */
  _length_code[length - 1] = code;

  /* Initialize the mapping dist (0..32K) -> dist code (0..29) */
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n = 0; n < (1 << extra_dbits[code]); n++) {
      _dist_code[dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: dist != 256");
  dist >>= 7; /* from now on, all distances are divided by 128 */
  for (; code < D_CODES$1; code++) {
    base_dist[code] = dist << 7;
    for (n = 0; n < (1 << (extra_dbits[code] - 7)); n++) {
      _dist_code[256 + dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: 256+dist != 512");

  /* Construct the codes of the static literal tree */
  for (bits = 0; bits <= MAX_BITS$1; bits++) {
    bl_count[bits] = 0;
  }

  n = 0;
  while (n <= 143) {
    static_ltree[n * 2 + 1] /*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  while (n <= 255) {
    static_ltree[n * 2 + 1] /*.Len*/ = 9;
    n++;
    bl_count[9]++;
  }
  while (n <= 279) {
    static_ltree[n * 2 + 1] /*.Len*/ = 7;
    n++;
    bl_count[7]++;
  }
  while (n <= 287) {
    static_ltree[n * 2 + 1] /*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  /* Codes 286 and 287 do not exist, but we must include them in the
   * tree construction to get a canonical Huffman tree (longest code
   * all ones)
   */
  gen_codes(static_ltree, L_CODES$1 + 1, bl_count);

  /* The static distance tree is trivial: */
  for (n = 0; n < D_CODES$1; n++) {
    static_dtree[n * 2 + 1] /*.Len*/ = 5;
    static_dtree[n * 2] /*.Code*/ = bi_reverse(n, 5);
  }

  // Now data ready and we can init static trees
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS$1 + 1, L_CODES$1, MAX_BITS$1);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES$1, MAX_BITS$1);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES$1, MAX_BL_BITS);

  //static_init_done = true;
}


/* ===========================================================================
 * Initialize a new block.
 */
function init_block(s) {
  var n; /* iterates over tree elements */

  /* Initialize the trees. */
  for (n = 0; n < L_CODES$1; n++) {
    s.dyn_ltree[n * 2] /*.Freq*/ = 0;
  }
  for (n = 0; n < D_CODES$1; n++) {
    s.dyn_dtree[n * 2] /*.Freq*/ = 0;
  }
  for (n = 0; n < BL_CODES$1; n++) {
    s.bl_tree[n * 2] /*.Freq*/ = 0;
  }

  s.dyn_ltree[END_BLOCK * 2] /*.Freq*/ = 1;
  s.opt_len = s.static_len = 0;
  s.last_lit = s.matches = 0;
}


/* ===========================================================================
 * Flush the bit buffer and align the output on a byte boundary
 */
function bi_windup(s) {
  if (s.bi_valid > 8) {
    put_short(s, s.bi_buf);
  } else if (s.bi_valid > 0) {
    //put_byte(s, (Byte)s->bi_buf);
    s.pending_buf[s.pending++] = s.bi_buf;
  }
  s.bi_buf = 0;
  s.bi_valid = 0;
}

/* ===========================================================================
 * Copy a stored block, storing first the length and its
 * one's complement if requested.
 */
function copy_block(s, buf, len, header) {
//DeflateState *s;
//charf    *buf;    /* the input data */
//unsigned len;     /* its length */
//int      header;  /* true if block header must be written */

  bi_windup(s); /* align on byte boundary */

  {
    put_short(s, len);
    put_short(s, ~len);
  }
  //  while (len--) {
  //    put_byte(s, *buf++);
  //  }
  arraySet(s.pending_buf, s.window, buf, len, s.pending);
  s.pending += len;
}

/* ===========================================================================
 * Compares to subtrees, using the tree depth as tie breaker when
 * the subtrees have equal frequency. This minimizes the worst case length.
 */
function smaller(tree, n, m, depth) {
  var _n2 = n * 2;
  var _m2 = m * 2;
  return (tree[_n2] /*.Freq*/ < tree[_m2] /*.Freq*/ ||
    (tree[_n2] /*.Freq*/ === tree[_m2] /*.Freq*/ && depth[n] <= depth[m]));
}

/* ===========================================================================
 * Restore the heap property by moving down the tree starting at node k,
 * exchanging a node with the smallest of its two sons if necessary, stopping
 * when the heap property is re-established (each father smaller than its
 * two sons).
 */
function pqdownheap(s, tree, k)
//    deflate_state *s;
//    ct_data *tree;  /* the tree to restore */
//    int k;               /* node to move down */
{
  var v = s.heap[k];
  var j = k << 1; /* left son of k */
  while (j <= s.heap_len) {
    /* Set j to the smallest of the two sons: */
    if (j < s.heap_len &&
      smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
      j++;
    }
    /* Exit if v is smaller than both sons */
    if (smaller(tree, v, s.heap[j], s.depth)) {
      break;
    }

    /* Exchange v with the smallest son */
    s.heap[k] = s.heap[j];
    k = j;

    /* And continue down the tree, setting j to the left son of k */
    j <<= 1;
  }
  s.heap[k] = v;
}


// inlined manually
// var SMALLEST = 1;

/* ===========================================================================
 * Send the block data compressed using the given Huffman trees
 */
function compress_block(s, ltree, dtree)
//    deflate_state *s;
//    const ct_data *ltree; /* literal tree */
//    const ct_data *dtree; /* distance tree */
{
  var dist; /* distance of matched string */
  var lc; /* match length or unmatched char (if dist == 0) */
  var lx = 0; /* running index in l_buf */
  var code; /* the code to send */
  var extra; /* number of extra bits to send */

  if (s.last_lit !== 0) {
    do {
      dist = (s.pending_buf[s.d_buf + lx * 2] << 8) | (s.pending_buf[s.d_buf + lx * 2 + 1]);
      lc = s.pending_buf[s.l_buf + lx];
      lx++;

      if (dist === 0) {
        send_code(s, lc, ltree); /* send a literal byte */
        //Tracecv(isgraph(lc), (stderr," '%c' ", lc));
      } else {
        /* Here, lc is the match length - MIN_MATCH */
        code = _length_code[lc];
        send_code(s, code + LITERALS$1 + 1, ltree); /* send the length code */
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra); /* send the extra length bits */
        }
        dist--; /* dist is now the match distance - 1 */
        code = d_code(dist);
        //Assert (code < D_CODES, "bad d_code");

        send_code(s, code, dtree); /* send the distance code */
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra); /* send the extra distance bits */
        }
      } /* literal or match pair ? */

      /* Check that the overlay between pending_buf and d_buf+l_buf is ok: */
      //Assert((uInt)(s->pending) < s->lit_bufsize + 2*lx,
      //       "pendingBuf overflow");

    } while (lx < s.last_lit);
  }

  send_code(s, END_BLOCK, ltree);
}


/* ===========================================================================
 * Construct one Huffman tree and assigns the code bit strings and lengths.
 * Update the total bit length for the current block.
 * IN assertion: the field freq is set for all tree elements.
 * OUT assertions: the fields len and code are set to the optimal bit length
 *     and corresponding code. The length opt_len is updated; static_len is
 *     also updated if stree is not null. The field max_code is set.
 */
function build_tree(s, desc)
//    deflate_state *s;
//    tree_desc *desc; /* the tree descriptor */
{
  var tree = desc.dyn_tree;
  var stree = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var elems = desc.stat_desc.elems;
  var n, m; /* iterate over heap elements */
  var max_code = -1; /* largest code with non zero frequency */
  var node; /* new node being created */

  /* Construct the initial heap, with least frequent element in
   * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
   * heap[0] is not used.
   */
  s.heap_len = 0;
  s.heap_max = HEAP_SIZE$1;

  for (n = 0; n < elems; n++) {
    if (tree[n * 2] /*.Freq*/ !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;

    } else {
      tree[n * 2 + 1] /*.Len*/ = 0;
    }
  }

  /* The pkzip format requires that at least one distance code exists,
   * and that at least one bit should be sent even if there is only one
   * possible code. So to avoid special checks later on we force at least
   * two codes of non zero frequency.
   */
  while (s.heap_len < 2) {
    node = s.heap[++s.heap_len] = (max_code < 2 ? ++max_code : 0);
    tree[node * 2] /*.Freq*/ = 1;
    s.depth[node] = 0;
    s.opt_len--;

    if (has_stree) {
      s.static_len -= stree[node * 2 + 1] /*.Len*/ ;
    }
    /* node is 0 or 1 so it does not have extra bits */
  }
  desc.max_code = max_code;

  /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
   * establish sub-heaps of increasing lengths:
   */
  for (n = (s.heap_len >> 1 /*int /2*/ ); n >= 1; n--) {
    pqdownheap(s, tree, n);
  }

  /* Construct the Huffman tree by repeatedly combining the least two
   * frequent nodes.
   */
  node = elems; /* next internal node of the tree */
  do {
    //pqremove(s, tree, n);  /* n = node of least frequency */
    /*** pqremove ***/
    n = s.heap[1 /*SMALLEST*/ ];
    s.heap[1 /*SMALLEST*/ ] = s.heap[s.heap_len--];
    pqdownheap(s, tree, 1 /*SMALLEST*/ );
    /***/

    m = s.heap[1 /*SMALLEST*/ ]; /* m = node of next least frequency */

    s.heap[--s.heap_max] = n; /* keep the nodes sorted by frequency */
    s.heap[--s.heap_max] = m;

    /* Create a new node father of n and m */
    tree[node * 2] /*.Freq*/ = tree[n * 2] /*.Freq*/ + tree[m * 2] /*.Freq*/ ;
    s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
    tree[n * 2 + 1] /*.Dad*/ = tree[m * 2 + 1] /*.Dad*/ = node;

    /* and insert the new node in the heap */
    s.heap[1 /*SMALLEST*/ ] = node++;
    pqdownheap(s, tree, 1 /*SMALLEST*/ );

  } while (s.heap_len >= 2);

  s.heap[--s.heap_max] = s.heap[1 /*SMALLEST*/ ];

  /* At this point, the fields freq and dad are set. We can now
   * generate the bit lengths.
   */
  gen_bitlen(s, desc);

  /* The field len is now set, we can generate the bit codes */
  gen_codes(tree, max_code, s.bl_count);
}


/* ===========================================================================
 * Scan a literal or distance tree to determine the frequencies of the codes
 * in the bit length tree.
 */
function scan_tree(s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree;   /* the tree to be scanned */
//    int max_code;    /* and its largest code of non zero frequency */
{
  var n; /* iterates over all tree elements */
  var prevlen = -1; /* last emitted length */
  var curlen; /* length of current code */

  var nextlen = tree[0 * 2 + 1] /*.Len*/ ; /* length of next code */

  var count = 0; /* repeat count of the current code */
  var max_count = 7; /* max repeat count */
  var min_count = 4; /* min repeat count */

  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1] /*.Len*/ = 0xffff; /* guard */

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1] /*.Len*/ ;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      s.bl_tree[curlen * 2] /*.Freq*/ += count;

    } else if (curlen !== 0) {

      if (curlen !== prevlen) {
        s.bl_tree[curlen * 2] /*.Freq*/ ++;
      }
      s.bl_tree[REP_3_6 * 2] /*.Freq*/ ++;

    } else if (count <= 10) {
      s.bl_tree[REPZ_3_10 * 2] /*.Freq*/ ++;

    } else {
      s.bl_tree[REPZ_11_138 * 2] /*.Freq*/ ++;
    }

    count = 0;
    prevlen = curlen;

    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}


/* ===========================================================================
 * Send a literal or distance tree in compressed form, using the codes in
 * bl_tree.
 */
function send_tree(s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree; /* the tree to be scanned */
//    int max_code;       /* and its largest code of non zero frequency */
{
  var n; /* iterates over all tree elements */
  var prevlen = -1; /* last emitted length */
  var curlen; /* length of current code */

  var nextlen = tree[0 * 2 + 1] /*.Len*/ ; /* length of next code */

  var count = 0; /* repeat count of the current code */
  var max_count = 7; /* max repeat count */
  var min_count = 4; /* min repeat count */

  /* tree[max_code+1].Len = -1; */
  /* guard already set */
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1] /*.Len*/ ;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      do {
        send_code(s, curlen, s.bl_tree);
      } while (--count !== 0);

    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s, curlen, s.bl_tree);
        count--;
      }
      //Assert(count >= 3 && count <= 6, " 3_6?");
      send_code(s, REP_3_6, s.bl_tree);
      send_bits(s, count - 3, 2);

    } else if (count <= 10) {
      send_code(s, REPZ_3_10, s.bl_tree);
      send_bits(s, count - 3, 3);

    } else {
      send_code(s, REPZ_11_138, s.bl_tree);
      send_bits(s, count - 11, 7);
    }

    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}


/* ===========================================================================
 * Construct the Huffman tree for the bit lengths and return the index in
 * bl_order of the last bit length code to send.
 */
function build_bl_tree(s) {
  var max_blindex; /* index of last bit length code of non zero freq */

  /* Determine the bit length frequencies for literal and distance trees */
  scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
  scan_tree(s, s.dyn_dtree, s.d_desc.max_code);

  /* Build the bit length tree: */
  build_tree(s, s.bl_desc);
  /* opt_len now includes the length of the tree representations, except
   * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
   */

  /* Determine the number of bit length codes to send. The pkzip format
   * requires that at least 4 bit length codes be sent. (appnote.txt says
   * 3 but the actual value used is 4.)
   */
  for (max_blindex = BL_CODES$1 - 1; max_blindex >= 3; max_blindex--) {
    if (s.bl_tree[bl_order[max_blindex] * 2 + 1] /*.Len*/ !== 0) {
      break;
    }
  }
  /* Update opt_len to include the bit length tree and counts */
  s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  //Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
  //        s->opt_len, s->static_len));

  return max_blindex;
}


/* ===========================================================================
 * Send the header for a block using dynamic Huffman trees: the counts, the
 * lengths of the bit length codes, the literal tree and the distance tree.
 * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
 */
function send_all_trees(s, lcodes, dcodes, blcodes)
//    deflate_state *s;
//    int lcodes, dcodes, blcodes; /* number of codes for each tree */
{
  var rank; /* index in bl_order */

  //Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
  //Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
  //        "too many codes");
  //Tracev((stderr, "\nbl counts: "));
  send_bits(s, lcodes - 257, 5); /* not +255 as stated in appnote.txt */
  send_bits(s, dcodes - 1, 5);
  send_bits(s, blcodes - 4, 4); /* not -3 as stated in appnote.txt */
  for (rank = 0; rank < blcodes; rank++) {
    //Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
    send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1] /*.Len*/ , 3);
  }
  //Tracev((stderr, "\nbl tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_ltree, lcodes - 1); /* literal tree */
  //Tracev((stderr, "\nlit tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_dtree, dcodes - 1); /* distance tree */
  //Tracev((stderr, "\ndist tree: sent %ld", s->bits_sent));
}


/* ===========================================================================
 * Check if the data type is TEXT or BINARY, using the following algorithm:
 * - TEXT if the two conditions below are satisfied:
 *    a) There are no non-portable control characters belonging to the
 *       "black list" (0..6, 14..25, 28..31).
 *    b) There is at least one printable character belonging to the
 *       "white list" (9 {TAB}, 10 {LF}, 13 {CR}, 32..255).
 * - BINARY otherwise.
 * - The following partially-portable control characters form a
 *   "gray list" that is ignored in this detection algorithm:
 *   (7 {BEL}, 8 {BS}, 11 {VT}, 12 {FF}, 26 {SUB}, 27 {ESC}).
 * IN assertion: the fields Freq of dyn_ltree are set.
 */
function detect_data_type(s) {
  /* black_mask is the bit mask of black-listed bytes
   * set bits 0..6, 14..25, and 28..31
   * 0xf3ffc07f = binary 11110011111111111100000001111111
   */
  var black_mask = 0xf3ffc07f;
  var n;

  /* Check for non-textual ("black-listed") bytes. */
  for (n = 0; n <= 31; n++, black_mask >>>= 1) {
    if ((black_mask & 1) && (s.dyn_ltree[n * 2] /*.Freq*/ !== 0)) {
      return Z_BINARY$1;
    }
  }

  /* Check for textual ("white-listed") bytes. */
  if (s.dyn_ltree[9 * 2] /*.Freq*/ !== 0 || s.dyn_ltree[10 * 2] /*.Freq*/ !== 0 ||
    s.dyn_ltree[13 * 2] /*.Freq*/ !== 0) {
    return Z_TEXT$1;
  }
  for (n = 32; n < LITERALS$1; n++) {
    if (s.dyn_ltree[n * 2] /*.Freq*/ !== 0) {
      return Z_TEXT$1;
    }
  }

  /* There are no "black-listed" or "white-listed" bytes:
   * this stream either is empty or has tolerated ("gray-listed") bytes only.
   */
  return Z_BINARY$1;
}


var static_init_done = false;

/* ===========================================================================
 * Initialize the tree data structures for a new zlib stream.
 */
function _tr_init(s) {

  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }

  s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
  s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
  s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);

  s.bi_buf = 0;
  s.bi_valid = 0;

  /* Initialize the first block of the first file: */
  init_block(s);
}


/* ===========================================================================
 * Send a stored block
 */
function _tr_stored_block(s, buf, stored_len, last)
//DeflateState *s;
//charf *buf;       /* input block */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3); /* send block type */
  copy_block(s, buf, stored_len); /* with header */
}


/* ===========================================================================
 * Send one empty static block to give enough lookahead for inflate.
 * This takes 10 bits, of which 7 may remain in the bit buffer.
 */
function _tr_align(s) {
  send_bits(s, STATIC_TREES << 1, 3);
  send_code(s, END_BLOCK, static_ltree);
  bi_flush(s);
}


/* ===========================================================================
 * Determine the best encoding for the current block: dynamic trees, static
 * trees or store, and output the encoded block to the zip file.
 */
function _tr_flush_block(s, buf, stored_len, last)
//DeflateState *s;
//charf *buf;       /* input block, or NULL if too old */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  var opt_lenb, static_lenb; /* opt_len and static_len in bytes */
  var max_blindex = 0; /* index of last bit length code of non zero freq */

  /* Build the Huffman trees unless a stored block is forced */
  if (s.level > 0) {

    /* Check if the file is binary or text */
    if (s.strm.data_type === Z_UNKNOWN$2) {
      s.strm.data_type = detect_data_type(s);
    }

    /* Construct the literal and distance trees */
    build_tree(s, s.l_desc);
    // Tracev((stderr, "\nlit data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));

    build_tree(s, s.d_desc);
    // Tracev((stderr, "\ndist data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));
    /* At this point, opt_len and static_len are the total bit lengths of
     * the compressed block data, excluding the tree representations.
     */

    /* Build the bit length tree for the above two trees, and get the index
     * in bl_order of the last bit length code to send.
     */
    max_blindex = build_bl_tree(s);

    /* Determine the best encoding. Compute the block lengths in bytes. */
    opt_lenb = (s.opt_len + 3 + 7) >>> 3;
    static_lenb = (s.static_len + 3 + 7) >>> 3;

    // Tracev((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u ",
    //        opt_lenb, s->opt_len, static_lenb, s->static_len, stored_len,
    //        s->last_lit));

    if (static_lenb <= opt_lenb) {
      opt_lenb = static_lenb;
    }

  } else {
    // Assert(buf != (char*)0, "lost buf");
    opt_lenb = static_lenb = stored_len + 5; /* force a stored block */
  }

  if ((stored_len + 4 <= opt_lenb) && (buf !== -1)) {
    /* 4: two words for the lengths */

    /* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
     * Otherwise we can't have processed more than WSIZE input bytes since
     * the last block flush, because compression would have been
     * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
     * transform a block into a stored block.
     */
    _tr_stored_block(s, buf, stored_len, last);

  } else if (s.strategy === Z_FIXED$2 || static_lenb === opt_lenb) {

    send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s, static_ltree, static_dtree);

  } else {
    send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s, s.dyn_ltree, s.dyn_dtree);
  }
  // Assert (s->compressed_len == s->bits_sent, "bad compressed size");
  /* The above check is made mod 2^32, for files larger than 512 MB
   * and uLong implemented on 32 bits.
   */
  init_block(s);

  if (last) {
    bi_windup(s);
  }
  // Tracev((stderr,"\ncomprlen %lu(%lu) ", s->compressed_len>>3,
  //       s->compressed_len-7*last));
}

/* ===========================================================================
 * Save the match info and tally the frequency counts. Return true if
 * the current block must be flushed.
 */
function _tr_tally(s, dist, lc)
//    deflate_state *s;
//    unsigned dist;  /* distance of matched string */
//    unsigned lc;    /* match length-MIN_MATCH or unmatched char (if dist==0) */
{
  //var out_length, in_length, dcode;

  s.pending_buf[s.d_buf + s.last_lit * 2] = (dist >>> 8) & 0xff;
  s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 0xff;

  s.pending_buf[s.l_buf + s.last_lit] = lc & 0xff;
  s.last_lit++;

  if (dist === 0) {
    /* lc is the unmatched char */
    s.dyn_ltree[lc * 2] /*.Freq*/ ++;
  } else {
    s.matches++;
    /* Here, lc is the match length - MIN_MATCH */
    dist--; /* dist = match distance - 1 */
    //Assert((ush)dist < (ush)MAX_DIST(s) &&
    //       (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
    //       (ush)d_code(dist) < (ush)D_CODES,  "_tr_tally: bad match");

    s.dyn_ltree[(_length_code[lc] + LITERALS$1 + 1) * 2] /*.Freq*/ ++;
    s.dyn_dtree[d_code(dist) * 2] /*.Freq*/ ++;
  }

  // (!) This block is disabled in zlib defailts,
  // don't enable it for binary compatibility

  //#ifdef TRUNCATE_BLOCK
  //  /* Try to guess if it is profitable to stop the current block here */
  //  if ((s.last_lit & 0x1fff) === 0 && s.level > 2) {
  //    /* Compute an upper bound for the compressed length */
  //    out_length = s.last_lit*8;
  //    in_length = s.strstart - s.block_start;
  //
  //    for (dcode = 0; dcode < D_CODES; dcode++) {
  //      out_length += s.dyn_dtree[dcode*2]/*.Freq*/ * (5 + extra_dbits[dcode]);
  //    }
  //    out_length >>>= 3;
  //    //Tracev((stderr,"\nlast_lit %u, in %ld, out ~%ld(%ld%%) ",
  //    //       s->last_lit, in_length, out_length,
  //    //       100L - out_length*100L/in_length));
  //    if (s.matches < (s.last_lit>>1)/*int /2*/ && out_length < (in_length>>1)/*int /2*/) {
  //      return true;
  //    }
  //  }
  //#endif

  return (s.last_lit === s.lit_bufsize - 1);
  /* We avoid equality with lit_bufsize because of wraparound at 64K
   * on 16 bit machines and because stored blocks are restricted to
   * 64K-1 bytes.
   */
}

// Note: adler32 takes 12% for level 0 and 2% for level 6.
// It doesn't worth to make additional optimizationa as in original.
// Small size is preferable.

function adler32(adler, buf, len, pos) {
  var s1 = (adler & 0xffff) |0,
      s2 = ((adler >>> 16) & 0xffff) |0,
      n = 0;

  while (len !== 0) {
    // Set limit ~ twice less than 5552, to keep
    // s2 in 31-bits, because we force signed ints.
    // in other case %= will fail.
    n = len > 2000 ? 2000 : len;
    len -= n;

    do {
      s1 = (s1 + buf[pos++]) |0;
      s2 = (s2 + s1) |0;
    } while (--n);

    s1 %= 65521;
    s2 %= 65521;
  }

  return (s1 | (s2 << 16)) |0;
}

// Note: we can't get significant speed boost here.
// So write code to minimize size - no pregenerated tables
// and array tools dependencies.


// Use ordinary array, since untyped makes no boost here
function makeTable() {
  var c, table = [];

  for (var n = 0; n < 256; n++) {
    c = n;
    for (var k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }

  return table;
}

// Create table on load. Just 255 signed longs. Not a problem.
var crcTable = makeTable();


function crc32(crc, buf, len, pos) {
  var t = crcTable,
      end = pos + len;

  crc ^= -1;

  for (var i = pos; i < end; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xFF];
  }

  return (crc ^ (-1)); // >>> 0;
}

/* Public constants ==========================================================*/
/* ===========================================================================*/


/* Allowed flush values; see deflate() and inflate() below for details */
var Z_NO_FLUSH$1 = 0;
var Z_PARTIAL_FLUSH$1 = 1;
//var Z_SYNC_FLUSH    = 2;
var Z_FULL_FLUSH$1 = 3;
var Z_FINISH$2 = 4;
var Z_BLOCK$2 = 5;
//var Z_TREES         = 6;


/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
var Z_OK$2 = 0;
var Z_STREAM_END$2 = 1;
//var Z_NEED_DICT     = 2;
//var Z_ERRNO         = -1;
var Z_STREAM_ERROR$2 = -2;
var Z_DATA_ERROR$2 = -3;
//var Z_MEM_ERROR     = -4;
var Z_BUF_ERROR$2 = -5;
//var Z_VERSION_ERROR = -6;


/* compression levels */
//var Z_NO_COMPRESSION      = 0;
//var Z_BEST_SPEED          = 1;
//var Z_BEST_COMPRESSION    = 9;
var Z_DEFAULT_COMPRESSION$1 = -1;


var Z_FILTERED$1 = 1;
var Z_HUFFMAN_ONLY$1 = 2;
var Z_RLE$1 = 3;
var Z_FIXED$1 = 4;

/* Possible values of the data_type field (though see inflate()) */
//var Z_BINARY              = 0;
//var Z_TEXT                = 1;
//var Z_ASCII               = 1; // = Z_TEXT
var Z_UNKNOWN$1 = 2;


/* The deflate compression method */
var Z_DEFLATED$2 = 8;

/*============================================================================*/


var MAX_MEM_LEVEL = 9;


var LENGTH_CODES = 29;
/* number of length codes, not counting the special END_BLOCK code */
var LITERALS = 256;
/* number of literal bytes 0..255 */
var L_CODES = LITERALS + 1 + LENGTH_CODES;
/* number of Literal or Length codes, including the END_BLOCK code */
var D_CODES = 30;
/* number of distance codes */
var BL_CODES = 19;
/* number of codes used to transfer the bit lengths */
var HEAP_SIZE = 2 * L_CODES + 1;
/* maximum heap size */
var MAX_BITS = 15;
/* All codes must not exceed MAX_BITS bits */

var MIN_MATCH = 3;
var MAX_MATCH = 258;
var MIN_LOOKAHEAD = (MAX_MATCH + MIN_MATCH + 1);

var PRESET_DICT = 0x20;

var INIT_STATE = 42;
var EXTRA_STATE = 69;
var NAME_STATE = 73;
var COMMENT_STATE = 91;
var HCRC_STATE = 103;
var BUSY_STATE = 113;
var FINISH_STATE = 666;

var BS_NEED_MORE = 1; /* block not completed, need more input or more output */
var BS_BLOCK_DONE = 2; /* block flush performed */
var BS_FINISH_STARTED = 3; /* finish started, need only more output at next deflate */
var BS_FINISH_DONE = 4; /* finish done, accept no more input or output */

var OS_CODE = 0x03; // Unix :) . Don't detect, use this default.

function err(strm, errorCode) {
  strm.msg = msg[errorCode];
  return errorCode;
}

function rank(f) {
  return ((f) << 1) - ((f) > 4 ? 9 : 0);
}

function zero(buf) {
  var len = buf.length;
  while (--len >= 0) {
    buf[len] = 0;
  }
}


/* =========================================================================
 * Flush as much pending output as possible. All deflate() output goes
 * through this function so some applications may wish to modify it
 * to avoid allocating a large strm->output buffer and copying into it.
 * (See also read_buf()).
 */
function flush_pending(strm) {
  var s = strm.state;

  //_tr_flush_bits(s);
  var len = s.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) {
    return;
  }

  arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
  strm.next_out += len;
  s.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s.pending -= len;
  if (s.pending === 0) {
    s.pending_out = 0;
  }
}


function flush_block_only(s, last) {
  _tr_flush_block(s, (s.block_start >= 0 ? s.block_start : -1), s.strstart - s.block_start, last);
  s.block_start = s.strstart;
  flush_pending(s.strm);
}


function put_byte(s, b) {
  s.pending_buf[s.pending++] = b;
}


/* =========================================================================
 * Put a short in the pending buffer. The 16-bit value is put in MSB order.
 * IN assertion: the stream state is correct and there is enough room in
 * pending_buf.
 */
function putShortMSB(s, b) {
  //  put_byte(s, (Byte)(b >> 8));
  //  put_byte(s, (Byte)(b & 0xff));
  s.pending_buf[s.pending++] = (b >>> 8) & 0xff;
  s.pending_buf[s.pending++] = b & 0xff;
}


/* ===========================================================================
 * Read a new buffer from the current input stream, update the adler32
 * and total number of bytes read.  All deflate() input goes through
 * this function so some applications may wish to modify it to avoid
 * allocating a large strm->input buffer and copying from it.
 * (See also flush_pending()).
 */
function read_buf(strm, buf, start, size) {
  var len = strm.avail_in;

  if (len > size) {
    len = size;
  }
  if (len === 0) {
    return 0;
  }

  strm.avail_in -= len;

  // zmemcpy(buf, strm->next_in, len);
  arraySet(buf, strm.input, strm.next_in, len, start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32(strm.adler, buf, len, start);
  } else if (strm.state.wrap === 2) {
    strm.adler = crc32(strm.adler, buf, len, start);
  }

  strm.next_in += len;
  strm.total_in += len;

  return len;
}


/* ===========================================================================
 * Set match_start to the longest match starting at the given string and
 * return its length. Matches shorter or equal to prev_length are discarded,
 * in which case the result is equal to prev_length and match_start is
 * garbage.
 * IN assertions: cur_match is the head of the hash chain for the current
 *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
 * OUT assertion: the match length is not greater than s->lookahead.
 */
function longest_match(s, cur_match) {
  var chain_length = s.max_chain_length; /* max hash chain length */
  var scan = s.strstart; /* current string */
  var match; /* matched string */
  var len; /* length of current match */
  var best_len = s.prev_length; /* best match length so far */
  var nice_match = s.nice_match; /* stop if match long enough */
  var limit = (s.strstart > (s.w_size - MIN_LOOKAHEAD)) ?
    s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0 /*NIL*/ ;

  var _win = s.window; // shortcut

  var wmask = s.w_mask;
  var prev = s.prev;

  /* Stop when cur_match becomes <= limit. To simplify the code,
   * we prevent matches with the string of window index 0.
   */

  var strend = s.strstart + MAX_MATCH;
  var scan_end1 = _win[scan + best_len - 1];
  var scan_end = _win[scan + best_len];

  /* The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of 16.
   * It is easy to get rid of this optimization if necessary.
   */
  // Assert(s->hash_bits >= 8 && MAX_MATCH == 258, "Code too clever");

  /* Do not waste too much time if we already have a good match: */
  if (s.prev_length >= s.good_match) {
    chain_length >>= 2;
  }
  /* Do not look for matches beyond the end of the input. This is necessary
   * to make deflate deterministic.
   */
  if (nice_match > s.lookahead) {
    nice_match = s.lookahead;
  }

  // Assert((ulg)s->strstart <= s->window_size-MIN_LOOKAHEAD, "need lookahead");

  do {
    // Assert(cur_match < s->strstart, "no future");
    match = cur_match;

    /* Skip to next match if the match length cannot increase
     * or if the match length is less than 2.  Note that the checks below
     * for insufficient lookahead only occur occasionally for performance
     * reasons.  Therefore uninitialized memory will be accessed, and
     * conditional jumps will be made that depend on those values.
     * However the length of the match is limited to the lookahead, so
     * the output of deflate is not affected by the uninitialized values.
     */

    if (_win[match + best_len] !== scan_end ||
      _win[match + best_len - 1] !== scan_end1 ||
      _win[match] !== _win[scan] ||
      _win[++match] !== _win[scan + 1]) {
      continue;
    }

    /* The check at best_len-1 can be removed because it will be made
     * again later. (This heuristic is not always a win.)
     * It is not necessary to compare scan[2] and match[2] since they
     * are always equal when the other bytes match, given that
     * the hash keys are equal and that HASH_BITS >= 8.
     */
    scan += 2;
    match++;
    // Assert(*scan == *match, "match[2]?");

    /* We check for insufficient lookahead only every 8th comparison;
     * the 256th check will be made at strstart+258.
     */
    do {
      /*jshint noempty:false*/
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
      _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
      _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
      _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
      scan < strend);

    // Assert(scan <= s->window+(unsigned)(s->window_size-1), "wild scan");

    len = MAX_MATCH - (strend - scan);
    scan = strend - MAX_MATCH;

    if (len > best_len) {
      s.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1 = _win[scan + best_len - 1];
      scan_end = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);

  if (best_len <= s.lookahead) {
    return best_len;
  }
  return s.lookahead;
}


/* ===========================================================================
 * Fill the window when the lookahead becomes insufficient.
 * Updates strstart and lookahead.
 *
 * IN assertion: lookahead < MIN_LOOKAHEAD
 * OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
 *    At least one byte has been read, or avail_in == 0; reads are
 *    performed for at least two bytes (required for the zip translate_eol
 *    option -- not supported here).
 */
function fill_window(s) {
  var _w_size = s.w_size;
  var p, n, m, more, str;

  //Assert(s->lookahead < MIN_LOOKAHEAD, "already enough lookahead");

  do {
    more = s.window_size - s.lookahead - s.strstart;

    // JS ints have 32 bit, block below not needed
    /* Deal with !@#$% 64K limit: */
    //if (sizeof(int) <= 2) {
    //    if (more == 0 && s->strstart == 0 && s->lookahead == 0) {
    //        more = wsize;
    //
    //  } else if (more == (unsigned)(-1)) {
    //        /* Very unlikely, but possible on 16 bit machine if
    //         * strstart == 0 && lookahead == 1 (input done a byte at time)
    //         */
    //        more--;
    //    }
    //}


    /* If the window is almost full and there is insufficient lookahead,
     * move the upper half to the lower one to make room in the upper half.
     */
    if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {

      arraySet(s.window, s.window, _w_size, _w_size, 0);
      s.match_start -= _w_size;
      s.strstart -= _w_size;
      /* we now have strstart >= MAX_DIST */
      s.block_start -= _w_size;

      /* Slide the hash table (could be avoided with 32 bit values
       at the expense of memory usage). We slide even when level == 0
       to keep the hash table consistent if we switch back to level > 0
       later. (Using level 0 permanently is not an optimal usage of
       zlib, so we don't care about this pathological case.)
       */

      n = s.hash_size;
      p = n;
      do {
        m = s.head[--p];
        s.head[p] = (m >= _w_size ? m - _w_size : 0);
      } while (--n);

      n = _w_size;
      p = n;
      do {
        m = s.prev[--p];
        s.prev[p] = (m >= _w_size ? m - _w_size : 0);
        /* If n is not on any hash chain, prev[n] is garbage but
         * its value will never be used.
         */
      } while (--n);

      more += _w_size;
    }
    if (s.strm.avail_in === 0) {
      break;
    }

    /* If there was no sliding:
     *    strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
     *    more == window_size - lookahead - strstart
     * => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
     * => more >= window_size - 2*WSIZE + 2
     * In the BIG_MEM or MMAP case (not yet supported),
     *   window_size == input_size + MIN_LOOKAHEAD  &&
     *   strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
     * Otherwise, window_size == 2*WSIZE so more >= 2.
     * If there was sliding, more >= WSIZE. So in all cases, more >= 2.
     */
    //Assert(more >= 2, "more < 2");
    n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
    s.lookahead += n;

    /* Initialize the hash value now that we have some input: */
    if (s.lookahead + s.insert >= MIN_MATCH) {
      str = s.strstart - s.insert;
      s.ins_h = s.window[str];

      /* UPDATE_HASH(s, s->ins_h, s->window[str + 1]); */
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[str + 1]) & s.hash_mask;
      //#if MIN_MATCH != 3
      //        Call update_hash() MIN_MATCH-3 more times
      //#endif
      while (s.insert) {
        /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
        s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;

        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
        s.insert--;
        if (s.lookahead + s.insert < MIN_MATCH) {
          break;
        }
      }
    }
    /* If the whole input has less than MIN_MATCH bytes, ins_h is garbage,
     * but this is not important since only literal bytes will be emitted.
     */

  } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);

  /* If the WIN_INIT bytes after the end of the current data have never been
   * written, then zero those bytes in order to avoid memory check reports of
   * the use of uninitialized (or uninitialised as Julian writes) bytes by
   * the longest match routines.  Update the high water mark for the next
   * time through here.  WIN_INIT is set to MAX_MATCH since the longest match
   * routines allow scanning to strstart + MAX_MATCH, ignoring lookahead.
   */
  //  if (s.high_water < s.window_size) {
  //    var curr = s.strstart + s.lookahead;
  //    var init = 0;
  //
  //    if (s.high_water < curr) {
  //      /* Previous high water mark below current data -- zero WIN_INIT
  //       * bytes or up to end of window, whichever is less.
  //       */
  //      init = s.window_size - curr;
  //      if (init > WIN_INIT)
  //        init = WIN_INIT;
  //      zmemzero(s->window + curr, (unsigned)init);
  //      s->high_water = curr + init;
  //    }
  //    else if (s->high_water < (ulg)curr + WIN_INIT) {
  //      /* High water mark at or above current data, but below current data
  //       * plus WIN_INIT -- zero out to current data plus WIN_INIT, or up
  //       * to end of window, whichever is less.
  //       */
  //      init = (ulg)curr + WIN_INIT - s->high_water;
  //      if (init > s->window_size - s->high_water)
  //        init = s->window_size - s->high_water;
  //      zmemzero(s->window + s->high_water, (unsigned)init);
  //      s->high_water += init;
  //    }
  //  }
  //
  //  Assert((ulg)s->strstart <= s->window_size - MIN_LOOKAHEAD,
  //    "not enough room for search");
}

/* ===========================================================================
 * Copy without compression as much as possible from the input stream, return
 * the current block state.
 * This function does not insert new strings in the dictionary since
 * uncompressible data is probably not useful. This function is used
 * only for the level=0 compression option.
 * NOTE: this function should be optimized to avoid extra copying from
 * window to pending_buf.
 */
function deflate_stored(s, flush) {
  /* Stored blocks are limited to 0xffff bytes, pending_buf is limited
   * to pending_buf_size, and each stored block has a 5 byte header:
   */
  var max_block_size = 0xffff;

  if (max_block_size > s.pending_buf_size - 5) {
    max_block_size = s.pending_buf_size - 5;
  }

  /* Copy as much as possible from input to output: */
  for (;;) {
    /* Fill the window as much as possible: */
    if (s.lookahead <= 1) {

      //Assert(s->strstart < s->w_size+MAX_DIST(s) ||
      //  s->block_start >= (long)s->w_size, "slide too late");
      //      if (!(s.strstart < s.w_size + (s.w_size - MIN_LOOKAHEAD) ||
      //        s.block_start >= s.w_size)) {
      //        throw  new Error("slide too late");
      //      }

      fill_window(s);
      if (s.lookahead === 0 && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }

      if (s.lookahead === 0) {
        break;
      }
      /* flush the current block */
    }
    //Assert(s->block_start >= 0L, "block gone");
    //    if (s.block_start < 0) throw new Error("block gone");

    s.strstart += s.lookahead;
    s.lookahead = 0;

    /* Emit a stored block if pending_buf will be full: */
    var max_start = s.block_start + max_block_size;

    if (s.strstart === 0 || s.strstart >= max_start) {
      /* strstart == 0 is possible when wraparound on 16-bit machine */
      s.lookahead = s.strstart - max_start;
      s.strstart = max_start;
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/


    }
    /* Flush if we may have to slide, otherwise block_start may become
     * negative and the data will be gone:
     */
    if (s.strstart - s.block_start >= (s.w_size - MIN_LOOKAHEAD)) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }

  s.insert = 0;

  if (flush === Z_FINISH$2) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }

  if (s.strstart > s.block_start) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_NEED_MORE;
}

/* ===========================================================================
 * Compress as much as possible from the input stream, return the current
 * block state.
 * This function does not perform lazy evaluation of matches and inserts
 * new strings in the dictionary only for unmatched strings or for short
 * matches. It is used only for the fast compression options.
 */
function deflate_fast(s, flush) {
  var hash_head; /* head of the hash chain */
  var bflush; /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break; /* flush the current block */
      }
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0 /*NIL*/ ;
    if (s.lookahead >= MIN_MATCH) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     * At this point we have always match_length < MIN_MATCH
     */
    if (hash_head !== 0 /*NIL*/ && ((s.strstart - hash_head) <= (s.w_size - MIN_LOOKAHEAD))) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */
    }
    if (s.match_length >= MIN_MATCH) {
      // check_match(s, s.strstart, s.match_start, s.match_length); // for debug only

      /*** _tr_tally_dist(s, s.strstart - s.match_start,
                     s.match_length - MIN_MATCH, bflush); ***/
      bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);

      s.lookahead -= s.match_length;

      /* Insert new strings in the hash table only if the match length
       * is not too large. This saves time but degrades compression.
       */
      if (s.match_length <= s.max_lazy_match /*max_insert_length*/ && s.lookahead >= MIN_MATCH) {
        s.match_length--; /* string at strstart already in table */
        do {
          s.strstart++;
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
          /* strstart never exceeds WSIZE-MAX_MATCH, so there are
           * always MIN_MATCH bytes ahead.
           */
        } while (--s.match_length !== 0);
        s.strstart++;
      } else {
        s.strstart += s.match_length;
        s.match_length = 0;
        s.ins_h = s.window[s.strstart];
        /* UPDATE_HASH(s, s.ins_h, s.window[s.strstart+1]); */
        s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + 1]) & s.hash_mask;

        //#if MIN_MATCH != 3
        //                Call UPDATE_HASH() MIN_MATCH-3 more times
        //#endif
        /* If lookahead < MIN_MATCH, ins_h is garbage, but it does not
         * matter since it will be recomputed at next deflate call.
         */
      }
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s.window[s.strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = ((s.strstart < (MIN_MATCH - 1)) ? s.strstart : MIN_MATCH - 1);
  if (flush === Z_FINISH$2) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* ===========================================================================
 * Same as above, but achieves better compression. We use a lazy
 * evaluation for matches: a match is finally adopted only if there is
 * no better match at the next window position.
 */
function deflate_slow(s, flush) {
  var hash_head; /* head of hash chain */
  var bflush; /* set if current block must be flushed */

  var max_insert;

  /* Process the input block. */
  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      } /* flush the current block */
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0 /*NIL*/ ;
    if (s.lookahead >= MIN_MATCH) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     */
    s.prev_length = s.match_length;
    s.prev_match = s.match_start;
    s.match_length = MIN_MATCH - 1;

    if (hash_head !== 0 /*NIL*/ && s.prev_length < s.max_lazy_match &&
      s.strstart - hash_head <= (s.w_size - MIN_LOOKAHEAD) /*MAX_DIST(s)*/ ) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */

      if (s.match_length <= 5 &&
        (s.strategy === Z_FILTERED$1 || (s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096 /*TOO_FAR*/ ))) {

        /* If prev_match is also MIN_MATCH, match_start is garbage
         * but we will ignore the current match anyway.
         */
        s.match_length = MIN_MATCH - 1;
      }
    }
    /* If there was a match at the previous step and the current
     * match is not better, output the previous match:
     */
    if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
      max_insert = s.strstart + s.lookahead - MIN_MATCH;
      /* Do not insert strings in hash table beyond this. */

      //check_match(s, s.strstart-1, s.prev_match, s.prev_length);

      /***_tr_tally_dist(s, s.strstart - 1 - s.prev_match,
                     s.prev_length - MIN_MATCH, bflush);***/
      bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
      /* Insert in hash table all strings up to the end of the match.
       * strstart-1 and strstart are already inserted. If there is not
       * enough lookahead, the last two strings are not inserted in
       * the hash table.
       */
      s.lookahead -= s.prev_length - 1;
      s.prev_length -= 2;
      do {
        if (++s.strstart <= max_insert) {
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
        }
      } while (--s.prev_length !== 0);
      s.match_available = 0;
      s.match_length = MIN_MATCH - 1;
      s.strstart++;

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/
      }

    } else if (s.match_available) {
      /* If there was no match at the previous position, output a
       * single literal. If there was a match but the current match
       * is longer, truncate the previous match to a single literal.
       */
      //Tracevv((stderr,"%c", s->window[s->strstart-1]));
      /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);

      if (bflush) {
        /*** FLUSH_BLOCK_ONLY(s, 0) ***/
        flush_block_only(s, false);
        /***/
      }
      s.strstart++;
      s.lookahead--;
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      /* There is no previous match to compare with, wait for
       * the next step to decide.
       */
      s.match_available = 1;
      s.strstart++;
      s.lookahead--;
    }
  }
  //Assert (flush != Z_NO_FLUSH, "no flush?");
  if (s.match_available) {
    //Tracevv((stderr,"%c", s->window[s->strstart-1]));
    /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
    bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);

    s.match_available = 0;
  }
  s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH$2) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_BLOCK_DONE;
}


/* ===========================================================================
 * For Z_RLE, simply look for runs of bytes, generate matches only of distance
 * one.  Do not maintain a hash table.  (It will be regenerated if this run of
 * deflate switches away from Z_RLE.)
 */
function deflate_rle(s, flush) {
  var bflush; /* set if current block must be flushed */
  var prev; /* byte at distance one to match */
  var scan, strend; /* scan goes up to strend for length of run */

  var _win = s.window;

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the longest run, plus one for the unrolled loop.
     */
    if (s.lookahead <= MAX_MATCH) {
      fill_window(s);
      if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH$1) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break;
      } /* flush the current block */
    }

    /* See how many times the previous byte repeats */
    s.match_length = 0;
    if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
      scan = s.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s.strstart + MAX_MATCH;
        do {
          /*jshint noempty:false*/
        } while (prev === _win[++scan] && prev === _win[++scan] &&
          prev === _win[++scan] && prev === _win[++scan] &&
          prev === _win[++scan] && prev === _win[++scan] &&
          prev === _win[++scan] && prev === _win[++scan] &&
          scan < strend);
        s.match_length = MAX_MATCH - (strend - scan);
        if (s.match_length > s.lookahead) {
          s.match_length = s.lookahead;
        }
      }
      //Assert(scan <= s->window+(uInt)(s->window_size-1), "wild scan");
    }

    /* Emit match if have run of MIN_MATCH or longer, else emit literal */
    if (s.match_length >= MIN_MATCH) {
      //check_match(s, s.strstart, s.strstart - 1, s.match_length);

      /*** _tr_tally_dist(s, 1, s.match_length - MIN_MATCH, bflush); ***/
      bflush = _tr_tally(s, 1, s.match_length - MIN_MATCH);

      s.lookahead -= s.match_length;
      s.strstart += s.match_length;
      s.match_length = 0;
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s->window[s->strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = _tr_tally(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH$2) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* ===========================================================================
 * For Z_HUFFMAN_ONLY, do not look for matches.  Do not maintain a hash table.
 * (It will be regenerated if this run of deflate switches away from Huffman.)
 */
function deflate_huff(s, flush) {
  var bflush; /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we have a literal to write. */
    if (s.lookahead === 0) {
      fill_window(s);
      if (s.lookahead === 0) {
        if (flush === Z_NO_FLUSH$1) {
          return BS_NEED_MORE;
        }
        break; /* flush the current block */
      }
    }

    /* Output a literal byte */
    s.match_length = 0;
    //Tracevv((stderr,"%c", s->window[s->strstart]));
    /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
    bflush = _tr_tally(s, 0, s.window[s.strstart]);
    s.lookahead--;
    s.strstart++;
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH$2) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* Values for max_lazy_match, good_match and max_chain_length, depending on
 * the desired pack level (0..9). The values given below have been tuned to
 * exclude worst case performance for pathological files. Better values may be
 * found for specific files.
 */
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}

var configuration_table;

configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored), /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast), /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast), /* 2 */
  new Config(4, 6, 32, 32, deflate_fast), /* 3 */

  new Config(4, 4, 16, 16, deflate_slow), /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow), /* 5 */
  new Config(8, 16, 128, 128, deflate_slow), /* 6 */
  new Config(8, 32, 128, 256, deflate_slow), /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow), /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow) /* 9 max compression */
];


/* ===========================================================================
 * Initialize the "longest match" routines for a new zlib stream
 */
function lm_init(s) {
  s.window_size = 2 * s.w_size;

  /*** CLEAR_HASH(s); ***/
  zero(s.head); // Fill with NIL (= 0);

  /* Set the default configuration parameters:
   */
  s.max_lazy_match = configuration_table[s.level].max_lazy;
  s.good_match = configuration_table[s.level].good_length;
  s.nice_match = configuration_table[s.level].nice_length;
  s.max_chain_length = configuration_table[s.level].max_chain;

  s.strstart = 0;
  s.block_start = 0;
  s.lookahead = 0;
  s.insert = 0;
  s.match_length = s.prev_length = MIN_MATCH - 1;
  s.match_available = 0;
  s.ins_h = 0;
}


function DeflateState() {
  this.strm = null; /* pointer back to this zlib stream */
  this.status = 0; /* as the name implies */
  this.pending_buf = null; /* output still pending */
  this.pending_buf_size = 0; /* size of pending_buf */
  this.pending_out = 0; /* next pending byte to output to the stream */
  this.pending = 0; /* nb of bytes in the pending buffer */
  this.wrap = 0; /* bit 0 true for zlib, bit 1 true for gzip */
  this.gzhead = null; /* gzip header information to write */
  this.gzindex = 0; /* where in extra, name, or comment */
  this.method = Z_DEFLATED$2; /* can only be DEFLATED */
  this.last_flush = -1; /* value of flush param for previous deflate call */

  this.w_size = 0; /* LZ77 window size (32K by default) */
  this.w_bits = 0; /* log2(w_size)  (8..16) */
  this.w_mask = 0; /* w_size - 1 */

  this.window = null;
  /* Sliding window. Input bytes are read into the second half of the window,
   * and move to the first half later to keep a dictionary of at least wSize
   * bytes. With this organization, matches are limited to a distance of
   * wSize-MAX_MATCH bytes, but this ensures that IO is always
   * performed with a length multiple of the block size.
   */

  this.window_size = 0;
  /* Actual size of window: 2*wSize, except when the user input buffer
   * is directly used as sliding window.
   */

  this.prev = null;
  /* Link to older string with same hash index. To limit the size of this
   * array to 64K, this link is maintained only for the last 32K strings.
   * An index in this array is thus a window index modulo 32K.
   */

  this.head = null; /* Heads of the hash chains or NIL. */

  this.ins_h = 0; /* hash index of string to be inserted */
  this.hash_size = 0; /* number of elements in hash table */
  this.hash_bits = 0; /* log2(hash_size) */
  this.hash_mask = 0; /* hash_size-1 */

  this.hash_shift = 0;
  /* Number of bits by which ins_h must be shifted at each input
   * step. It must be such that after MIN_MATCH steps, the oldest
   * byte no longer takes part in the hash key, that is:
   *   hash_shift * MIN_MATCH >= hash_bits
   */

  this.block_start = 0;
  /* Window position at the beginning of the current output block. Gets
   * negative when the window is moved backwards.
   */

  this.match_length = 0; /* length of best match */
  this.prev_match = 0; /* previous match */
  this.match_available = 0; /* set if previous match exists */
  this.strstart = 0; /* start of string to insert */
  this.match_start = 0; /* start of matching string */
  this.lookahead = 0; /* number of valid bytes ahead in window */

  this.prev_length = 0;
  /* Length of the best match at previous step. Matches not greater than this
   * are discarded. This is used in the lazy match evaluation.
   */

  this.max_chain_length = 0;
  /* To speed up deflation, hash chains are never searched beyond this
   * length.  A higher limit improves compression ratio but degrades the
   * speed.
   */

  this.max_lazy_match = 0;
  /* Attempt to find a better match only when the current match is strictly
   * smaller than this value. This mechanism is used only for compression
   * levels >= 4.
   */
  // That's alias to max_lazy_match, don't use directly
  //this.max_insert_length = 0;
  /* Insert new strings in the hash table only if the match length is not
   * greater than this length. This saves time but degrades compression.
   * max_insert_length is used only for compression levels <= 3.
   */

  this.level = 0; /* compression level (1..9) */
  this.strategy = 0; /* favor or force Huffman coding*/

  this.good_match = 0;
  /* Use a faster search when the previous match is longer than this */

  this.nice_match = 0; /* Stop searching when current match exceeds this */

  /* used by c: */

  /* Didn't use ct_data typedef below to suppress compiler warning */

  // struct ct_data_s dyn_ltree[HEAP_SIZE];   /* literal and length tree */
  // struct ct_data_s dyn_dtree[2*D_CODES+1]; /* distance tree */
  // struct ct_data_s bl_tree[2*BL_CODES+1];  /* Huffman tree for bit lengths */

  // Use flat array of DOUBLE size, with interleaved fata,
  // because JS does not support effective
  this.dyn_ltree = new Buf16(HEAP_SIZE * 2);
  this.dyn_dtree = new Buf16((2 * D_CODES + 1) * 2);
  this.bl_tree = new Buf16((2 * BL_CODES + 1) * 2);
  zero(this.dyn_ltree);
  zero(this.dyn_dtree);
  zero(this.bl_tree);

  this.l_desc = null; /* desc. for literal tree */
  this.d_desc = null; /* desc. for distance tree */
  this.bl_desc = null; /* desc. for bit length tree */

  //ush bl_count[MAX_BITS+1];
  this.bl_count = new Buf16(MAX_BITS + 1);
  /* number of codes at each bit length for an optimal tree */

  //int heap[2*L_CODES+1];      /* heap used to build the Huffman trees */
  this.heap = new Buf16(2 * L_CODES + 1); /* heap used to build the Huffman trees */
  zero(this.heap);

  this.heap_len = 0; /* number of elements in the heap */
  this.heap_max = 0; /* element of largest frequency */
  /* The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
   * The same heap array is used to build all
   */

  this.depth = new Buf16(2 * L_CODES + 1); //uch depth[2*L_CODES+1];
  zero(this.depth);
  /* Depth of each subtree used as tie breaker for trees of equal frequency
   */

  this.l_buf = 0; /* buffer index for literals or lengths */

  this.lit_bufsize = 0;
  /* Size of match buffer for literals/lengths.  There are 4 reasons for
   * limiting lit_bufsize to 64K:
   *   - frequencies can be kept in 16 bit counters
   *   - if compression is not successful for the first block, all input
   *     data is still in the window so we can still emit a stored block even
   *     when input comes from standard input.  (This can also be done for
   *     all blocks if lit_bufsize is not greater than 32K.)
   *   - if compression is not successful for a file smaller than 64K, we can
   *     even emit a stored file instead of a stored block (saving 5 bytes).
   *     This is applicable only for zip (not gzip or zlib).
   *   - creating new Huffman trees less frequently may not provide fast
   *     adaptation to changes in the input data statistics. (Take for
   *     example a binary file with poorly compressible code followed by
   *     a highly compressible string table.) Smaller buffer sizes give
   *     fast adaptation but have of course the overhead of transmitting
   *     trees more frequently.
   *   - I can't count above 4
   */

  this.last_lit = 0; /* running index in l_buf */

  this.d_buf = 0;
  /* Buffer index for distances. To simplify the code, d_buf and l_buf have
   * the same number of elements. To use different lengths, an extra flag
   * array would be necessary.
   */

  this.opt_len = 0; /* bit length of current block with optimal trees */
  this.static_len = 0; /* bit length of current block with static trees */
  this.matches = 0; /* number of string matches in current block */
  this.insert = 0; /* bytes at end of window left to insert */


  this.bi_buf = 0;
  /* Output buffer. bits are inserted starting at the bottom (least
   * significant bits).
   */
  this.bi_valid = 0;
  /* Number of valid bits in bi_buf.  All bits above the last valid bit
   * are always zero.
   */

  // Used for window memory init. We safely ignore it for JS. That makes
  // sense only for pointers and memory check tools.
  //this.high_water = 0;
  /* High water mark offset in window for initialized bytes -- bytes above
   * this are set to zero in order to avoid memory check warnings when
   * longest match routines access bytes past the input.  This is then
   * updated to the new high water mark.
   */
}


function deflateResetKeep(strm) {
  var s;

  if (!strm || !strm.state) {
    return err(strm, Z_STREAM_ERROR$2);
  }

  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN$1;

  s = strm.state;
  s.pending = 0;
  s.pending_out = 0;

  if (s.wrap < 0) {
    s.wrap = -s.wrap;
    /* was made negative by deflate(..., Z_FINISH); */
  }
  s.status = (s.wrap ? INIT_STATE : BUSY_STATE);
  strm.adler = (s.wrap === 2) ?
    0 // crc32(0, Z_NULL, 0)
    :
    1; // adler32(0, Z_NULL, 0)
  s.last_flush = Z_NO_FLUSH$1;
  _tr_init(s);
  return Z_OK$2;
}


function deflateReset(strm) {
  var ret = deflateResetKeep(strm);
  if (ret === Z_OK$2) {
    lm_init(strm.state);
  }
  return ret;
}


function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
  if (!strm) { // === Z_NULL
    return Z_STREAM_ERROR$2;
  }
  var wrap = 1;

  if (level === Z_DEFAULT_COMPRESSION$1) {
    level = 6;
  }

  if (windowBits < 0) { /* suppress zlib wrapper */
    wrap = 0;
    windowBits = -windowBits;
  } else if (windowBits > 15) {
    wrap = 2; /* write gzip wrapper instead */
    windowBits -= 16;
  }


  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED$2 ||
    windowBits < 8 || windowBits > 15 || level < 0 || level > 9 ||
    strategy < 0 || strategy > Z_FIXED$1) {
    return err(strm, Z_STREAM_ERROR$2);
  }


  if (windowBits === 8) {
    windowBits = 9;
  }
  /* until 256-byte window bug fixed */

  var s = new DeflateState();

  strm.state = s;
  s.strm = strm;

  s.wrap = wrap;
  s.gzhead = null;
  s.w_bits = windowBits;
  s.w_size = 1 << s.w_bits;
  s.w_mask = s.w_size - 1;

  s.hash_bits = memLevel + 7;
  s.hash_size = 1 << s.hash_bits;
  s.hash_mask = s.hash_size - 1;
  s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);

  s.window = new Buf8(s.w_size * 2);
  s.head = new Buf16(s.hash_size);
  s.prev = new Buf16(s.w_size);

  // Don't need mem init magic for JS.
  //s.high_water = 0;  /* nothing written to s->window yet */

  s.lit_bufsize = 1 << (memLevel + 6); /* 16K elements by default */

  s.pending_buf_size = s.lit_bufsize * 4;

  //overlay = (ushf *) ZALLOC(strm, s->lit_bufsize, sizeof(ush)+2);
  //s->pending_buf = (uchf *) overlay;
  s.pending_buf = new Buf8(s.pending_buf_size);

  // It is offset from `s.pending_buf` (size is `s.lit_bufsize * 2`)
  //s->d_buf = overlay + s->lit_bufsize/sizeof(ush);
  s.d_buf = 1 * s.lit_bufsize;

  //s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;
  s.l_buf = (1 + 2) * s.lit_bufsize;

  s.level = level;
  s.strategy = strategy;
  s.method = method;

  return deflateReset(strm);
}


function deflate$1(strm, flush) {
  var old_flush, s;
  var beg, val; // for gzip header write only

  if (!strm || !strm.state ||
    flush > Z_BLOCK$2 || flush < 0) {
    return strm ? err(strm, Z_STREAM_ERROR$2) : Z_STREAM_ERROR$2;
  }

  s = strm.state;

  if (!strm.output ||
    (!strm.input && strm.avail_in !== 0) ||
    (s.status === FINISH_STATE && flush !== Z_FINISH$2)) {
    return err(strm, (strm.avail_out === 0) ? Z_BUF_ERROR$2 : Z_STREAM_ERROR$2);
  }

  s.strm = strm; /* just in case */
  old_flush = s.last_flush;
  s.last_flush = flush;

  /* Write the header */
  if (s.status === INIT_STATE) {
    if (s.wrap === 2) {
      // GZIP header
      strm.adler = 0; //crc32(0L, Z_NULL, 0);
      put_byte(s, 31);
      put_byte(s, 139);
      put_byte(s, 8);
      if (!s.gzhead) { // s->gzhead == Z_NULL
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, s.level === 9 ? 2 :
          (s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2 ?
            4 : 0));
        put_byte(s, OS_CODE);
        s.status = BUSY_STATE;
      } else {
        put_byte(s, (s.gzhead.text ? 1 : 0) +
          (s.gzhead.hcrc ? 2 : 0) +
          (!s.gzhead.extra ? 0 : 4) +
          (!s.gzhead.name ? 0 : 8) +
          (!s.gzhead.comment ? 0 : 16)
        );
        put_byte(s, s.gzhead.time & 0xff);
        put_byte(s, (s.gzhead.time >> 8) & 0xff);
        put_byte(s, (s.gzhead.time >> 16) & 0xff);
        put_byte(s, (s.gzhead.time >> 24) & 0xff);
        put_byte(s, s.level === 9 ? 2 :
          (s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2 ?
            4 : 0));
        put_byte(s, s.gzhead.os & 0xff);
        if (s.gzhead.extra && s.gzhead.extra.length) {
          put_byte(s, s.gzhead.extra.length & 0xff);
          put_byte(s, (s.gzhead.extra.length >> 8) & 0xff);
        }
        if (s.gzhead.hcrc) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
        }
        s.gzindex = 0;
        s.status = EXTRA_STATE;
      }
    } else // DEFLATE header
    {
      var header = (Z_DEFLATED$2 + ((s.w_bits - 8) << 4)) << 8;
      var level_flags = -1;

      if (s.strategy >= Z_HUFFMAN_ONLY$1 || s.level < 2) {
        level_flags = 0;
      } else if (s.level < 6) {
        level_flags = 1;
      } else if (s.level === 6) {
        level_flags = 2;
      } else {
        level_flags = 3;
      }
      header |= (level_flags << 6);
      if (s.strstart !== 0) {
        header |= PRESET_DICT;
      }
      header += 31 - (header % 31);

      s.status = BUSY_STATE;
      putShortMSB(s, header);

      /* Save the adler32 of the preset dictionary: */
      if (s.strstart !== 0) {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 0xffff);
      }
      strm.adler = 1; // adler32(0L, Z_NULL, 0);
    }
  }

  //#ifdef GZIP
  if (s.status === EXTRA_STATE) {
    if (s.gzhead.extra /* != Z_NULL*/ ) {
      beg = s.pending; /* start of bytes to update crc */

      while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            break;
          }
        }
        put_byte(s, s.gzhead.extra[s.gzindex] & 0xff);
        s.gzindex++;
      }
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (s.gzindex === s.gzhead.extra.length) {
        s.gzindex = 0;
        s.status = NAME_STATE;
      }
    } else {
      s.status = NAME_STATE;
    }
  }
  if (s.status === NAME_STATE) {
    if (s.gzhead.name /* != Z_NULL*/ ) {
      beg = s.pending; /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.name.length) {
          val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.gzindex = 0;
        s.status = COMMENT_STATE;
      }
    } else {
      s.status = COMMENT_STATE;
    }
  }
  if (s.status === COMMENT_STATE) {
    if (s.gzhead.comment /* != Z_NULL*/ ) {
      beg = s.pending; /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.comment.length) {
          val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.status = HCRC_STATE;
      }
    } else {
      s.status = HCRC_STATE;
    }
  }
  if (s.status === HCRC_STATE) {
    if (s.gzhead.hcrc) {
      if (s.pending + 2 > s.pending_buf_size) {
        flush_pending(strm);
      }
      if (s.pending + 2 <= s.pending_buf_size) {
        put_byte(s, strm.adler & 0xff);
        put_byte(s, (strm.adler >> 8) & 0xff);
        strm.adler = 0; //crc32(0L, Z_NULL, 0);
        s.status = BUSY_STATE;
      }
    } else {
      s.status = BUSY_STATE;
    }
  }
  //#endif

  /* Flush as much pending output as possible */
  if (s.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      /* Since avail_out is 0, deflate will be called again with
       * more output space, but possibly with both pending and
       * avail_in equal to zero. There won't be anything to do,
       * but this is not an error situation so make sure we
       * return OK instead of BUF_ERROR at next call of deflate:
       */
      s.last_flush = -1;
      return Z_OK$2;
    }

    /* Make sure there is something to do and avoid duplicate consecutive
     * flushes. For repeated and useless calls with Z_FINISH, we keep
     * returning Z_STREAM_END instead of Z_BUF_ERROR.
     */
  } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) &&
    flush !== Z_FINISH$2) {
    return err(strm, Z_BUF_ERROR$2);
  }

  /* User must not provide more input after the first FINISH: */
  if (s.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR$2);
  }

  /* Start a new block or continue the current one.
   */
  if (strm.avail_in !== 0 || s.lookahead !== 0 ||
    (flush !== Z_NO_FLUSH$1 && s.status !== FINISH_STATE)) {
    var bstate = (s.strategy === Z_HUFFMAN_ONLY$1) ? deflate_huff(s, flush) :
      (s.strategy === Z_RLE$1 ? deflate_rle(s, flush) :
        configuration_table[s.level].func(s, flush));

    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        /* avoid BUF_ERROR next call, see above */
      }
      return Z_OK$2;
      /* If flush != Z_NO_FLUSH && avail_out == 0, the next call
       * of deflate should use the same flush parameter to make sure
       * that the flush is complete. So we don't have to output an
       * empty block here, this will be done at next call. This also
       * ensures that for a very small output buffer, we emit at most
       * one empty block.
       */
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush === Z_PARTIAL_FLUSH$1) {
        _tr_align(s);
      } else if (flush !== Z_BLOCK$2) { /* FULL_FLUSH or SYNC_FLUSH */

        _tr_stored_block(s, 0, 0, false);
        /* For a full flush, this empty block will be recognized
         * as a special marker by inflate_sync().
         */
        if (flush === Z_FULL_FLUSH$1) {
          /*** CLEAR_HASH(s); ***/
          /* forget history */
          zero(s.head); // Fill with NIL (= 0);

          if (s.lookahead === 0) {
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1; /* avoid BUF_ERROR at next call, see above */
        return Z_OK$2;
      }
    }
  }
  //Assert(strm->avail_out > 0, "bug2");
  //if (strm.avail_out <= 0) { throw new Error("bug2");}

  if (flush !== Z_FINISH$2) {
    return Z_OK$2;
  }
  if (s.wrap <= 0) {
    return Z_STREAM_END$2;
  }

  /* Write the trailer */
  if (s.wrap === 2) {
    put_byte(s, strm.adler & 0xff);
    put_byte(s, (strm.adler >> 8) & 0xff);
    put_byte(s, (strm.adler >> 16) & 0xff);
    put_byte(s, (strm.adler >> 24) & 0xff);
    put_byte(s, strm.total_in & 0xff);
    put_byte(s, (strm.total_in >> 8) & 0xff);
    put_byte(s, (strm.total_in >> 16) & 0xff);
    put_byte(s, (strm.total_in >> 24) & 0xff);
  } else {
    putShortMSB(s, strm.adler >>> 16);
    putShortMSB(s, strm.adler & 0xffff);
  }

  flush_pending(strm);
  /* If avail_out is zero, the application will call deflate again
   * to flush the rest.
   */
  if (s.wrap > 0) {
    s.wrap = -s.wrap;
  }
  /* write the trailer only once! */
  return s.pending !== 0 ? Z_OK$2 : Z_STREAM_END$2;
}

function deflateEnd(strm) {
  var status;

  if (!strm /*== Z_NULL*/ || !strm.state /*== Z_NULL*/ ) {
    return Z_STREAM_ERROR$2;
  }

  status = strm.state.status;
  if (status !== INIT_STATE &&
    status !== EXTRA_STATE &&
    status !== NAME_STATE &&
    status !== COMMENT_STATE &&
    status !== HCRC_STATE &&
    status !== BUSY_STATE &&
    status !== FINISH_STATE
  ) {
    return err(strm, Z_STREAM_ERROR$2);
  }

  strm.state = null;

  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR$2) : Z_OK$2;
}

/* Not implemented
exports.deflateBound = deflateBound;
exports.deflateCopy = deflateCopy;
exports.deflateParams = deflateParams;
exports.deflatePending = deflatePending;
exports.deflatePrime = deflatePrime;
exports.deflateTune = deflateTune;
*/

// See state defs from inflate.js
var BAD$1 = 30;       /* got a data error -- remain here until reset */
var TYPE$1 = 12;      /* i: waiting for type bits, including last-flag bit */

/*
   Decode literal, length, and distance codes and write out the resulting
   literal and match bytes until either not enough input or output is
   available, an end-of-block is encountered, or a data error is encountered.
   When large enough input and output buffers are supplied to inflate(), for
   example, a 16K input buffer and a 64K output buffer, more than 95% of the
   inflate execution time is spent in this routine.

   Entry assumptions:

        state.mode === LEN
        strm.avail_in >= 6
        strm.avail_out >= 258
        start >= strm.avail_out
        state.bits < 8

   On return, state.mode is one of:

        LEN -- ran out of enough output space or enough available input
        TYPE -- reached end of block code, inflate() to interpret next block
        BAD -- error in block data

   Notes:

    - The maximum input bits used by a length/distance pair is 15 bits for the
      length code, 5 bits for the length extra, 15 bits for the distance code,
      and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
      Therefore if strm.avail_in >= 6, then there is enough input to avoid
      checking for available input while decoding.

    - The maximum bytes that a single length/distance pair can output is 258
      bytes, which is the maximum length that can be coded.  inflate_fast()
      requires strm.avail_out >= 258 for each loop to avoid checking for
      output space.
 */
function inflate_fast(strm, start) {
  var state;
  var _in;                    /* local strm.input */
  var last;                   /* have enough input while in < last */
  var _out;                   /* local strm.output */
  var beg;                    /* inflate()'s initial strm.output */
  var end;                    /* while out < end, enough space available */
//#ifdef INFLATE_STRICT
  var dmax;                   /* maximum distance from zlib header */
//#endif
  var wsize;                  /* window size or zero if not using window */
  var whave;                  /* valid bytes in the window */
  var wnext;                  /* window write index */
  // Use `s_window` instead `window`, avoid conflict with instrumentation tools
  var s_window;               /* allocated sliding window, if wsize != 0 */
  var hold;                   /* local strm.hold */
  var bits;                   /* local strm.bits */
  var lcode;                  /* local strm.lencode */
  var dcode;                  /* local strm.distcode */
  var lmask;                  /* mask for first level of length codes */
  var dmask;                  /* mask for first level of distance codes */
  var here;                   /* retrieved table entry */
  var op;                     /* code bits, operation, extra bits, or */
                              /*  window position, window bytes to copy */
  var len;                    /* match length, unused bytes */
  var dist;                   /* match distance */
  var from;                   /* where to copy match from */
  var from_source;


  var input, output; // JS specific, because we have no pointers

  /* copy state to local variables */
  state = strm.state;
  //here = state.here;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
//#ifdef INFLATE_STRICT
  dmax = state.dmax;
//#endif
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;


  /* decode literals and length/distances until end-of-block or not enough
     input data or output space */

  top:
  do {
    if (bits < 15) {
      hold += input[_in++] << bits;
      bits += 8;
      hold += input[_in++] << bits;
      bits += 8;
    }

    here = lcode[hold & lmask];

    dolen:
    for (;;) { // Goto emulation
      op = here >>> 24/*here.bits*/;
      hold >>>= op;
      bits -= op;
      op = (here >>> 16) & 0xff/*here.op*/;
      if (op === 0) {                          /* literal */
        //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
        output[_out++] = here & 0xffff/*here.val*/;
      }
      else if (op & 16) {                     /* length base */
        len = here & 0xffff/*here.val*/;
        op &= 15;                           /* number of extra bits */
        if (op) {
          if (bits < op) {
            hold += input[_in++] << bits;
            bits += 8;
          }
          len += hold & ((1 << op) - 1);
          hold >>>= op;
          bits -= op;
        }
        //Tracevv((stderr, "inflate:         length %u\n", len));
        if (bits < 15) {
          hold += input[_in++] << bits;
          bits += 8;
          hold += input[_in++] << bits;
          bits += 8;
        }
        here = dcode[hold & dmask];

        dodist:
        for (;;) { // goto emulation
          op = here >>> 24/*here.bits*/;
          hold >>>= op;
          bits -= op;
          op = (here >>> 16) & 0xff/*here.op*/;

          if (op & 16) {                      /* distance base */
            dist = here & 0xffff/*here.val*/;
            op &= 15;                       /* number of extra bits */
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
            }
            dist += hold & ((1 << op) - 1);
//#ifdef INFLATE_STRICT
            if (dist > dmax) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD$1;
              break top;
            }
//#endif
            hold >>>= op;
            bits -= op;
            //Tracevv((stderr, "inflate:         distance %u\n", dist));
            op = _out - beg;                /* max distance in output */
            if (dist > op) {                /* see if copy from window */
              op = dist - op;               /* distance back in window */
              if (op > whave) {
                if (state.sane) {
                  strm.msg = 'invalid distance too far back';
                  state.mode = BAD$1;
                  break top;
                }

// (!) This block is disabled in zlib defailts,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//                if (len <= op - whave) {
//                  do {
//                    output[_out++] = 0;
//                  } while (--len);
//                  continue top;
//                }
//                len -= op - whave;
//                do {
//                  output[_out++] = 0;
//                } while (--op > whave);
//                if (op === 0) {
//                  from = _out - dist;
//                  do {
//                    output[_out++] = output[from++];
//                  } while (--len);
//                  continue top;
//                }
//#endif
              }
              from = 0; // window index
              from_source = s_window;
              if (wnext === 0) {           /* very common case */
                from += wsize - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              else if (wnext < op) {      /* wrap around window */
                from += wsize + wnext - op;
                op -= wnext;
                if (op < len) {         /* some from end of window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = 0;
                  if (wnext < len) {  /* some from start of window */
                    op = wnext;
                    len -= op;
                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);
                    from = _out - dist;      /* rest from output */
                    from_source = output;
                  }
                }
              }
              else {                      /* contiguous in window */
                from += wnext - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              while (len > 2) {
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                len -= 3;
              }
              if (len) {
                output[_out++] = from_source[from++];
                if (len > 1) {
                  output[_out++] = from_source[from++];
                }
              }
            }
            else {
              from = _out - dist;          /* copy direct from output */
              do {                        /* minimum length is three */
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                len -= 3;
              } while (len > 2);
              if (len) {
                output[_out++] = output[from++];
                if (len > 1) {
                  output[_out++] = output[from++];
                }
              }
            }
          }
          else if ((op & 64) === 0) {          /* 2nd level distance code */
            here = dcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
            continue dodist;
          }
          else {
            strm.msg = 'invalid distance code';
            state.mode = BAD$1;
            break top;
          }

          break; // need to emulate goto via "continue"
        }
      }
      else if ((op & 64) === 0) {              /* 2nd level length code */
        here = lcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
        continue dolen;
      }
      else if (op & 32) {                     /* end-of-block */
        //Tracevv((stderr, "inflate:         end of block\n"));
        state.mode = TYPE$1;
        break top;
      }
      else {
        strm.msg = 'invalid literal/length code';
        state.mode = BAD$1;
        break top;
      }

      break; // need to emulate goto via "continue"
    }
  } while (_in < last && _out < end);

  /* return unused bytes (on entry, bits < 8, so in won't go too far back) */
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;

  /* update state and return */
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = (_in < last ? 5 + (last - _in) : 5 - (_in - last));
  strm.avail_out = (_out < end ? 257 + (end - _out) : 257 - (_out - end));
  state.hold = hold;
  state.bits = bits;
  return;
}

var MAXBITS = 15;
var ENOUGH_LENS$1 = 852;
var ENOUGH_DISTS$1 = 592;
//var ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

var CODES$1 = 0;
var LENS$1 = 1;
var DISTS$1 = 2;

var lbase = [ /* Length codes 257..285 base */
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0
];

var lext = [ /* Length codes 257..285 extra */
  16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18,
  19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78
];

var dbase = [ /* Distance codes 0..29 base */
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 0, 0
];

var dext = [ /* Distance codes 0..29 extra */
  16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22,
  23, 23, 24, 24, 25, 25, 26, 26, 27, 27,
  28, 28, 29, 29, 64, 64
];

function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
  var bits = opts.bits;
  //here = opts.here; /* table entry for duplication */

  var len = 0; /* a code's length in bits */
  var sym = 0; /* index of code symbols */
  var min = 0,
    max = 0; /* minimum and maximum code lengths */
  var root = 0; /* number of index bits for root table */
  var curr = 0; /* number of index bits for current table */
  var drop = 0; /* code bits to drop for sub-table */
  var left = 0; /* number of prefix codes available */
  var used = 0; /* code entries in table used */
  var huff = 0; /* Huffman code */
  var incr; /* for incrementing code, index */
  var fill; /* index for replicating entries */
  var low; /* low bits for current root entry */
  var mask; /* mask for low root bits */
  var next; /* next available space in table */
  var base = null; /* base value table to use */
  var base_index = 0;
  //  var shoextra;    /* extra bits table to use */
  var end; /* use base and extra for symbol > end */
  var count = new Buf16(MAXBITS + 1); //[MAXBITS+1];    /* number of codes of each length */
  var offs = new Buf16(MAXBITS + 1); //[MAXBITS+1];     /* offsets in table for each length */
  var extra = null;
  var extra_index = 0;

  var here_bits, here_op, here_val;

  /*
   Process a set of code lengths to create a canonical Huffman code.  The
   code lengths are lens[0..codes-1].  Each length corresponds to the
   symbols 0..codes-1.  The Huffman code is generated by first sorting the
   symbols by length from short to long, and retaining the symbol order
   for codes with equal lengths.  Then the code starts with all zero bits
   for the first code of the shortest length, and the codes are integer
   increments for the same length, and zeros are appended as the length
   increases.  For the deflate format, these bits are stored backwards
   from their more natural integer increment ordering, and so when the
   decoding tables are built in the large loop below, the integer codes
   are incremented backwards.

   This routine assumes, but does not check, that all of the entries in
   lens[] are in the range 0..MAXBITS.  The caller must assure this.
   1..MAXBITS is interpreted as that code length.  zero means that that
   symbol does not occur in this code.

   The codes are sorted by computing a count of codes for each length,
   creating from that a table of starting indices for each length in the
   sorted table, and then entering the symbols in order in the sorted
   table.  The sorted table is work[], with that space being provided by
   the caller.

   The length counts are used for other purposes as well, i.e. finding
   the minimum and maximum length codes, determining if there are any
   codes at all, checking for a valid set of lengths, and looking ahead
   at length counts to determine sub-table sizes when building the
   decoding tables.
   */

  /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }

  /* bound code lengths, force root to be within code lengths */
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) {
      break;
    }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) { /* no symbols to code at all */
    //table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
    //table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
    //table.val[opts.table_index++] = 0;   //here.val = (var short)0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;


    //table.op[opts.table_index] = 64;
    //table.bits[opts.table_index] = 1;
    //table.val[opts.table_index++] = 0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;

    opts.bits = 1;
    return 0; /* no symbols, but wait for decoding to report error */
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) {
      break;
    }
  }
  if (root < min) {
    root = min;
  }

  /* check for an over-subscribed or incomplete set of lengths */
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    } /* over-subscribed */
  }
  if (left > 0 && (type === CODES$1 || max !== 1)) {
    return -1; /* incomplete set */
  }

  /* generate offsets into symbol table for each length for sorting */
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }

  /* sort symbols by length, by symbol order within each length */
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }

  /*
   Create and fill in decoding tables.  In this loop, the table being
   filled is at next and has curr index bits.  The code being used is huff
   with length len.  That code is converted to an index by dropping drop
   bits off of the bottom.  For codes where len is less than drop + curr,
   those top drop + curr - len bits are incremented through all values to
   fill the table with replicated entries.

   root is the number of index bits for the root table.  When len exceeds
   root, sub-tables are created pointed to by the root entry with an index
   of the low root bits of huff.  This is saved in low to check for when a
   new sub-table should be started.  drop is zero when the root table is
   being filled, and drop is root when sub-tables are being filled.

   When a new sub-table is needed, it is necessary to look ahead in the
   code lengths to determine what size sub-table is needed.  The length
   counts are used for this, and so count[] is decremented as codes are
   entered in the tables.

   used keeps track of how many table entries have been allocated from the
   provided *table space.  It is checked for LENS and DIST tables against
   the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
   the initial root table size constants.  See the comments in inftrees.h
   for more information.

   sym increments through all symbols, and the loop terminates when
   all codes of length max, i.e. all codes, have been processed.  This
   routine permits incomplete codes, so another loop after this one fills
   in the rest of the decoding tables with invalid code markers.
   */

  /* set up for code type */
  // poor man optimization - use if-else instead of switch,
  // to avoid deopts in old v8
  if (type === CODES$1) {
    base = extra = work; /* dummy value--not used */
    end = 19;

  } else if (type === LENS$1) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end = 256;

  } else { /* DISTS */
    base = dbase;
    extra = dext;
    end = -1;
  }

  /* initialize opts for loop */
  huff = 0; /* starting code */
  sym = 0; /* starting code symbol */
  len = min; /* starting code length */
  next = table_index; /* current table to fill in */
  curr = root; /* current table index bits */
  drop = 0; /* current bits to drop from code for index */
  low = -1; /* trigger new sub-table when len > root */
  used = 1 << root; /* use root table entries */
  mask = used - 1; /* mask for comparing low */

  /* check available table space */
  if ((type === LENS$1 && used > ENOUGH_LENS$1) ||
    (type === DISTS$1 && used > ENOUGH_DISTS$1)) {
    return 1;
  }
  /* process all codes and make table entries */
  for (;;) {
    /* create table entry */
    here_bits = len - drop;
    if (work[sym] < end) {
      here_op = 0;
      here_val = work[sym];
    } else if (work[sym] > end) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    } else {
      here_op = 32 + 64; /* end of block */
      here_val = 0;
    }

    /* replicate for those indices with low len bits equal to huff */
    incr = 1 << (len - drop);
    fill = 1 << curr;
    min = fill; /* save offset to next table */
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = (here_bits << 24) | (here_op << 16) | here_val | 0;
    } while (fill !== 0);

    /* backwards increment the len-bit code huff */
    incr = 1 << (len - 1);
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }

    /* go to next symbol, update count, len */
    sym++;
    if (--count[len] === 0) {
      if (len === max) {
        break;
      }
      len = lens[lens_index + work[sym]];
    }

    /* create new sub-table if needed */
    if (len > root && (huff & mask) !== low) {
      /* if first time, transition to sub-tables */
      if (drop === 0) {
        drop = root;
      }

      /* increment past last table */
      next += min; /* here min is 1 << curr */

      /* determine length of next table */
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) {
          break;
        }
        curr++;
        left <<= 1;
      }

      /* check for enough space */
      used += 1 << curr;
      if ((type === LENS$1 && used > ENOUGH_LENS$1) ||
        (type === DISTS$1 && used > ENOUGH_DISTS$1)) {
        return 1;
      }

      /* point entry in root table to sub-table */
      low = huff & mask;
      /*table.op[low] = curr;
      table.bits[low] = root;
      table.val[low] = next - opts.table_index;*/
      table[low] = (root << 24) | (curr << 16) | (next - table_index) | 0;
    }
  }

  /* fill in remaining table entry if code is incomplete (guaranteed to have
   at most one remaining entry, since if the code is incomplete, the
   maximum code length that was allowed to get this far is one bit) */
  if (huff !== 0) {
    //table.op[next + huff] = 64;            /* invalid code marker */
    //table.bits[next + huff] = len - drop;
    //table.val[next + huff] = 0;
    table[next + huff] = ((len - drop) << 24) | (64 << 16) | 0;
  }

  /* set return parameters */
  //opts.table_index += used;
  opts.bits = root;
  return 0;
}

var CODES = 0;
var LENS = 1;
var DISTS = 2;

/* Public constants ==========================================================*/
/* ===========================================================================*/


/* Allowed flush values; see deflate() and inflate() below for details */
//var Z_NO_FLUSH      = 0;
//var Z_PARTIAL_FLUSH = 1;
//var Z_SYNC_FLUSH    = 2;
//var Z_FULL_FLUSH    = 3;
var Z_FINISH$1 = 4;
var Z_BLOCK$1 = 5;
var Z_TREES$1 = 6;


/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
var Z_OK$1 = 0;
var Z_STREAM_END$1 = 1;
var Z_NEED_DICT$1 = 2;
//var Z_ERRNO         = -1;
var Z_STREAM_ERROR$1 = -2;
var Z_DATA_ERROR$1 = -3;
var Z_MEM_ERROR = -4;
var Z_BUF_ERROR$1 = -5;
//var Z_VERSION_ERROR = -6;

/* The deflate compression method */
var Z_DEFLATED$1 = 8;


/* STATES ====================================================================*/
/* ===========================================================================*/


var HEAD = 1; /* i: waiting for magic header */
var FLAGS = 2; /* i: waiting for method and flags (gzip) */
var TIME = 3; /* i: waiting for modification time (gzip) */
var OS = 4; /* i: waiting for extra flags and operating system (gzip) */
var EXLEN = 5; /* i: waiting for extra length (gzip) */
var EXTRA = 6; /* i: waiting for extra bytes (gzip) */
var NAME = 7; /* i: waiting for end of file name (gzip) */
var COMMENT = 8; /* i: waiting for end of comment (gzip) */
var HCRC = 9; /* i: waiting for header crc (gzip) */
var DICTID = 10; /* i: waiting for dictionary check value */
var DICT = 11; /* waiting for inflateSetDictionary() call */
var TYPE = 12; /* i: waiting for type bits, including last-flag bit */
var TYPEDO = 13; /* i: same, but skip check to exit inflate on new block */
var STORED = 14; /* i: waiting for stored size (length and complement) */
var COPY_ = 15; /* i/o: same as COPY below, but only first time in */
var COPY = 16; /* i/o: waiting for input or output to copy stored block */
var TABLE = 17; /* i: waiting for dynamic block table lengths */
var LENLENS = 18; /* i: waiting for code length code lengths */
var CODELENS = 19; /* i: waiting for length/lit and distance code lengths */
var LEN_ = 20; /* i: same as LEN below, but only first time in */
var LEN = 21; /* i: waiting for length/lit/eob code */
var LENEXT = 22; /* i: waiting for length extra bits */
var DIST = 23; /* i: waiting for distance code */
var DISTEXT = 24; /* i: waiting for distance extra bits */
var MATCH = 25; /* o: waiting for output space to copy string */
var LIT = 26; /* o: waiting for output space to write literal */
var CHECK = 27; /* i: waiting for 32-bit check value */
var LENGTH = 28; /* i: waiting for 32-bit length (gzip) */
var DONE = 29; /* finished check, done -- remain here until reset */
var BAD = 30; /* got a data error -- remain here until reset */
var MEM = 31; /* got an inflate() memory error -- remain here until reset */
var SYNC = 32; /* looking for synchronization bytes to restart inflate() */

/* ===========================================================================*/



var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;


function zswap32(q) {
  return (((q >>> 24) & 0xff) +
    ((q >>> 8) & 0xff00) +
    ((q & 0xff00) << 8) +
    ((q & 0xff) << 24));
}


function InflateState() {
  this.mode = 0; /* current inflate mode */
  this.last = false; /* true if processing last block */
  this.wrap = 0; /* bit 0 true for zlib, bit 1 true for gzip */
  this.havedict = false; /* true if dictionary provided */
  this.flags = 0; /* gzip header method and flags (0 if zlib) */
  this.dmax = 0; /* zlib header max distance (INFLATE_STRICT) */
  this.check = 0; /* protected copy of check value */
  this.total = 0; /* protected copy of output count */
  // TODO: may be {}
  this.head = null; /* where to save gzip header information */

  /* sliding window */
  this.wbits = 0; /* log base 2 of requested window size */
  this.wsize = 0; /* window size or zero if not using window */
  this.whave = 0; /* valid bytes in the window */
  this.wnext = 0; /* window write index */
  this.window = null; /* allocated sliding window, if needed */

  /* bit accumulator */
  this.hold = 0; /* input bit accumulator */
  this.bits = 0; /* number of bits in "in" */

  /* for string and stored block copying */
  this.length = 0; /* literal or length of data to copy */
  this.offset = 0; /* distance back to copy string from */

  /* for table and code decoding */
  this.extra = 0; /* extra bits needed */

  /* fixed and dynamic code tables */
  this.lencode = null; /* starting table for length/literal codes */
  this.distcode = null; /* starting table for distance codes */
  this.lenbits = 0; /* index bits for lencode */
  this.distbits = 0; /* index bits for distcode */

  /* dynamic table building */
  this.ncode = 0; /* number of code length code lengths */
  this.nlen = 0; /* number of length code lengths */
  this.ndist = 0; /* number of distance code lengths */
  this.have = 0; /* number of code lengths in lens[] */
  this.next = null; /* next available space in codes[] */

  this.lens = new Buf16(320); /* temporary storage for code lengths */
  this.work = new Buf16(288); /* work area for code table building */

  /*
   because we don't have pointers in js, we use lencode and distcode directly
   as buffers so we don't need codes
  */
  //this.codes = new Buf32(ENOUGH);       /* space for code tables */
  this.lendyn = null; /* dynamic table for length/literal codes (JS specific) */
  this.distdyn = null; /* dynamic table for distance codes (JS specific) */
  this.sane = 0; /* if false, allow invalid distance too far */
  this.back = 0; /* bits back of last unprocessed length/lit */
  this.was = 0; /* initial length of match */
}

function inflateResetKeep(strm) {
  var state;

  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = ''; /*Z_NULL*/
  if (state.wrap) { /* to support ill-conceived Java test suite */
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null /*Z_NULL*/ ;
  state.hold = 0;
  state.bits = 0;
  //state.lencode = state.distcode = state.next = state.codes;
  state.lencode = state.lendyn = new Buf32(ENOUGH_LENS);
  state.distcode = state.distdyn = new Buf32(ENOUGH_DISTS);

  state.sane = 1;
  state.back = -1;
  //Tracev((stderr, "inflate: reset\n"));
  return Z_OK$1;
}

function inflateReset(strm) {
  var state;

  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);

}

function inflateReset2(strm, windowBits) {
  var wrap;
  var state;

  /* get the state */
  if (!strm || !strm.state) {
    return Z_STREAM_ERROR$1;
  }
  state = strm.state;

  /* extract wrap request from windowBits parameter */
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  } else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }

  /* set number of window bits, free window if different */
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR$1;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }

  /* update state and reset the rest of it */
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
}

function inflateInit2(strm, windowBits) {
  var ret;
  var state;

  if (!strm) {
    return Z_STREAM_ERROR$1;
  }
  //strm.msg = Z_NULL;                 /* in case we return an error */

  state = new InflateState();

  //if (state === Z_NULL) return Z_MEM_ERROR;
  //Tracev((stderr, "inflate: allocated\n"));
  strm.state = state;
  state.window = null /*Z_NULL*/ ;
  ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK$1) {
    strm.state = null /*Z_NULL*/ ;
  }
  return ret;
}


/*
 Return state with length and distance decoding tables and index sizes set to
 fixed code decoding.  Normally this returns fixed tables from inffixed.h.
 If BUILDFIXED is defined, then instead this routine builds the tables the
 first time it's called, and returns those tables the first time and
 thereafter.  This reduces the size of the code by about 2K bytes, in
 exchange for a little execution time.  However, BUILDFIXED should not be
 used for threaded applications, since the rewriting of the tables and virgin
 may not be thread-safe.
 */
var virgin = true;

var lenfix, distfix; // We have no pointers in JS, so keep tables separate

function fixedtables(state) {
  /* build fixed huffman tables if first call (may not be thread safe) */
  if (virgin) {
    var sym;

    lenfix = new Buf32(512);
    distfix = new Buf32(32);

    /* literal/length table */
    sym = 0;
    while (sym < 144) {
      state.lens[sym++] = 8;
    }
    while (sym < 256) {
      state.lens[sym++] = 9;
    }
    while (sym < 280) {
      state.lens[sym++] = 7;
    }
    while (sym < 288) {
      state.lens[sym++] = 8;
    }

    inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, {
      bits: 9
    });

    /* distance table */
    sym = 0;
    while (sym < 32) {
      state.lens[sym++] = 5;
    }

    inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, {
      bits: 5
    });

    /* do this just once */
    virgin = false;
  }

  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
}


/*
 Update the window with the last wsize (normally 32K) bytes written before
 returning.  If window does not exist yet, create it.  This is only called
 when a window is already in use, or when output has been written during this
 inflate call, but the end of the deflate stream has not been reached yet.
 It is also called to create a window for dictionary data when a dictionary
 is loaded.

 Providing output buffers larger than 32K to inflate() should provide a speed
 advantage, since only the last 32K of output is copied to the sliding window
 upon return from inflate(), and since all distances after the first 32K of
 output will fall in the output data, making match copies simpler and faster.
 The advantage may be dependent on the size of the processor's data caches.
 */
function updatewindow(strm, src, end, copy) {
  var dist;
  var state = strm.state;

  /* if it hasn't been done already, allocate space for the window */
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;

    state.window = new Buf8(state.wsize);
  }

  /* copy state->wsize or less output bytes into the circular window */
  if (copy >= state.wsize) {
    arraySet(state.window, src, end - state.wsize, state.wsize, 0);
    state.wnext = 0;
    state.whave = state.wsize;
  } else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    //zmemcpy(state->window + state->wnext, end - copy, dist);
    arraySet(state.window, src, end - copy, dist, state.wnext);
    copy -= dist;
    if (copy) {
      //zmemcpy(state->window, end - copy, copy);
      arraySet(state.window, src, end - copy, copy, 0);
      state.wnext = copy;
      state.whave = state.wsize;
    } else {
      state.wnext += dist;
      if (state.wnext === state.wsize) {
        state.wnext = 0;
      }
      if (state.whave < state.wsize) {
        state.whave += dist;
      }
    }
  }
  return 0;
}

function inflate$1(strm, flush) {
  var state;
  var input, output; // input/output buffers
  var next; /* next input INDEX */
  var put; /* next output INDEX */
  var have, left; /* available input and output */
  var hold; /* bit buffer */
  var bits; /* bits in bit buffer */
  var _in, _out; /* save starting available input and output */
  var copy; /* number of stored or match bytes to copy */
  var from; /* where to copy match bytes from */
  var from_source;
  var here = 0; /* current decoding table entry */
  var here_bits, here_op, here_val; // paked "here" denormalized (JS specific)
  //var last;                   /* parent table entry */
  var last_bits, last_op, last_val; // paked "last" denormalized (JS specific)
  var len; /* length to copy for repeats, bits to drop */
  var ret; /* return code */
  var hbuf = new Buf8(4); /* buffer for gzip header crc calculation */
  var opts;

  var n; // temporary var for NEED_BITS

  var order = /* permutation of code lengths */ [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];


  if (!strm || !strm.state || !strm.output ||
    (!strm.input && strm.avail_in !== 0)) {
    return Z_STREAM_ERROR$1;
  }

  state = strm.state;
  if (state.mode === TYPE) {
    state.mode = TYPEDO;
  } /* skip check */


  //--- LOAD() ---
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  //---

  _in = have;
  _out = left;
  ret = Z_OK$1;

  inf_leave: // goto emulation
    for (;;) {
      switch (state.mode) {
      case HEAD:
        if (state.wrap === 0) {
          state.mode = TYPEDO;
          break;
        }
        //=== NEEDBITS(16);
        while (bits < 16) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((state.wrap & 2) && hold === 0x8b1f) { /* gzip header */
          state.check = 0 /*crc32(0L, Z_NULL, 0)*/ ;
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//

          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          state.mode = FLAGS;
          break;
        }
        state.flags = 0; /* expect zlib header */
        if (state.head) {
          state.head.done = false;
        }
        if (!(state.wrap & 1) || /* check if zlib header allowed */
          (((hold & 0xff) /*BITS(8)*/ << 8) + (hold >> 8)) % 31) {
          strm.msg = 'incorrect header check';
          state.mode = BAD;
          break;
        }
        if ((hold & 0x0f) /*BITS(4)*/ !== Z_DEFLATED$1) {
          strm.msg = 'unknown compression method';
          state.mode = BAD;
          break;
        }
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
        len = (hold & 0x0f) /*BITS(4)*/ + 8;
        if (state.wbits === 0) {
          state.wbits = len;
        } else if (len > state.wbits) {
          strm.msg = 'invalid window size';
          state.mode = BAD;
          break;
        }
        state.dmax = 1 << len;
        //Tracev((stderr, "inflate:   zlib header ok\n"));
        strm.adler = state.check = 1 /*adler32(0L, Z_NULL, 0)*/ ;
        state.mode = hold & 0x200 ? DICTID : TYPE;
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        break;
      case FLAGS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.flags = hold;
        if ((state.flags & 0xff) !== Z_DEFLATED$1) {
          strm.msg = 'unknown compression method';
          state.mode = BAD;
          break;
        }
        if (state.flags & 0xe000) {
          strm.msg = 'unknown header flags set';
          state.mode = BAD;
          break;
        }
        if (state.head) {
          state.head.text = ((hold >> 8) & 1);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = TIME;
        /* falls through */
      case TIME:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.time = hold;
        }
        if (state.flags & 0x0200) {
          //=== CRC4(state.check, hold)
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          hbuf[2] = (hold >>> 16) & 0xff;
          hbuf[3] = (hold >>> 24) & 0xff;
          state.check = crc32(state.check, hbuf, 4, 0);
          //===
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = OS;
        /* falls through */
      case OS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.xflags = (hold & 0xff);
          state.head.os = (hold >> 8);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = EXLEN;
        /* falls through */
      case EXLEN:
        if (state.flags & 0x0400) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length = hold;
          if (state.head) {
            state.head.extra_len = hold;
          }
          if (state.flags & 0x0200) {
            //=== CRC2(state.check, hold);
            hbuf[0] = hold & 0xff;
            hbuf[1] = (hold >>> 8) & 0xff;
            state.check = crc32(state.check, hbuf, 2, 0);
            //===//
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        } else if (state.head) {
          state.head.extra = null /*Z_NULL*/ ;
        }
        state.mode = EXTRA;
        /* falls through */
      case EXTRA:
        if (state.flags & 0x0400) {
          copy = state.length;
          if (copy > have) {
            copy = have;
          }
          if (copy) {
            if (state.head) {
              len = state.head.extra_len - state.length;
              if (!state.head.extra) {
                // Use untyped array for more conveniend processing later
                state.head.extra = new Array(state.head.extra_len);
              }
              arraySet(
                state.head.extra,
                input,
                next,
                // extra field is limited to 65536 bytes
                // - no need for additional size check
                copy,
                /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                len
              );
              //zmemcpy(state.head.extra + len, next,
              //        len + copy > state.head.extra_max ?
              //        state.head.extra_max - len : copy);
            }
            if (state.flags & 0x0200) {
              state.check = crc32(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            state.length -= copy;
          }
          if (state.length) {
            break inf_leave;
          }
        }
        state.length = 0;
        state.mode = NAME;
        /* falls through */
      case NAME:
        if (state.flags & 0x0800) {
          if (have === 0) {
            break inf_leave;
          }
          copy = 0;
          do {
            // TODO: 2 or 1 bytes?
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
              (state.length < 65536 /*state.head.name_max*/ )) {
              state.head.name += String.fromCharCode(len);
            }
          } while (len && copy < have);

          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) {
            break inf_leave;
          }
        } else if (state.head) {
          state.head.name = null;
        }
        state.length = 0;
        state.mode = COMMENT;
        /* falls through */
      case COMMENT:
        if (state.flags & 0x1000) {
          if (have === 0) {
            break inf_leave;
          }
          copy = 0;
          do {
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
              (state.length < 65536 /*state.head.comm_max*/ )) {
              state.head.comment += String.fromCharCode(len);
            }
          } while (len && copy < have);
          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) {
            break inf_leave;
          }
        } else if (state.head) {
          state.head.comment = null;
        }
        state.mode = HCRC;
        /* falls through */
      case HCRC:
        if (state.flags & 0x0200) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.check & 0xffff)) {
            strm.msg = 'header crc mismatch';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        }
        if (state.head) {
          state.head.hcrc = ((state.flags >> 9) & 1);
          state.head.done = true;
        }
        strm.adler = state.check = 0;
        state.mode = TYPE;
        break;
      case DICTID:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        strm.adler = state.check = zswap32(hold);
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = DICT;
        /* falls through */
      case DICT:
        if (state.havedict === 0) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          return Z_NEED_DICT$1;
        }
        strm.adler = state.check = 1 /*adler32(0L, Z_NULL, 0)*/ ;
        state.mode = TYPE;
        /* falls through */
      case TYPE:
        if (flush === Z_BLOCK$1 || flush === Z_TREES$1) {
          break inf_leave;
        }
        /* falls through */
      case TYPEDO:
        if (state.last) {
          //--- BYTEBITS() ---//
          hold >>>= bits & 7;
          bits -= bits & 7;
          //---//
          state.mode = CHECK;
          break;
        }
        //=== NEEDBITS(3); */
        while (bits < 3) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.last = (hold & 0x01) /*BITS(1)*/ ;
        //--- DROPBITS(1) ---//
        hold >>>= 1;
        bits -= 1;
        //---//

        switch ((hold & 0x03) /*BITS(2)*/ ) {
        case 0:
          /* stored block */
          //Tracev((stderr, "inflate:     stored block%s\n",
          //        state.last ? " (last)" : ""));
          state.mode = STORED;
          break;
        case 1:
          /* fixed block */
          fixedtables(state);
          //Tracev((stderr, "inflate:     fixed codes block%s\n",
          //        state.last ? " (last)" : ""));
          state.mode = LEN_; /* decode codes */
          if (flush === Z_TREES$1) {
            //--- DROPBITS(2) ---//
            hold >>>= 2;
            bits -= 2;
            //---//
            break inf_leave;
          }
          break;
        case 2:
          /* dynamic block */
          //Tracev((stderr, "inflate:     dynamic codes block%s\n",
          //        state.last ? " (last)" : ""));
          state.mode = TABLE;
          break;
        case 3:
          strm.msg = 'invalid block type';
          state.mode = BAD;
        }
        //--- DROPBITS(2) ---//
        hold >>>= 2;
        bits -= 2;
        //---//
        break;
      case STORED:
        //--- BYTEBITS() ---// /* go to byte boundary */
        hold >>>= bits & 7;
        bits -= bits & 7;
        //---//
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((hold & 0xffff) !== ((hold >>> 16) ^ 0xffff)) {
          strm.msg = 'invalid stored block lengths';
          state.mode = BAD;
          break;
        }
        state.length = hold & 0xffff;
        //Tracev((stderr, "inflate:       stored length %u\n",
        //        state.length));
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = COPY_;
        if (flush === Z_TREES$1) {
          break inf_leave;
        }
        /* falls through */
      case COPY_:
        state.mode = COPY;
        /* falls through */
      case COPY:
        copy = state.length;
        if (copy) {
          if (copy > have) {
            copy = have;
          }
          if (copy > left) {
            copy = left;
          }
          if (copy === 0) {
            break inf_leave;
          }
          //--- zmemcpy(put, next, copy); ---
          arraySet(output, input, next, copy, put);
          //---//
          have -= copy;
          next += copy;
          left -= copy;
          put += copy;
          state.length -= copy;
          break;
        }
        //Tracev((stderr, "inflate:       stored end\n"));
        state.mode = TYPE;
        break;
      case TABLE:
        //=== NEEDBITS(14); */
        while (bits < 14) {
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.nlen = (hold & 0x1f) /*BITS(5)*/ + 257;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ndist = (hold & 0x1f) /*BITS(5)*/ + 1;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ncode = (hold & 0x0f) /*BITS(4)*/ + 4;
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
        //#ifndef PKZIP_BUG_WORKAROUND
        if (state.nlen > 286 || state.ndist > 30) {
          strm.msg = 'too many length or distance symbols';
          state.mode = BAD;
          break;
        }
        //#endif
        //Tracev((stderr, "inflate:       table sizes ok\n"));
        state.have = 0;
        state.mode = LENLENS;
        /* falls through */
      case LENLENS:
        while (state.have < state.ncode) {
          //=== NEEDBITS(3);
          while (bits < 3) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.lens[order[state.have++]] = (hold & 0x07); //BITS(3);
          //--- DROPBITS(3) ---//
          hold >>>= 3;
          bits -= 3;
          //---//
        }
        while (state.have < 19) {
          state.lens[order[state.have++]] = 0;
        }
        // We have separate tables & no pointers. 2 commented lines below not needed.
        //state.next = state.codes;
        //state.lencode = state.next;
        // Switch to use dynamic table
        state.lencode = state.lendyn;
        state.lenbits = 7;

        opts = {
          bits: state.lenbits
        };
        ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
        state.lenbits = opts.bits;

        if (ret) {
          strm.msg = 'invalid code lengths set';
          state.mode = BAD;
          break;
        }
        //Tracev((stderr, "inflate:       code lengths ok\n"));
        state.have = 0;
        state.mode = CODELENS;
        /* falls through */
      case CODELENS:
        while (state.have < state.nlen + state.ndist) {
          for (;;) {
            here = state.lencode[hold & ((1 << state.lenbits) - 1)]; /*BITS(state.lenbits)*/
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((here_bits) <= bits) {
              break;
            }
            //--- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          if (here_val < 16) {
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            state.lens[state.have++] = here_val;
          } else {
            if (here_val === 16) {
              //=== NEEDBITS(here.bits + 2);
              n = here_bits + 2;
              while (bits < n) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              if (state.have === 0) {
                strm.msg = 'invalid bit length repeat';
                state.mode = BAD;
                break;
              }
              len = state.lens[state.have - 1];
              copy = 3 + (hold & 0x03); //BITS(2);
              //--- DROPBITS(2) ---//
              hold >>>= 2;
              bits -= 2;
              //---//
            } else if (here_val === 17) {
              //=== NEEDBITS(here.bits + 3);
              n = here_bits + 3;
              while (bits < n) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 3 + (hold & 0x07); //BITS(3);
              //--- DROPBITS(3) ---//
              hold >>>= 3;
              bits -= 3;
              //---//
            } else {
              //=== NEEDBITS(here.bits + 7);
              n = here_bits + 7;
              while (bits < n) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 11 + (hold & 0x7f); //BITS(7);
              //--- DROPBITS(7) ---//
              hold >>>= 7;
              bits -= 7;
              //---//
            }
            if (state.have + copy > state.nlen + state.ndist) {
              strm.msg = 'invalid bit length repeat';
              state.mode = BAD;
              break;
            }
            while (copy--) {
              state.lens[state.have++] = len;
            }
          }
        }

        /* handle error breaks in while */
        if (state.mode === BAD) {
          break;
        }

        /* check for end-of-block code (better have one) */
        if (state.lens[256] === 0) {
          strm.msg = 'invalid code -- missing end-of-block';
          state.mode = BAD;
          break;
        }

        /* build code tables -- note: do not change the lenbits or distbits
           values here (9 and 6) without reading the comments in inftrees.h
           concerning the ENOUGH constants, which depend on those values */
        state.lenbits = 9;

        opts = {
          bits: state.lenbits
        };
        ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.lenbits = opts.bits;
        // state.lencode = state.next;

        if (ret) {
          strm.msg = 'invalid literal/lengths set';
          state.mode = BAD;
          break;
        }

        state.distbits = 6;
        //state.distcode.copy(state.codes);
        // Switch to use dynamic table
        state.distcode = state.distdyn;
        opts = {
          bits: state.distbits
        };
        ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.distbits = opts.bits;
        // state.distcode = state.next;

        if (ret) {
          strm.msg = 'invalid distances set';
          state.mode = BAD;
          break;
        }
        //Tracev((stderr, 'inflate:       codes ok\n'));
        state.mode = LEN_;
        if (flush === Z_TREES$1) {
          break inf_leave;
        }
        /* falls through */
      case LEN_:
        state.mode = LEN;
        /* falls through */
      case LEN:
        if (have >= 6 && left >= 258) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          inflate_fast(strm, _out);
          //--- LOAD() ---
          put = strm.next_out;
          output = strm.output;
          left = strm.avail_out;
          next = strm.next_in;
          input = strm.input;
          have = strm.avail_in;
          hold = state.hold;
          bits = state.bits;
          //---

          if (state.mode === TYPE) {
            state.back = -1;
          }
          break;
        }
        state.back = 0;
        for (;;) {
          here = state.lencode[hold & ((1 << state.lenbits) - 1)]; /*BITS(state.lenbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if (here_bits <= bits) {
            break;
          }
          //--- PULLBYTE() ---//
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if (here_op && (here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.lencode[last_val +
              ((hold & ((1 << (last_bits + last_op)) - 1)) /*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) {
              break;
            }
            //--- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        state.length = here_val;
        if (here_op === 0) {
          //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
          //        "inflate:         literal '%c'\n" :
          //        "inflate:         literal 0x%02x\n", here.val));
          state.mode = LIT;
          break;
        }
        if (here_op & 32) {
          //Tracevv((stderr, "inflate:         end of block\n"));
          state.back = -1;
          state.mode = TYPE;
          break;
        }
        if (here_op & 64) {
          strm.msg = 'invalid literal/length code';
          state.mode = BAD;
          break;
        }
        state.extra = here_op & 15;
        state.mode = LENEXT;
        /* falls through */
      case LENEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length += hold & ((1 << state.extra) - 1) /*BITS(state.extra)*/ ;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
        //Tracevv((stderr, "inflate:         length %u\n", state.length));
        state.was = state.length;
        state.mode = DIST;
        /* falls through */
      case DIST:
        for (;;) {
          here = state.distcode[hold & ((1 << state.distbits) - 1)]; /*BITS(state.distbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((here_bits) <= bits) {
            break;
          }
          //--- PULLBYTE() ---//
          if (have === 0) {
            break inf_leave;
          }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if ((here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.distcode[last_val +
              ((hold & ((1 << (last_bits + last_op)) - 1)) /*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) {
              break;
            }
            //--- PULLBYTE() ---//
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        if (here_op & 64) {
          strm.msg = 'invalid distance code';
          state.mode = BAD;
          break;
        }
        state.offset = here_val;
        state.extra = (here_op) & 15;
        state.mode = DISTEXT;
        /* falls through */
      case DISTEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.offset += hold & ((1 << state.extra) - 1) /*BITS(state.extra)*/ ;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
        //#ifdef INFLATE_STRICT
        if (state.offset > state.dmax) {
          strm.msg = 'invalid distance too far back';
          state.mode = BAD;
          break;
        }
        //#endif
        //Tracevv((stderr, "inflate:         distance %u\n", state.offset));
        state.mode = MATCH;
        /* falls through */
      case MATCH:
        if (left === 0) {
          break inf_leave;
        }
        copy = _out - left;
        if (state.offset > copy) { /* copy from window */
          copy = state.offset - copy;
          if (copy > state.whave) {
            if (state.sane) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD;
              break;
            }
            // (!) This block is disabled in zlib defailts,
            // don't enable it for binary compatibility
            //#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
            //          Trace((stderr, "inflate.c too far\n"));
            //          copy -= state.whave;
            //          if (copy > state.length) { copy = state.length; }
            //          if (copy > left) { copy = left; }
            //          left -= copy;
            //          state.length -= copy;
            //          do {
            //            output[put++] = 0;
            //          } while (--copy);
            //          if (state.length === 0) { state.mode = LEN; }
            //          break;
            //#endif
          }
          if (copy > state.wnext) {
            copy -= state.wnext;
            from = state.wsize - copy;
          } else {
            from = state.wnext - copy;
          }
          if (copy > state.length) {
            copy = state.length;
          }
          from_source = state.window;
        } else { /* copy from output */
          from_source = output;
          from = put - state.offset;
          copy = state.length;
        }
        if (copy > left) {
          copy = left;
        }
        left -= copy;
        state.length -= copy;
        do {
          output[put++] = from_source[from++];
        } while (--copy);
        if (state.length === 0) {
          state.mode = LEN;
        }
        break;
      case LIT:
        if (left === 0) {
          break inf_leave;
        }
        output[put++] = state.length;
        left--;
        state.mode = LEN;
        break;
      case CHECK:
        if (state.wrap) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            // Use '|' insdead of '+' to make sure that result is signed
            hold |= input[next++] << bits;
            bits += 8;
          }
          //===//
          _out -= left;
          strm.total_out += _out;
          state.total += _out;
          if (_out) {
            strm.adler = state.check =
              /*UPDATE(state.check, put - _out, _out);*/
              (state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out));

          }
          _out = left;
          // NB: crc32 stored as signed 32-bit int, zswap32 returns signed too
          if ((state.flags ? hold : zswap32(hold)) !== state.check) {
            strm.msg = 'incorrect data check';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   check matches trailer\n"));
        }
        state.mode = LENGTH;
        /* falls through */
      case LENGTH:
        if (state.wrap && state.flags) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) {
              break inf_leave;
            }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.total & 0xffffffff)) {
            strm.msg = 'incorrect length check';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   length matches trailer\n"));
        }
        state.mode = DONE;
        /* falls through */
      case DONE:
        ret = Z_STREAM_END$1;
        break inf_leave;
      case BAD:
        ret = Z_DATA_ERROR$1;
        break inf_leave;
      case MEM:
        return Z_MEM_ERROR;
      case SYNC:
        /* falls through */
      default:
        return Z_STREAM_ERROR$1;
      }
    }

  // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

  /*
     Return from inflate(), updating the total counts and the check value.
     If there was no progress during the inflate() call, return a buffer
     error.  Call updatewindow() to create and/or update the window state.
     Note: a memory error from inflate() is non-recoverable.
   */

  //--- RESTORE() ---
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  //---

  if (state.wsize || (_out !== strm.avail_out && state.mode < BAD &&
      (state.mode < CHECK || flush !== Z_FINISH$1))) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
      (state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out));
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) +
    (state.mode === TYPE ? 128 : 0) +
    (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if (((_in === 0 && _out === 0) || flush === Z_FINISH$1) && ret === Z_OK$1) {
    ret = Z_BUF_ERROR$1;
  }
  return ret;
}

function inflateEnd(strm) {

  if (!strm || !strm.state /*|| strm->zfree == (free_func)0*/ ) {
    return Z_STREAM_ERROR$1;
  }

  var state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK$1;
}

/* Not implemented
exports.inflateCopy = inflateCopy;
exports.inflateGetDictionary = inflateGetDictionary;
exports.inflateMark = inflateMark;
exports.inflatePrime = inflatePrime;
exports.inflateSync = inflateSync;
exports.inflateSyncPoint = inflateSyncPoint;
exports.inflateUndermine = inflateUndermine;
*/

// import constants from './constants';


// zlib modes
var NONE = 0;
var DEFLATE = 1;
var INFLATE = 2;
var GZIP = 3;
var GUNZIP = 4;
var DEFLATERAW = 5;
var INFLATERAW = 6;
var UNZIP = 7;
var Z_NO_FLUSH=         0,
  Z_PARTIAL_FLUSH=    1,
  Z_SYNC_FLUSH=    2,
  Z_FULL_FLUSH=       3,
  Z_FINISH=       4,
  Z_BLOCK=           5,
  Z_TREES=            6,

  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK=               0,
  Z_STREAM_END=       1,
  Z_NEED_DICT=      2,
  Z_ERRNO=       -1,
  Z_STREAM_ERROR=   -2,
  Z_DATA_ERROR=    -3,
  //Z_MEM_ERROR:     -4,
  Z_BUF_ERROR=    -5,
  //Z_VERSION_ERROR: -6,

  /* compression levels */
  Z_NO_COMPRESSION=         0,
  Z_BEST_SPEED=             1,
  Z_BEST_COMPRESSION=       9,
  Z_DEFAULT_COMPRESSION=   -1,


  Z_FILTERED=               1,
  Z_HUFFMAN_ONLY=           2,
  Z_RLE=                    3,
  Z_FIXED=                  4,
  Z_DEFAULT_STRATEGY=       0,

  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY=                 0,
  Z_TEXT=                   1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN=                2,

  /* The deflate compression method */
  Z_DEFLATED=               8;
function Zlib$1(mode) {
  if (mode < DEFLATE || mode > UNZIP)
    throw new TypeError('Bad argument');

  this.mode = mode;
  this.init_done = false;
  this.write_in_progress = false;
  this.pending_close = false;
  this.windowBits = 0;
  this.level = 0;
  this.memLevel = 0;
  this.strategy = 0;
  this.dictionary = null;
}

Zlib$1.prototype.init = function(windowBits, level, memLevel, strategy, dictionary) {
  this.windowBits = windowBits;
  this.level = level;
  this.memLevel = memLevel;
  this.strategy = strategy;
  // dictionary not supported.

  if (this.mode === GZIP || this.mode === GUNZIP)
    this.windowBits += 16;

  if (this.mode === UNZIP)
    this.windowBits += 32;

  if (this.mode === DEFLATERAW || this.mode === INFLATERAW)
    this.windowBits = -this.windowBits;

  this.strm = new ZStream();
  var status;
  switch (this.mode) {
  case DEFLATE:
  case GZIP:
  case DEFLATERAW:
    status = deflateInit2(
      this.strm,
      this.level,
      Z_DEFLATED,
      this.windowBits,
      this.memLevel,
      this.strategy
    );
    break;
  case INFLATE:
  case GUNZIP:
  case INFLATERAW:
  case UNZIP:
    status  = inflateInit2(
      this.strm,
      this.windowBits
    );
    break;
  default:
    throw new Error('Unknown mode ' + this.mode);
  }

  if (status !== Z_OK) {
    this._error(status);
    return;
  }

  this.write_in_progress = false;
  this.init_done = true;
};

Zlib$1.prototype.params = function() {
  throw new Error('deflateParams Not supported');
};

Zlib$1.prototype._writeCheck = function() {
  if (!this.init_done)
    throw new Error('write before init');

  if (this.mode === NONE)
    throw new Error('already finalized');

  if (this.write_in_progress)
    throw new Error('write already in progress');

  if (this.pending_close)
    throw new Error('close is pending');
};

Zlib$1.prototype.write = function(flush, input, in_off, in_len, out, out_off, out_len) {
  this._writeCheck();
  this.write_in_progress = true;

  var self = this;
  browser$1.nextTick(function() {
    self.write_in_progress = false;
    var res = self._write(flush, input, in_off, in_len, out, out_off, out_len);
    self.callback(res[0], res[1]);

    if (self.pending_close)
      self.close();
  });

  return this;
};

// set method for Node buffers, used by pako
function bufferSet(data, offset) {
  for (var i = 0; i < data.length; i++) {
    this[offset + i] = data[i];
  }
}

Zlib$1.prototype.writeSync = function(flush, input, in_off, in_len, out, out_off, out_len) {
  this._writeCheck();
  return this._write(flush, input, in_off, in_len, out, out_off, out_len);
};

Zlib$1.prototype._write = function(flush, input, in_off, in_len, out, out_off, out_len) {
  this.write_in_progress = true;

  if (flush !== Z_NO_FLUSH &&
      flush !== Z_PARTIAL_FLUSH &&
      flush !== Z_SYNC_FLUSH &&
      flush !== Z_FULL_FLUSH &&
      flush !== Z_FINISH &&
      flush !== Z_BLOCK) {
    throw new Error('Invalid flush value');
  }

  if (input == null) {
    input = new Buffer$1(0);
    in_len = 0;
    in_off = 0;
  }

  if (out._set)
    out.set = out._set;
  else
    out.set = bufferSet;

  var strm = this.strm;
  strm.avail_in = in_len;
  strm.input = input;
  strm.next_in = in_off;
  strm.avail_out = out_len;
  strm.output = out;
  strm.next_out = out_off;
  var status;
  switch (this.mode) {
  case DEFLATE:
  case GZIP:
  case DEFLATERAW:
    status = deflate$1(strm, flush);
    break;
  case UNZIP:
  case INFLATE:
  case GUNZIP:
  case INFLATERAW:
    status = inflate$1(strm, flush);
    break;
  default:
    throw new Error('Unknown mode ' + this.mode);
  }

  if (!this._checkError(status, strm, flush)) {
    this._error(status);
  }

  this.write_in_progress = false;
  return [strm.avail_in, strm.avail_out];
};

Zlib$1.prototype._checkError = function (status, strm, flush) {
  // Acceptable error states depend on the type of zlib stream.
  switch (status) {
    case Z_OK:
    case Z_BUF_ERROR:
      if (strm.avail_out !== 0 && flush === Z_FINISH) {
        return false
      }
      break
    case Z_STREAM_END:
      // normal statuses, not fatal
      break
    case Z_NEED_DICT:
      return false
    default:
      return false
  }

  return true
};

Zlib$1.prototype.close = function() {
  if (this.write_in_progress) {
    this.pending_close = true;
    return;
  }

  this.pending_close = false;

  if (this.mode === DEFLATE || this.mode === GZIP || this.mode === DEFLATERAW) {
    deflateEnd(this.strm);
  } else {
    inflateEnd(this.strm);
  }

  this.mode = NONE;
};
var status;
Zlib$1.prototype.reset = function() {
  switch (this.mode) {
  case DEFLATE:
  case DEFLATERAW:
    status = deflateReset(this.strm);
    break;
  case INFLATE:
  case INFLATERAW:
    status = inflateReset(this.strm);
    break;
  }

  if (status !== Z_OK) {
    this._error(status);
  }
};

Zlib$1.prototype._error = function(status) {
  this.onerror(msg[status] + ': ' + this.strm.msg, status);

  this.write_in_progress = false;
  if (this.pending_close)
    this.close();
};

var _binding = /*#__PURE__*/Object.freeze({
  __proto__: null,
  DEFLATE: DEFLATE,
  DEFLATERAW: DEFLATERAW,
  GUNZIP: GUNZIP,
  GZIP: GZIP,
  INFLATE: INFLATE,
  INFLATERAW: INFLATERAW,
  NONE: NONE,
  UNZIP: UNZIP,
  Z_BEST_COMPRESSION: Z_BEST_COMPRESSION,
  Z_BEST_SPEED: Z_BEST_SPEED,
  Z_BINARY: Z_BINARY,
  Z_BLOCK: Z_BLOCK,
  Z_BUF_ERROR: Z_BUF_ERROR,
  Z_DATA_ERROR: Z_DATA_ERROR,
  Z_DEFAULT_COMPRESSION: Z_DEFAULT_COMPRESSION,
  Z_DEFAULT_STRATEGY: Z_DEFAULT_STRATEGY,
  Z_DEFLATED: Z_DEFLATED,
  Z_ERRNO: Z_ERRNO,
  Z_FILTERED: Z_FILTERED,
  Z_FINISH: Z_FINISH,
  Z_FIXED: Z_FIXED,
  Z_FULL_FLUSH: Z_FULL_FLUSH,
  Z_HUFFMAN_ONLY: Z_HUFFMAN_ONLY,
  Z_NEED_DICT: Z_NEED_DICT,
  Z_NO_COMPRESSION: Z_NO_COMPRESSION,
  Z_NO_FLUSH: Z_NO_FLUSH,
  Z_OK: Z_OK,
  Z_PARTIAL_FLUSH: Z_PARTIAL_FLUSH,
  Z_RLE: Z_RLE,
  Z_STREAM_END: Z_STREAM_END,
  Z_STREAM_ERROR: Z_STREAM_ERROR,
  Z_SYNC_FLUSH: Z_SYNC_FLUSH,
  Z_TEXT: Z_TEXT,
  Z_TREES: Z_TREES,
  Z_UNKNOWN: Z_UNKNOWN,
  Zlib: Zlib$1
});

function assert (a, msg) {
  if (!a) {
    throw new Error(msg);
  }
}
var binding = {};
Object.keys(_binding).forEach(function (key) {
  binding[key] = _binding[key];
});
// zlib doesn't provide these, so kludge them in following the same
// const naming scheme zlib uses.
binding.Z_MIN_WINDOWBITS = 8;
binding.Z_MAX_WINDOWBITS = 15;
binding.Z_DEFAULT_WINDOWBITS = 15;

// fewer than 64 bytes per chunk is stupid.
// technically it could work with as few as 8, but even 64 bytes
// is absurdly low.  Usually a MB or more is best.
binding.Z_MIN_CHUNK = 64;
binding.Z_MAX_CHUNK = Infinity;
binding.Z_DEFAULT_CHUNK = (16 * 1024);

binding.Z_MIN_MEMLEVEL = 1;
binding.Z_MAX_MEMLEVEL = 9;
binding.Z_DEFAULT_MEMLEVEL = 8;

binding.Z_MIN_LEVEL = -1;
binding.Z_MAX_LEVEL = 9;
binding.Z_DEFAULT_LEVEL = binding.Z_DEFAULT_COMPRESSION;


// translation table for return codes.
var codes = {
  Z_OK: binding.Z_OK,
  Z_STREAM_END: binding.Z_STREAM_END,
  Z_NEED_DICT: binding.Z_NEED_DICT,
  Z_ERRNO: binding.Z_ERRNO,
  Z_STREAM_ERROR: binding.Z_STREAM_ERROR,
  Z_DATA_ERROR: binding.Z_DATA_ERROR,
  Z_MEM_ERROR: binding.Z_MEM_ERROR,
  Z_BUF_ERROR: binding.Z_BUF_ERROR,
  Z_VERSION_ERROR: binding.Z_VERSION_ERROR
};

Object.keys(codes).forEach(function(k) {
  codes[codes[k]] = k;
});

function createDeflate(o) {
  return new Deflate(o);
}

function createInflate(o) {
  return new Inflate(o);
}

function createDeflateRaw(o) {
  return new DeflateRaw(o);
}

function createInflateRaw(o) {
  return new InflateRaw(o);
}

function createGzip(o) {
  return new Gzip(o);
}

function createGunzip(o) {
  return new Gunzip(o);
}

function createUnzip(o) {
  return new Unzip(o);
}


// Convenience methods.
// compress/decompress a string or buffer in one step.
function deflate(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Deflate(opts), buffer, callback);
}

function deflateSync(buffer, opts) {
  return zlibBufferSync(new Deflate(opts), buffer);
}

function gzip(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gzip(opts), buffer, callback);
}

function gzipSync(buffer, opts) {
  return zlibBufferSync(new Gzip(opts), buffer);
}

function deflateRaw(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new DeflateRaw(opts), buffer, callback);
}

function deflateRawSync(buffer, opts) {
  return zlibBufferSync(new DeflateRaw(opts), buffer);
}

function unzip(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Unzip(opts), buffer, callback);
}

function unzipSync(buffer, opts) {
  return zlibBufferSync(new Unzip(opts), buffer);
}

function inflate(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Inflate(opts), buffer, callback);
}

function inflateSync(buffer, opts) {
  return zlibBufferSync(new Inflate(opts), buffer);
}

function gunzip(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gunzip(opts), buffer, callback);
}

function gunzipSync(buffer, opts) {
  return zlibBufferSync(new Gunzip(opts), buffer);
}

function inflateRaw(buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new InflateRaw(opts), buffer, callback);
}

function inflateRawSync(buffer, opts) {
  return zlibBufferSync(new InflateRaw(opts), buffer);
}

function zlibBuffer(engine, buffer, callback) {
  var buffers = [];
  var nread = 0;

  engine.on('error', onError);
  engine.on('end', onEnd);

  engine.end(buffer);
  flow();

  function flow() {
    var chunk;
    while (null !== (chunk = engine.read())) {
      buffers.push(chunk);
      nread += chunk.length;
    }
    engine.once('readable', flow);
  }

  function onError(err) {
    engine.removeListener('end', onEnd);
    engine.removeListener('readable', flow);
    callback(err);
  }

  function onEnd() {
    var buf = Buffer$1.concat(buffers, nread);
    buffers = [];
    callback(null, buf);
    engine.close();
  }
}

function zlibBufferSync(engine, buffer) {
  if (typeof buffer === 'string')
    buffer = new Buffer$1(buffer);
  if (!Buffer$1.isBuffer(buffer))
    throw new TypeError('Not a string or buffer');

  var flushFlag = binding.Z_FINISH;

  return engine._processChunk(buffer, flushFlag);
}

// generic zlib
// minimal 2-byte header
function Deflate(opts) {
  if (!(this instanceof Deflate)) return new Deflate(opts);
  Zlib.call(this, opts, binding.DEFLATE);
}

function Inflate(opts) {
  if (!(this instanceof Inflate)) return new Inflate(opts);
  Zlib.call(this, opts, binding.INFLATE);
}



// gzip - bigger header, same deflate compression
function Gzip(opts) {
  if (!(this instanceof Gzip)) return new Gzip(opts);
  Zlib.call(this, opts, binding.GZIP);
}

function Gunzip(opts) {
  if (!(this instanceof Gunzip)) return new Gunzip(opts);
  Zlib.call(this, opts, binding.GUNZIP);
}



// raw - no header
function DeflateRaw(opts) {
  if (!(this instanceof DeflateRaw)) return new DeflateRaw(opts);
  Zlib.call(this, opts, binding.DEFLATERAW);
}

function InflateRaw(opts) {
  if (!(this instanceof InflateRaw)) return new InflateRaw(opts);
  Zlib.call(this, opts, binding.INFLATERAW);
}


// auto-detect header.
function Unzip(opts) {
  if (!(this instanceof Unzip)) return new Unzip(opts);
  Zlib.call(this, opts, binding.UNZIP);
}


// the Zlib class they all inherit from
// This thing manages the queue of requests, and returns
// true or false if there is anything in the queue when
// you call the .write() method.

function Zlib(opts, mode) {
  this._opts = opts = opts || {};
  this._chunkSize = opts.chunkSize || binding.Z_DEFAULT_CHUNK;

  Transform.call(this, opts);

  if (opts.flush) {
    if (opts.flush !== binding.Z_NO_FLUSH &&
        opts.flush !== binding.Z_PARTIAL_FLUSH &&
        opts.flush !== binding.Z_SYNC_FLUSH &&
        opts.flush !== binding.Z_FULL_FLUSH &&
        opts.flush !== binding.Z_FINISH &&
        opts.flush !== binding.Z_BLOCK) {
      throw new Error('Invalid flush flag: ' + opts.flush);
    }
  }
  this._flushFlag = opts.flush || binding.Z_NO_FLUSH;

  if (opts.chunkSize) {
    if (opts.chunkSize < binding.Z_MIN_CHUNK ||
        opts.chunkSize > binding.Z_MAX_CHUNK) {
      throw new Error('Invalid chunk size: ' + opts.chunkSize);
    }
  }

  if (opts.windowBits) {
    if (opts.windowBits < binding.Z_MIN_WINDOWBITS ||
        opts.windowBits > binding.Z_MAX_WINDOWBITS) {
      throw new Error('Invalid windowBits: ' + opts.windowBits);
    }
  }

  if (opts.level) {
    if (opts.level < binding.Z_MIN_LEVEL ||
        opts.level > binding.Z_MAX_LEVEL) {
      throw new Error('Invalid compression level: ' + opts.level);
    }
  }

  if (opts.memLevel) {
    if (opts.memLevel < binding.Z_MIN_MEMLEVEL ||
        opts.memLevel > binding.Z_MAX_MEMLEVEL) {
      throw new Error('Invalid memLevel: ' + opts.memLevel);
    }
  }

  if (opts.strategy) {
    if (opts.strategy != binding.Z_FILTERED &&
        opts.strategy != binding.Z_HUFFMAN_ONLY &&
        opts.strategy != binding.Z_RLE &&
        opts.strategy != binding.Z_FIXED &&
        opts.strategy != binding.Z_DEFAULT_STRATEGY) {
      throw new Error('Invalid strategy: ' + opts.strategy);
    }
  }

  if (opts.dictionary) {
    if (!Buffer$1.isBuffer(opts.dictionary)) {
      throw new Error('Invalid dictionary: it should be a Buffer instance');
    }
  }

  this._binding = new binding.Zlib(mode);

  var self = this;
  this._hadError = false;
  this._binding.onerror = function(message, errno) {
    // there is no way to cleanly recover.
    // continuing only obscures problems.
    self._binding = null;
    self._hadError = true;

    var error = new Error(message);
    error.errno = errno;
    error.code = codes[errno];
    self.emit('error', error);
  };

  var level = binding.Z_DEFAULT_COMPRESSION;
  if (typeof opts.level === 'number') level = opts.level;

  var strategy = binding.Z_DEFAULT_STRATEGY;
  if (typeof opts.strategy === 'number') strategy = opts.strategy;

  this._binding.init(opts.windowBits || binding.Z_DEFAULT_WINDOWBITS,
                     level,
                     opts.memLevel || binding.Z_DEFAULT_MEMLEVEL,
                     strategy,
                     opts.dictionary);

  this._buffer = new Buffer$1(this._chunkSize);
  this._offset = 0;
  this._closed = false;
  this._level = level;
  this._strategy = strategy;

  this.once('end', this.close);
}

inherits(Zlib, Transform);

Zlib.prototype.params = function(level, strategy, callback) {
  if (level < binding.Z_MIN_LEVEL ||
      level > binding.Z_MAX_LEVEL) {
    throw new RangeError('Invalid compression level: ' + level);
  }
  if (strategy != binding.Z_FILTERED &&
      strategy != binding.Z_HUFFMAN_ONLY &&
      strategy != binding.Z_RLE &&
      strategy != binding.Z_FIXED &&
      strategy != binding.Z_DEFAULT_STRATEGY) {
    throw new TypeError('Invalid strategy: ' + strategy);
  }

  if (this._level !== level || this._strategy !== strategy) {
    var self = this;
    this.flush(binding.Z_SYNC_FLUSH, function() {
      self._binding.params(level, strategy);
      if (!self._hadError) {
        self._level = level;
        self._strategy = strategy;
        if (callback) callback();
      }
    });
  } else {
    browser$1.nextTick(callback);
  }
};

Zlib.prototype.reset = function() {
  return this._binding.reset();
};

// This is the _flush function called by the transform class,
// internally, when the last chunk has been written.
Zlib.prototype._flush = function(callback) {
  this._transform(new Buffer$1(0), '', callback);
};

Zlib.prototype.flush = function(kind, callback) {
  var ws = this._writableState;

  if (typeof kind === 'function' || (kind === void 0 && !callback)) {
    callback = kind;
    kind = binding.Z_FULL_FLUSH;
  }

  if (ws.ended) {
    if (callback)
      browser$1.nextTick(callback);
  } else if (ws.ending) {
    if (callback)
      this.once('end', callback);
  } else if (ws.needDrain) {
    var self = this;
    this.once('drain', function() {
      self.flush(callback);
    });
  } else {
    this._flushFlag = kind;
    this.write(new Buffer$1(0), '', callback);
  }
};

Zlib.prototype.close = function(callback) {
  if (callback)
    browser$1.nextTick(callback);

  if (this._closed)
    return;

  this._closed = true;

  this._binding.close();

  var self = this;
  browser$1.nextTick(function() {
    self.emit('close');
  });
};

Zlib.prototype._transform = function(chunk, encoding, cb) {
  var flushFlag;
  var ws = this._writableState;
  var ending = ws.ending || ws.ended;
  var last = ending && (!chunk || ws.length === chunk.length);

  if (!chunk === null && !Buffer$1.isBuffer(chunk))
    return cb(new Error('invalid input'));

  // If it's the last chunk, or a final flush, we use the Z_FINISH flush flag.
  // If it's explicitly flushing at some other time, then we use
  // Z_FULL_FLUSH. Otherwise, use Z_NO_FLUSH for maximum compression
  // goodness.
  if (last)
    flushFlag = binding.Z_FINISH;
  else {
    flushFlag = this._flushFlag;
    // once we've flushed the last of the queue, stop flushing and
    // go back to the normal behavior.
    if (chunk.length >= ws.length) {
      this._flushFlag = this._opts.flush || binding.Z_NO_FLUSH;
    }
  }

  this._processChunk(chunk, flushFlag, cb);
};

Zlib.prototype._processChunk = function(chunk, flushFlag, cb) {
  var availInBefore = chunk && chunk.length;
  var availOutBefore = this._chunkSize - this._offset;
  var inOff = 0;

  var self = this;

  var async = typeof cb === 'function';

  if (!async) {
    var buffers = [];
    var nread = 0;

    var error;
    this.on('error', function(er) {
      error = er;
    });

    do {
      var res = this._binding.writeSync(flushFlag,
                                        chunk, // in
                                        inOff, // in_off
                                        availInBefore, // in_len
                                        this._buffer, // out
                                        this._offset, //out_off
                                        availOutBefore); // out_len
    } while (!this._hadError && callback(res[0], res[1]));

    if (this._hadError) {
      throw error;
    }

    var buf = Buffer$1.concat(buffers, nread);
    this.close();

    return buf;
  }

  var req = this._binding.write(flushFlag,
                                chunk, // in
                                inOff, // in_off
                                availInBefore, // in_len
                                this._buffer, // out
                                this._offset, //out_off
                                availOutBefore); // out_len

  req.buffer = chunk;
  req.callback = callback;

  function callback(availInAfter, availOutAfter) {
    if (self._hadError)
      return;

    var have = availOutBefore - availOutAfter;
    assert(have >= 0, 'have should not go down');

    if (have > 0) {
      var out = self._buffer.slice(self._offset, self._offset + have);
      self._offset += have;
      // serve some output to the consumer.
      if (async) {
        self.push(out);
      } else {
        buffers.push(out);
        nread += out.length;
      }
    }

    // exhausted the output buffer, or used all the input create a new one.
    if (availOutAfter === 0 || self._offset >= self._chunkSize) {
      availOutBefore = self._chunkSize;
      self._offset = 0;
      self._buffer = new Buffer$1(self._chunkSize);
    }

    if (availOutAfter === 0) {
      // Not actually done.  Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
      inOff += (availInBefore - availInAfter);
      availInBefore = availInAfter;

      if (!async)
        return true;

      var newReq = self._binding.write(flushFlag,
                                       chunk,
                                       inOff,
                                       availInBefore,
                                       self._buffer,
                                       self._offset,
                                       self._chunkSize);
      newReq.callback = callback; // this same function
      newReq.buffer = chunk;
      return;
    }

    if (!async)
      return false;

    // finished with the chunk.
    cb();
  }
};

inherits(Deflate, Zlib);
inherits(Inflate, Zlib);
inherits(Gzip, Zlib);
inherits(Gunzip, Zlib);
inherits(DeflateRaw, Zlib);
inherits(InflateRaw, Zlib);
inherits(Unzip, Zlib);
var zlib = {
  codes: codes,
  createDeflate: createDeflate,
  createInflate: createInflate,
  createDeflateRaw: createDeflateRaw,
  createInflateRaw: createInflateRaw,
  createGzip: createGzip,
  createGunzip: createGunzip,
  createUnzip: createUnzip,
  deflate: deflate,
  deflateSync: deflateSync,
  gzip: gzip,
  gzipSync: gzipSync,
  deflateRaw: deflateRaw,
  deflateRawSync: deflateRawSync,
  unzip: unzip,
  unzipSync: unzipSync,
  inflate: inflate,
  inflateSync: inflateSync,
  gunzip: gunzip,
  gunzipSync: gunzipSync,
  inflateRaw: inflateRaw,
  inflateRawSync: inflateRawSync,
  Deflate: Deflate,
  Inflate: Inflate,
  Gzip: Gzip,
  Gunzip: Gunzip,
  DeflateRaw: DeflateRaw,
  InflateRaw: InflateRaw,
  Unzip: Unzip,
  Zlib: Zlib
};

class S3Cache extends Cache {
  constructor({
    client,
    keyPrefix = "cache",
    ttl = 0,
    prefix = void 0
  }) {
    super({ client, keyPrefix, ttl, prefix });
    this.client = client;
    this.keyPrefix = keyPrefix;
    this.config.ttl = ttl;
    this.config.client = client;
    this.config.prefix = prefix !== void 0 ? prefix : keyPrefix + (keyPrefix.endsWith("/") ? "" : "/");
  }
  async _set(key, data) {
    let body = JSON.stringify(data);
    const lengthSerialized = body.length;
    body = zlib.gzipSync(body).toString("base64");
    return this.client.putObject({
      key: join(this.keyPrefix, key),
      body,
      contentEncoding: "gzip",
      contentType: "application/gzip",
      metadata: {
        compressor: "zlib",
        compressed: "true",
        "client-id": this.client.id,
        "length-serialized": String(lengthSerialized),
        "length-compressed": String(body.length),
        "compression-gain": (body.length / lengthSerialized).toFixed(2)
      }
    });
  }
  async _get(key) {
    try {
      const { Body } = await this.client.getObject(join(this.keyPrefix, key));
      let content = await streamToString(Body);
      content = Buffer.from(content, "base64");
      content = zlib.unzipSync(content).toString();
      return JSON.parse(content);
    } catch (error) {
      if (error.name === "NoSuchKey" || error.name === "NotFound") {
        return null;
      }
      throw error;
    }
  }
  async _del(key) {
    await this.client.deleteObject(join(this.keyPrefix, key));
    return true;
  }
  async _clear() {
    const keys = await this.client.getAllKeys({
      prefix: this.keyPrefix
    });
    for (const key of keys) {
      await this.client.deleteObject(key);
    }
  }
  async size() {
    const keys = await this.keys();
    return keys.length;
  }
  async keys() {
    const allKeys = await this.client.getAllKeys({ prefix: this.keyPrefix });
    const prefix = this.keyPrefix.endsWith("/") ? this.keyPrefix : this.keyPrefix + "/";
    return allKeys.map((k) => k.startsWith(prefix) ? k.slice(prefix.length) : k);
  }
}

class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = /* @__PURE__ */ new Map();
  }
  async setup(database) {
    this.database = database;
    this.beforeSetup();
    await this.onSetup();
    this.afterSetup();
  }
  async start() {
    this.beforeStart();
    await this.onStart();
    this.afterStart();
  }
  async stop() {
    this.beforeStop();
    await this.onStop();
    this.afterStop();
  }
  // Override these methods in subclasses
  async onSetup() {
  }
  async onStart() {
  }
  async onStop() {
  }
  // Hook management methods
  addHook(resource, event, handler) {
    if (!this.hooks.has(resource)) {
      this.hooks.set(resource, /* @__PURE__ */ new Map());
    }
    const resourceHooks = this.hooks.get(resource);
    if (!resourceHooks.has(event)) {
      resourceHooks.set(event, []);
    }
    resourceHooks.get(event).push(handler);
  }
  removeHook(resource, event, handler) {
    const resourceHooks = this.hooks.get(resource);
    if (resourceHooks && resourceHooks.has(event)) {
      const handlers = resourceHooks.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
  // Enhanced resource method wrapping that supports multiple plugins
  wrapResourceMethod(resource, methodName, wrapper) {
    const originalMethod = resource[methodName];
    if (!resource._pluginWrappers) {
      resource._pluginWrappers = /* @__PURE__ */ new Map();
    }
    if (!resource._pluginWrappers.has(methodName)) {
      resource._pluginWrappers.set(methodName, []);
    }
    resource._pluginWrappers.get(methodName).push(wrapper);
    if (!resource[`_wrapped_${methodName}`]) {
      resource[`_wrapped_${methodName}`] = originalMethod;
      const isJestMock = originalMethod && originalMethod._isMockFunction;
      resource[methodName] = async function(...args) {
        let result = await resource[`_wrapped_${methodName}`](...args);
        for (const wrapper2 of resource._pluginWrappers.get(methodName)) {
          result = await wrapper2.call(this, result, args, methodName);
        }
        return result;
      };
      if (isJestMock) {
        Object.setPrototypeOf(resource[methodName], Object.getPrototypeOf(originalMethod));
        Object.assign(resource[methodName], originalMethod);
      }
    }
  }
  // Partition-aware helper methods
  getPartitionValues(data, resource) {
    if (!resource.config?.partitions) return {};
    const partitionValues = {};
    for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
      if (partitionDef.fields) {
        partitionValues[partitionName] = {};
        for (const [fieldName, rule] of Object.entries(partitionDef.fields)) {
          const value = this.getNestedFieldValue(data, fieldName);
          if (value !== null && value !== void 0) {
            partitionValues[partitionName][fieldName] = resource.applyPartitionRule(value, rule);
          }
        }
      } else {
        partitionValues[partitionName] = {};
      }
    }
    return partitionValues;
  }
  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath] ?? null;
    }
    const keys = fieldPath.split(".");
    let value = data;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value ?? null;
  }
  // Event emission methods
  beforeSetup() {
    this.emit("plugin.beforeSetup", /* @__PURE__ */ new Date());
  }
  afterSetup() {
    this.emit("plugin.afterSetup", /* @__PURE__ */ new Date());
  }
  beforeStart() {
    this.emit("plugin.beforeStart", /* @__PURE__ */ new Date());
  }
  afterStart() {
    this.emit("plugin.afterStart", /* @__PURE__ */ new Date());
  }
  beforeStop() {
    this.emit("plugin.beforeStop", /* @__PURE__ */ new Date());
  }
  afterStop() {
    this.emit("plugin.afterStop", /* @__PURE__ */ new Date());
  }
}

const PluginObject = {
  setup(database) {
  },
  start() {
  },
  stop() {
  }
};

class AuditPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.auditResource = null;
    this.config = {
      enabled: options.enabled !== false,
      includeData: options.includeData !== false,
      includePartitions: options.includePartitions !== false,
      maxDataSize: options.maxDataSize || 1e4,
      // 10KB limit
      ...options
    };
  }
  async onSetup() {
    if (!this.config.enabled) {
      this.auditResource = null;
      return;
    }
    try {
      this.auditResource = await this.database.createResource({
        name: "audits",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          recordId: "string|required",
          userId: "string|optional",
          timestamp: "string|required",
          oldData: "string|optional",
          newData: "string|optional",
          partition: "string|optional",
          partitionValues: "string|optional",
          metadata: "string|optional"
        }
      });
    } catch (error) {
      try {
        this.auditResource = this.database.resources.audits;
      } catch (innerError) {
        this.auditResource = null;
        return;
      }
    }
    this.installDatabaseProxy();
    this.installResourceHooks();
  }
  async onStart() {
  }
  async onStop() {
  }
  installDatabaseProxy() {
    if (this.database._auditProxyInstalled) {
      return;
    }
    const installResourceHooksForResource = this.installResourceHooksForResource.bind(this);
    this.database._originalCreateResource = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._originalCreateResource(...args);
      if (resource.name !== "audit_logs") {
        installResourceHooksForResource(resource);
      }
      return resource;
    };
    this.database._auditProxyInstalled = true;
  }
  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === "audits") continue;
      this.installResourceHooksForResource(resource);
    }
  }
  installResourceHooksForResource(resource) {
    this.wrapResourceMethod(resource, "insert", async (result, args, methodName) => {
      const [data] = args;
      const recordId = data.id || result.id || "auto-generated";
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceName: resource.name,
        operation: "insert",
        recordId,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: null,
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(data)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "update", async (result, args, methodName) => {
      const [id, data] = args;
      let oldData = null;
      if (this.config.includeData) {
        try {
          oldData = await resource.get(id);
        } catch (error) {
        }
      }
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(result, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceName: resource.name,
        operation: "update",
        recordId: id,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: oldData && this.config.includeData === false ? null : oldData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(result)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "delete", async (result, args, methodName) => {
      const [id] = args;
      let oldData = null;
      if (this.config.includeData) {
        try {
          oldData = await resource.get(id);
        } catch (error) {
        }
      }
      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceName: resource.name,
        operation: "delete",
        recordId: id,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: oldData && this.config.includeData === false ? null : oldData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: null,
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "deleteMany", async (result, args, methodName) => {
      const [ids] = args;
      const auditRecords = [];
      if (this.config.includeData) {
        for (const id of ids) {
          try {
            const oldData = await resource.get(id);
            const partitionValues = this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
            auditRecords.push({
              id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              resourceName: resource.name,
              operation: "delete",
              recordId: id,
              userId: this.getCurrentUserId?.() || "system",
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              oldData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(oldData)),
              newData: null,
              partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
              partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
              metadata: JSON.stringify({
                source: "audit-plugin",
                version: "2.0",
                batchOperation: true
              })
            });
          } catch (error) {
          }
        }
      }
      for (const auditRecord of auditRecords) {
        this.logAudit(auditRecord).catch(console.error);
      }
      return result;
    });
  }
  getPartitionValues(data, resource) {
    const partitions = resource.config?.partitions || {};
    const partitionValues = {};
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (partitionDef.fields) {
        const partitionData = {};
        for (const [fieldName, fieldRule] of Object.entries(partitionDef.fields)) {
          const fieldValue = this.getNestedFieldValue(data, fieldName);
          if (fieldValue !== void 0 && fieldValue !== null) {
            partitionData[fieldName] = fieldValue;
          }
        }
        if (Object.keys(partitionData).length > 0) {
          partitionValues[partitionName] = partitionData;
        }
      }
    }
    return partitionValues;
  }
  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath];
    }
    const keys = fieldPath.split(".");
    let currentLevel = data;
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return void 0;
      }
      currentLevel = currentLevel[key];
    }
    return currentLevel;
  }
  getPrimaryPartition(partitionValues) {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? partitionNames[0] : null;
  }
  async logAudit(auditRecord) {
    if (!this.auditResource) return;
    try {
      await this.auditResource.insert(auditRecord);
    } catch (error) {
      console.error("Failed to log audit record:", error);
      if (error && error.stack) console.error(error.stack);
    }
  }
  truncateData(data) {
    if (!data) return data;
    const dataStr = JSON.stringify(data);
    if (dataStr.length <= this.config.maxDataSize) {
      return data;
    }
    return {
      ...data,
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // Utility methods for querying audit logs
  async getAuditLogs(options = {}) {
    if (!this.auditResource) return [];
    try {
      const {
        resourceName,
        operation,
        recordId,
        userId,
        partition,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = options;
      const allAudits = await this.auditResource.getAll();
      let filtered = allAudits.filter((audit) => {
        if (resourceName && audit.resourceName !== resourceName) return false;
        if (operation && audit.operation !== operation) return false;
        if (recordId && audit.recordId !== recordId) return false;
        if (userId && audit.userId !== userId) return false;
        if (partition && audit.partition !== partition) return false;
        if (startDate && new Date(audit.timestamp) < new Date(startDate)) return false;
        if (endDate && new Date(audit.timestamp) > new Date(endDate)) return false;
        return true;
      });
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const deserialized = filtered.slice(offset, offset + limit).map((audit) => ({
        ...audit,
        oldData: audit.oldData ? JSON.parse(audit.oldData) : null,
        newData: audit.newData ? JSON.parse(audit.newData) : null,
        partitionValues: audit.partitionValues ? JSON.parse(audit.partitionValues) : null,
        metadata: audit.metadata ? JSON.parse(audit.metadata) : null
      }));
      return deserialized;
    } catch (error) {
      console.error("Failed to get audit logs:", error);
      if (error && error.stack) console.error(error.stack);
      return [];
    }
  }
  async getRecordHistory(resourceName, recordId) {
    return this.getAuditLogs({
      resourceName,
      recordId,
      limit: 1e3
    });
  }
  async getPartitionHistory(resourceName, partitionName, partitionValues) {
    return this.getAuditLogs({
      resourceName,
      partition: partitionName,
      limit: 1e3
    });
  }
  async getAuditStats(options = {}) {
    const {
      resourceName,
      startDate,
      endDate
    } = options;
    const allAudits = await this.getAuditLogs({
      resourceName,
      startDate,
      endDate,
      limit: 1e4
    });
    const stats = {
      total: allAudits.length,
      byOperation: {},
      byResource: {},
      byPartition: {},
      byUser: {},
      timeline: {}
    };
    for (const audit of allAudits) {
      stats.byOperation[audit.operation] = (stats.byOperation[audit.operation] || 0) + 1;
      stats.byResource[audit.resourceName] = (stats.byResource[audit.resourceName] || 0) + 1;
      if (audit.partition) {
        stats.byPartition[audit.partition] = (stats.byPartition[audit.partition] || 0) + 1;
      }
      stats.byUser[audit.userId] = (stats.byUser[audit.userId] || 0) + 1;
      const day = audit.timestamp.split("T")[0];
      stats.timeline[day] = (stats.timeline[day] || 0) + 1;
    }
    return stats;
  }
}

class CachePlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.driver = options.driver;
    this.config = {
      enabled: options.enabled !== false,
      includePartitions: options.includePartitions !== false,
      ...options
    };
  }
  async setup(database) {
    if (!this.config.enabled) {
      return;
    }
    await super.setup(database);
  }
  async onSetup() {
    if (this.config.driver) {
      this.driver = this.config.driver;
    } else if (this.config.driverType === "memory") {
      this.driver = new MemoryCache(this.config.memoryOptions || {});
    } else {
      this.driver = new S3Cache(this.config.s3Options || {});
    }
    this.installDatabaseProxy();
    this.installResourceHooks();
  }
  async onStart() {
  }
  async onStop() {
  }
  installDatabaseProxy() {
    if (this.database._cacheProxyInstalled) {
      return;
    }
    const installResourceHooks = this.installResourceHooks.bind(this);
    this.database._originalCreateResourceForCache = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._originalCreateResourceForCache(...args);
      installResourceHooks(resource);
      return resource;
    };
    this.database._cacheProxyInstalled = true;
  }
  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      this.installResourceHooksForResource(resource);
    }
  }
  installResourceHooksForResource(resource) {
    if (!this.driver) return;
    resource.cache = this.driver;
    resource.cacheKeyFor = async (options = {}) => {
      const { action, params = {}, partition, partitionValues } = options;
      return this.generateCacheKey(resource, action, params, partition, partitionValues);
    };
    resource._originalCount = resource.count;
    resource._originalListIds = resource.listIds;
    resource._originalGetMany = resource.getMany;
    resource._originalGetAll = resource.getAll;
    resource._originalPage = resource.page;
    resource._originalList = resource.list;
    resource.count = async function(options = {}) {
      const { partition, partitionValues } = options;
      const key = await resource.cacheKeyFor({
        action: "count",
        partition,
        partitionValues
      });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalCount(options);
      await resource.cache.set(key, result);
      return result;
    };
    resource.listIds = async function(options = {}) {
      const { partition, partitionValues } = options;
      const key = await resource.cacheKeyFor({
        action: "listIds",
        partition,
        partitionValues
      });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalListIds(options);
      await resource.cache.set(key, result);
      return result;
    };
    resource.getMany = async function(ids) {
      const key = await resource.cacheKeyFor({
        action: "getMany",
        params: { ids }
      });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalGetMany(ids);
      await resource.cache.set(key, result);
      return result;
    };
    resource.getAll = async function() {
      const key = await resource.cacheKeyFor({ action: "getAll" });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalGetAll();
      await resource.cache.set(key, result);
      return result;
    };
    resource.page = async function({ offset, size, partition, partitionValues } = {}) {
      const key = await resource.cacheKeyFor({
        action: "page",
        params: { offset, size },
        partition,
        partitionValues
      });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalPage({ offset, size, partition, partitionValues });
      await resource.cache.set(key, result);
      return result;
    };
    resource.list = async function(options = {}) {
      const { partition, partitionValues } = options;
      const key = await resource.cacheKeyFor({
        action: "list",
        partition,
        partitionValues
      });
      try {
        const cached = await resource.cache.get(key);
        if (cached !== null && cached !== void 0) return cached;
      } catch (err) {
        if (err.name !== "NoSuchKey") throw err;
      }
      const result = await resource._originalList(options);
      await resource.cache.set(key, result);
      return result;
    };
    this.wrapResourceMethod(resource, "insert", async (result, args, methodName) => {
      const [data] = args;
      await this.clearCacheForResource(resource, data);
      return result;
    });
    this.wrapResourceMethod(resource, "update", async (result, args, methodName) => {
      const [id, data] = args;
      await this.clearCacheForResource(resource, { id, ...data });
      return result;
    });
    this.wrapResourceMethod(resource, "delete", async (result, args, methodName) => {
      const [id] = args;
      let data = { id };
      if (typeof resource.get === "function") {
        try {
          const full = await resource.get(id);
          if (full) data = full;
        } catch {
        }
      }
      await this.clearCacheForResource(resource, data);
      return result;
    });
    this.wrapResourceMethod(resource, "deleteMany", async (result, args, methodName) => {
      const [ids] = args;
      for (const id of ids) {
        let data = { id };
        if (typeof resource.get === "function") {
          try {
            const full = await resource.get(id);
            if (full) data = full;
          } catch {
          }
        }
        await this.clearCacheForResource(resource, data);
      }
      return result;
    });
  }
  async clearCacheForResource(resource, data) {
    if (!resource.cache) return;
    const keyPrefix = `resource=${resource.name}`;
    await resource.cache.clear(keyPrefix);
    if (this.config.includePartitions === true && resource.config?.partitions && Object.keys(resource.config.partitions).length > 0) {
      const partitionValues = this.getPartitionValues(data, resource);
      for (const [partitionName, values] of Object.entries(partitionValues)) {
        if (values && Object.keys(values).length > 0 && Object.values(values).some((v) => v !== null && v !== void 0)) {
          const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
          await resource.cache.clear(partitionKeyPrefix);
        }
      }
    }
  }
  async generateCacheKey(resource, action, params = {}, partition = null, partitionValues = null) {
    const keyParts = [
      `resource=${resource.name}`,
      `action=${action}`
    ];
    if (partition && partitionValues && Object.keys(partitionValues).length > 0) {
      keyParts.push(`partition:${partition}`);
      for (const [field, value] of Object.entries(partitionValues)) {
        if (value !== null && value !== void 0) {
          keyParts.push(`${field}:${value}`);
        }
      }
    }
    if (Object.keys(params).length > 0) {
      const paramsHash = await this.hashParams(params);
      keyParts.push(paramsHash);
    }
    return join(...keyParts) + ".json.gz";
  }
  async hashParams(params) {
    const sortedParams = Object.keys(params).sort().map((key) => `${key}:${params[key]}`).join("|") || "empty";
    return await sha256(sortedParams);
  }
  // Utility methods
  async getCacheStats() {
    if (!this.driver) return null;
    return {
      size: await this.driver.size(),
      keys: await this.driver.keys(),
      driver: this.driver.constructor.name
    };
  }
  async clearAllCache() {
    if (!this.driver) return;
    for (const resource of Object.values(this.database.resources)) {
      if (resource.cache) {
        const keyPrefix = `resource=${resource.name}`;
        await resource.cache.clear(keyPrefix);
      }
    }
  }
  async warmCache(resourceName, options = {}) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    const { includePartitions = true } = options;
    await resource.getAll();
    if (includePartitions && resource.config.partitions) {
      for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
        if (partitionDef.fields) {
          const allRecords = await resource.getAll();
          const recordsArray = Array.isArray(allRecords) ? allRecords : [];
          const partitionValues = /* @__PURE__ */ new Set();
          for (const record of recordsArray.slice(0, 10)) {
            const values = this.getPartitionValues(record, resource);
            if (values[partitionName]) {
              partitionValues.add(JSON.stringify(values[partitionName]));
            }
          }
          for (const partitionValueStr of partitionValues) {
            const partitionValues2 = JSON.parse(partitionValueStr);
            await resource.list({ partition: partitionName, partitionValues: partitionValues2 });
          }
        }
      }
    }
  }
}

const CostsPlugin = {
  async setup(db) {
    if (!db || !db.client) {
      return;
    }
    this.client = db.client;
    this.map = {
      PutObjectCommand: "put",
      GetObjectCommand: "get",
      HeadObjectCommand: "head",
      DeleteObjectCommand: "delete",
      DeleteObjectsCommand: "delete",
      ListObjectsV2Command: "list"
    };
    this.costs = {
      total: 0,
      prices: {
        put: 5e-3 / 1e3,
        copy: 5e-3 / 1e3,
        list: 5e-3 / 1e3,
        post: 5e-3 / 1e3,
        get: 4e-4 / 1e3,
        select: 4e-4 / 1e3,
        delete: 4e-4 / 1e3,
        head: 4e-4 / 1e3
      },
      requests: {
        total: 0,
        put: 0,
        post: 0,
        copy: 0,
        list: 0,
        get: 0,
        select: 0,
        delete: 0,
        head: 0
      },
      events: {
        total: 0,
        PutObjectCommand: 0,
        GetObjectCommand: 0,
        HeadObjectCommand: 0,
        DeleteObjectCommand: 0,
        DeleteObjectsCommand: 0,
        ListObjectsV2Command: 0
      }
    };
    this.client.costs = JSON.parse(JSON.stringify(this.costs));
  },
  async start() {
    if (this.client) {
      this.client.on("command.response", (name) => this.addRequest(name, this.map[name]));
      this.client.on("command.error", (name) => this.addRequest(name, this.map[name]));
    }
  },
  addRequest(name, method) {
    if (!method) return;
    this.costs.events[name]++;
    this.costs.events.total++;
    this.costs.requests.total++;
    this.costs.requests[method]++;
    this.costs.total += this.costs.prices[method];
    if (this.client && this.client.costs) {
      this.client.costs.events[name]++;
      this.client.costs.events.total++;
      this.client.costs.requests.total++;
      this.client.costs.requests[method]++;
      this.client.costs.total += this.client.costs.prices[method];
    }
  }
};

class FullTextPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.indexResource = null;
    this.config = {
      enabled: options.enabled !== false,
      minWordLength: options.minWordLength || 3,
      maxResults: options.maxResults || 100,
      ...options
    };
    this.indexes = /* @__PURE__ */ new Map();
  }
  async setup(database) {
    this.database = database;
    if (!this.config.enabled) return;
    try {
      this.indexResource = await database.createResource({
        name: "fulltext_indexes",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          fieldName: "string|required",
          word: "string|required",
          recordIds: "json|required",
          // Array of record IDs containing this word
          count: "number|required",
          lastUpdated: "string|required"
        }
      });
    } catch (error) {
      this.indexResource = database.resources.fulltext_indexes;
    }
    await this.loadIndexes();
    this.installIndexingHooks();
  }
  async start() {
  }
  async stop() {
    await this.saveIndexes();
  }
  async loadIndexes() {
    if (!this.indexResource) return;
    try {
      const allIndexes = await this.indexResource.getAll();
      for (const indexRecord of allIndexes) {
        const key = `${indexRecord.resourceName}:${indexRecord.fieldName}:${indexRecord.word}`;
        this.indexes.set(key, {
          recordIds: indexRecord.recordIds || [],
          count: indexRecord.count || 0
        });
      }
    } catch (error) {
      console.warn("Failed to load existing indexes:", error.message);
    }
  }
  async saveIndexes() {
    if (!this.indexResource) return;
    try {
      const existingIndexes = await this.indexResource.getAll();
      for (const index of existingIndexes) {
        await this.indexResource.delete(index.id);
      }
      for (const [key, data] of this.indexes.entries()) {
        const [resourceName, fieldName, word] = key.split(":");
        await this.indexResource.insert({
          id: `index-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          resourceName,
          fieldName,
          word,
          recordIds: data.recordIds,
          count: data.count,
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (error) {
      console.error("Failed to save indexes:", error);
    }
  }
  installIndexingHooks() {
    if (!this.database.plugins) {
      this.database.plugins = {};
    }
    this.database.plugins.fulltext = this;
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === "fulltext_indexes") continue;
      this.installResourceHooks(resource);
    }
    if (!this.database._fulltextProxyInstalled) {
      this.database._previousCreateResourceForFullText = this.database.createResource;
      this.database.createResource = async function(...args) {
        const resource = await this._previousCreateResourceForFullText(...args);
        if (this.plugins?.fulltext && resource.name !== "fulltext_indexes") {
          this.plugins.fulltext.installResourceHooks(resource);
        }
        return resource;
      };
      this.database._fulltextProxyInstalled = true;
    }
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== "fulltext_indexes") {
        this.installResourceHooks(resource);
      }
    }
  }
  installResourceHooks(resource) {
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    this.wrapResourceMethod(resource, "insert", async (result, args, methodName) => {
      const [data] = args;
      this.indexRecord(resource.name, result.id, data).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "update", async (result, args, methodName) => {
      const [id, data] = args;
      this.removeRecordFromIndex(resource.name, id).catch(console.error);
      this.indexRecord(resource.name, id, result).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "delete", async (result, args, methodName) => {
      const [id] = args;
      this.removeRecordFromIndex(resource.name, id).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "deleteMany", async (result, args, methodName) => {
      const [ids] = args;
      for (const id of ids) {
        this.removeRecordFromIndex(resource.name, id).catch(console.error);
      }
      return result;
    });
  }
  async indexRecord(resourceName, recordId, data) {
    const indexedFields = this.getIndexedFields(resourceName);
    if (!indexedFields || indexedFields.length === 0) return;
    for (const fieldName of indexedFields) {
      const fieldValue = this.getFieldValue(data, fieldName);
      if (!fieldValue) continue;
      const words = this.tokenize(fieldValue);
      for (const word of words) {
        if (word.length < this.config.minWordLength) continue;
        const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
        const existing = this.indexes.get(key) || { recordIds: [], count: 0 };
        if (!existing.recordIds.includes(recordId)) {
          existing.recordIds.push(recordId);
          existing.count = existing.recordIds.length;
        }
        this.indexes.set(key, existing);
      }
    }
  }
  async removeRecordFromIndex(resourceName, recordId) {
    for (const [key, data] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        const index = data.recordIds.indexOf(recordId);
        if (index > -1) {
          data.recordIds.splice(index, 1);
          data.count = data.recordIds.length;
          if (data.recordIds.length === 0) {
            this.indexes.delete(key);
          } else {
            this.indexes.set(key, data);
          }
        }
      }
    }
  }
  getFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath];
    }
    const keys = fieldPath.split(".");
    let value = data;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value;
  }
  tokenize(text) {
    if (!text) return [];
    const str = String(text).toLowerCase();
    return str.replace(/[^\w\s\u00C0-\u017F]/g, " ").split(/\s+/).filter((word) => word.length > 0);
  }
  getIndexedFields(resourceName) {
    if (this.config.fields) {
      return this.config.fields;
    }
    const fieldMappings = {
      users: ["name", "email"],
      products: ["name", "description"],
      articles: ["title", "content"]
      // Add more mappings as needed
    };
    return fieldMappings[resourceName] || [];
  }
  // Main search method
  async search(resourceName, query, options = {}) {
    const {
      fields = null,
      // Specific fields to search in
      limit = this.config.maxResults,
      offset = 0,
      exactMatch = false
    } = options;
    if (!query || query.trim().length === 0) {
      return [];
    }
    const searchWords = this.tokenize(query);
    const results = /* @__PURE__ */ new Map();
    const searchFields = fields || this.getIndexedFields(resourceName);
    if (searchFields.length === 0) {
      return [];
    }
    for (const word of searchWords) {
      if (word.length < this.config.minWordLength) continue;
      for (const fieldName of searchFields) {
        if (exactMatch) {
          const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
          const indexData = this.indexes.get(key);
          if (indexData) {
            for (const recordId of indexData.recordIds) {
              const currentScore = results.get(recordId) || 0;
              results.set(recordId, currentScore + 1);
            }
          }
        } else {
          for (const [key, indexData] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:${fieldName}:${word.toLowerCase()}`)) {
              for (const recordId of indexData.recordIds) {
                const currentScore = results.get(recordId) || 0;
                results.set(recordId, currentScore + 1);
              }
            }
          }
        }
      }
    }
    const sortedResults = Array.from(results.entries()).map(([recordId, score]) => ({ recordId, score })).sort((a, b) => b.score - a.score).slice(offset, offset + limit);
    return sortedResults;
  }
  // Search and return full records
  async searchRecords(resourceName, query, options = {}) {
    const searchResults = await this.search(resourceName, query, options);
    if (searchResults.length === 0) {
      return [];
    }
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    const recordIds = searchResults.map((result) => result.recordId);
    const records = await resource.getMany(recordIds);
    return records.map((record) => {
      const searchResult = searchResults.find((sr) => sr.recordId === record.id);
      return {
        ...record,
        _searchScore: searchResult ? searchResult.score : 0
      };
    }).sort((a, b) => b._searchScore - a._searchScore);
  }
  // Utility methods
  async rebuildIndex(resourceName) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }
    const allRecords = await resource.getAll();
    const batchSize = 100;
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      for (const record of batch) {
        await this.indexRecord(resourceName, record.id, record);
      }
    }
    await this.saveIndexes();
  }
  async getIndexStats() {
    const stats = {
      totalIndexes: this.indexes.size,
      resources: {},
      totalWords: 0
    };
    for (const [key, data] of this.indexes.entries()) {
      const [resourceName, fieldName] = key.split(":");
      if (!stats.resources[resourceName]) {
        stats.resources[resourceName] = {
          fields: {},
          totalRecords: /* @__PURE__ */ new Set(),
          totalWords: 0
        };
      }
      if (!stats.resources[resourceName].fields[fieldName]) {
        stats.resources[resourceName].fields[fieldName] = {
          words: 0,
          totalOccurrences: 0
        };
      }
      stats.resources[resourceName].fields[fieldName].words++;
      stats.resources[resourceName].fields[fieldName].totalOccurrences += data.count;
      stats.resources[resourceName].totalWords++;
      for (const recordId of data.recordIds) {
        stats.resources[resourceName].totalRecords.add(recordId);
      }
      stats.totalWords++;
    }
    for (const resourceName in stats.resources) {
      stats.resources[resourceName].totalRecords = stats.resources[resourceName].totalRecords.size;
    }
    return stats;
  }
  async rebuildAllIndexes({ timeout } = {}) {
    if (timeout) {
      return Promise.race([
        this._rebuildAllIndexesInternal(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
      ]);
    }
    return this._rebuildAllIndexesInternal();
  }
  async _rebuildAllIndexesInternal() {
    const resourceNames = Object.keys(this.database.resources).filter((name) => name !== "fulltext_indexes");
    for (const resourceName of resourceNames) {
      try {
        await this.rebuildIndex(resourceName);
      } catch (error) {
        console.warn(`Failed to rebuild index for resource ${resourceName}:`, error.message);
      }
    }
  }
  async clearIndex(resourceName) {
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }
    await this.saveIndexes();
  }
  async clearAllIndexes() {
    this.indexes.clear();
    await this.saveIndexes();
  }
}

class MetricsPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      collectPerformance: options.collectPerformance !== false,
      collectErrors: options.collectErrors !== false,
      collectUsage: options.collectUsage !== false,
      retentionDays: options.retentionDays || 30,
      flushInterval: options.flushInterval || 6e4,
      // 1 minute
      ...options
    };
    this.metrics = {
      operations: {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      },
      resources: {},
      errors: [],
      performance: [],
      startTime: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.flushTimer = null;
  }
  async setup(database) {
    this.database = database;
    if (!this.config.enabled || process.env.NODE_ENV === "test") return;
    try {
      this.metricsResource = await database.createResource({
        name: "metrics",
        attributes: {
          id: "string|required",
          type: "string|required",
          // 'operation', 'error', 'performance'
          resourceName: "string",
          operation: "string",
          count: "number|required",
          totalTime: "number|required",
          errors: "number|required",
          avgTime: "number|required",
          timestamp: "string|required",
          metadata: "json"
        }
      });
      this.errorsResource = await database.createResource({
        name: "error_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          error: "string|required",
          timestamp: "string|required",
          metadata: "json"
        }
      });
      this.performanceResource = await database.createResource({
        name: "performance_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          duration: "number|required",
          timestamp: "string|required",
          metadata: "json"
        }
      });
    } catch (error) {
      this.metricsResource = database.resources.metrics;
      this.errorsResource = database.resources.error_logs;
      this.performanceResource = database.resources.performance_logs;
    }
    this.installMetricsHooks();
    if (process.env.NODE_ENV !== "test") {
      this.startFlushTimer();
    }
  }
  async start() {
  }
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (process.env.NODE_ENV !== "test") {
      await this.flushMetrics();
    }
  }
  installMetricsHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (["metrics", "error_logs", "performance_logs"].includes(resource.name)) {
        continue;
      }
      this.installResourceHooks(resource);
    }
    this.database._createResource = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._createResource(...args);
      if (this.plugins?.metrics && !["metrics", "error_logs", "performance_logs"].includes(resource.name)) {
        this.plugins.metrics.installResourceHooks(resource);
      }
      return resource;
    };
  }
  installResourceHooks(resource) {
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    resource._get = resource.get;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._list = resource.list;
    resource._listIds = resource.listIds;
    resource._count = resource.count;
    resource._page = resource.page;
    resource.insert = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._insert(...args);
        this.recordOperation(resource.name, "insert", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "insert", Date.now() - startTime, true);
        this.recordError(resource.name, "insert", error);
        throw error;
      }
    }.bind(this);
    resource.update = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._update(...args);
        this.recordOperation(resource.name, "update", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "update", Date.now() - startTime, true);
        this.recordError(resource.name, "update", error);
        throw error;
      }
    }.bind(this);
    resource.delete = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._delete(...args);
        this.recordOperation(resource.name, "delete", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "delete", Date.now() - startTime, true);
        this.recordError(resource.name, "delete", error);
        throw error;
      }
    }.bind(this);
    resource.deleteMany = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._deleteMany(...args);
        this.recordOperation(resource.name, "delete", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "delete", Date.now() - startTime, true);
        this.recordError(resource.name, "delete", error);
        throw error;
      }
    }.bind(this);
    resource.get = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._get(...args);
        this.recordOperation(resource.name, "get", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "get", Date.now() - startTime, true);
        this.recordError(resource.name, "get", error);
        throw error;
      }
    }.bind(this);
    resource.getMany = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._getMany(...args);
        this.recordOperation(resource.name, "get", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "get", Date.now() - startTime, true);
        this.recordError(resource.name, "get", error);
        throw error;
      }
    }.bind(this);
    resource.getAll = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._getAll(...args);
        this.recordOperation(resource.name, "list", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "list", Date.now() - startTime, true);
        this.recordError(resource.name, "list", error);
        throw error;
      }
    }.bind(this);
    resource.list = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._list(...args);
        this.recordOperation(resource.name, "list", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "list", Date.now() - startTime, true);
        this.recordError(resource.name, "list", error);
        throw error;
      }
    }.bind(this);
    resource.listIds = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._listIds(...args);
        this.recordOperation(resource.name, "list", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "list", Date.now() - startTime, true);
        this.recordError(resource.name, "list", error);
        throw error;
      }
    }.bind(this);
    resource.count = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._count(...args);
        this.recordOperation(resource.name, "count", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "count", Date.now() - startTime, true);
        this.recordError(resource.name, "count", error);
        throw error;
      }
    }.bind(this);
    resource.page = async function(...args) {
      const startTime = Date.now();
      try {
        const result = await resource._page(...args);
        this.recordOperation(resource.name, "list", Date.now() - startTime, false);
        return result;
      } catch (error) {
        this.recordOperation(resource.name, "list", Date.now() - startTime, true);
        this.recordError(resource.name, "list", error);
        throw error;
      }
    }.bind(this);
  }
  recordOperation(resourceName, operation, duration, isError) {
    if (this.metrics.operations[operation]) {
      this.metrics.operations[operation].count++;
      this.metrics.operations[operation].totalTime += duration;
      if (isError) {
        this.metrics.operations[operation].errors++;
      }
    }
    if (!this.metrics.resources[resourceName]) {
      this.metrics.resources[resourceName] = {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      };
    }
    if (this.metrics.resources[resourceName][operation]) {
      this.metrics.resources[resourceName][operation].count++;
      this.metrics.resources[resourceName][operation].totalTime += duration;
      if (isError) {
        this.metrics.resources[resourceName][operation].errors++;
      }
    }
    if (this.config.collectPerformance) {
      this.metrics.performance.push({
        resourceName,
        operation,
        duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  recordError(resourceName, operation, error) {
    if (!this.config.collectErrors) return;
    this.metrics.errors.push({
      resourceName,
      operation,
      error: error.message,
      stack: error.stack,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flushMetrics().catch(console.error);
      }, this.config.flushInterval);
    }
  }
  async flushMetrics() {
    if (!this.metricsResource) return;
    try {
      const metadata = process.env.NODE_ENV === "test" ? {} : { global: "true" };
      const perfMetadata = process.env.NODE_ENV === "test" ? {} : { perf: "true" };
      const errorMetadata = process.env.NODE_ENV === "test" ? {} : { error: "true" };
      const resourceMetadata = process.env.NODE_ENV === "test" ? {} : { resource: "true" };
      for (const [operation, data] of Object.entries(this.metrics.operations)) {
        if (data.count > 0) {
          await this.metricsResource.insert({
            id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: "operation",
            resourceName: "global",
            operation,
            count: data.count,
            totalTime: data.totalTime,
            errors: data.errors,
            avgTime: data.count > 0 ? data.totalTime / data.count : 0,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            metadata
          });
        }
      }
      for (const [resourceName, operations] of Object.entries(this.metrics.resources)) {
        for (const [operation, data] of Object.entries(operations)) {
          if (data.count > 0) {
            await this.metricsResource.insert({
              id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: "operation",
              resourceName,
              operation,
              count: data.count,
              totalTime: data.totalTime,
              errors: data.errors,
              avgTime: data.count > 0 ? data.totalTime / data.count : 0,
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              metadata: resourceMetadata
            });
          }
        }
      }
      if (this.config.collectPerformance && this.metrics.performance.length > 0) {
        for (const perf of this.metrics.performance) {
          await this.performanceResource.insert({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: perf.resourceName,
            operation: perf.operation,
            duration: perf.duration,
            timestamp: perf.timestamp,
            metadata: perfMetadata
          });
        }
      }
      if (this.config.collectErrors && this.metrics.errors.length > 0) {
        for (const error of this.metrics.errors) {
          await this.errorsResource.insert({
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: error.resourceName,
            operation: error.operation,
            error: error.error,
            stack: error.stack,
            timestamp: error.timestamp,
            metadata: errorMetadata
          });
        }
      }
      this.resetMetrics();
    } catch (error) {
      console.error("Failed to flush metrics:", error);
    }
  }
  resetMetrics() {
    for (const operation of Object.keys(this.metrics.operations)) {
      this.metrics.operations[operation] = { count: 0, totalTime: 0, errors: 0 };
    }
    for (const resourceName of Object.keys(this.metrics.resources)) {
      for (const operation of Object.keys(this.metrics.resources[resourceName])) {
        this.metrics.resources[resourceName][operation] = { count: 0, totalTime: 0, errors: 0 };
      }
    }
    this.metrics.performance = [];
    this.metrics.errors = [];
  }
  // Utility methods
  async getMetrics(options = {}) {
    const {
      type = "operation",
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    if (!this.metricsResource) return [];
    const allMetrics = await this.metricsResource.getAll();
    let filtered = allMetrics.filter((metric) => {
      if (type && metric.type !== type) return false;
      if (resourceName && metric.resourceName !== resourceName) return false;
      if (operation && metric.operation !== operation) return false;
      if (startDate && new Date(metric.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(metric.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getErrorLogs(options = {}) {
    if (!this.errorsResource) return [];
    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    const allErrors = await this.errorsResource.getAll();
    let filtered = allErrors.filter((error) => {
      if (resourceName && error.resourceName !== resourceName) return false;
      if (operation && error.operation !== operation) return false;
      if (startDate && new Date(error.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(error.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getPerformanceLogs(options = {}) {
    if (!this.performanceResource) return [];
    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    const allPerformance = await this.performanceResource.getAll();
    let filtered = allPerformance.filter((perf) => {
      if (resourceName && perf.resourceName !== resourceName) return false;
      if (operation && perf.operation !== operation) return false;
      if (startDate && new Date(perf.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(perf.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getStats() {
    const now = /* @__PURE__ */ new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
    const [metrics, errors, performance] = await Promise.all([
      this.getMetrics({ startDate: startDate.toISOString() }),
      this.getErrorLogs({ startDate: startDate.toISOString() }),
      this.getPerformanceLogs({ startDate: startDate.toISOString() })
    ]);
    const stats = {
      period: "24h",
      totalOperations: 0,
      totalErrors: errors.length,
      avgResponseTime: 0,
      operationsByType: {},
      resources: {},
      uptime: {
        startTime: this.metrics.startTime,
        duration: now.getTime() - new Date(this.metrics.startTime).getTime()
      }
    };
    for (const metric of metrics) {
      if (metric.type === "operation") {
        stats.totalOperations += metric.count;
        if (!stats.operationsByType[metric.operation]) {
          stats.operationsByType[metric.operation] = {
            count: 0,
            errors: 0,
            avgTime: 0
          };
        }
        stats.operationsByType[metric.operation].count += metric.count;
        stats.operationsByType[metric.operation].errors += metric.errors;
        const current = stats.operationsByType[metric.operation];
        const totalCount2 = current.count;
        const newAvg = (current.avgTime * (totalCount2 - metric.count) + metric.totalTime) / totalCount2;
        current.avgTime = newAvg;
      }
    }
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const totalCount = metrics.reduce((sum, m) => sum + m.count, 0);
    stats.avgResponseTime = totalCount > 0 ? totalTime / totalCount : 0;
    return stats;
  }
  async cleanupOldData() {
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    if (this.metricsResource) {
      const oldMetrics = await this.getMetrics({ endDate: cutoffDate.toISOString() });
      for (const metric of oldMetrics) {
        await this.metricsResource.delete(metric.id);
      }
    }
    if (this.errorsResource) {
      const oldErrors = await this.getErrorLogs({ endDate: cutoffDate.toISOString() });
      for (const error of oldErrors) {
        await this.errorsResource.delete(error.id);
      }
    }
    if (this.performanceResource) {
      const oldPerformance = await this.getPerformanceLogs({ endDate: cutoffDate.toISOString() });
      for (const perf of oldPerformance) {
        await this.performanceResource.delete(perf.id);
      }
    }
    console.log(`Cleaned up data older than ${this.config.retentionDays} days`);
  }
}

class BaseReplicator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.name = this.constructor.name;
    this.enabled = config.enabled !== false;
  }
  /**
   * Initialize the replicator
   * @param {Object} database - The s3db database instance
   * @returns {Promise<void>}
   */
  async initialize(database) {
    this.database = database;
    this.emit("initialized", { replicator: this.name });
  }
  /**
   * Replicate data to the target
   * @param {string} resourceName - Name of the resource being replicated
   * @param {string} operation - Operation type (insert, update, delete)
   * @param {Object} data - The data to replicate
   * @param {string} id - Record ID
   * @returns {Promise<Object>} Replication result
   */
  async replicate(resourceName, operation, data, id) {
    throw new Error(`replicate() method must be implemented by ${this.name}`);
  }
  /**
   * Replicate multiple records in batch
   * @param {string} resourceName - Name of the resource being replicated
   * @param {Array} records - Array of records to replicate
   * @returns {Promise<Object>} Batch replication result
   */
  async replicateBatch(resourceName, records) {
    throw new Error(`replicateBatch() method must be implemented by ${this.name}`);
  }
  /**
   * Test the connection to the target
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    throw new Error(`testConnection() method must be implemented by ${this.name}`);
  }
  /**
   * Get replicator status and statistics
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config,
      connected: false
    };
  }
  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.emit("cleanup", { replicator: this.name });
  }
  /**
   * Validate replicator configuration
   * @returns {Object} Validation result
   */
  validateConfig() {
    return { isValid: true, errors: [] };
  }
}

class S3dbReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.connectionString = config.connectionString;
    this.region = config.region;
    this.bucket = config.bucket;
    this.keyPrefix = config.keyPrefix;
  }
  validateConfig() {
    const errors = [];
    if (!this.connectionString && !this.bucket) {
      errors.push("Either connectionString or bucket must be provided");
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  async initialize(database) {
    await super.initialize(database);
    const targetConfig = {
      connectionString: this.connectionString,
      region: this.region,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      verbose: this.config.verbose || false
    };
    this.targetDatabase = new S3db(targetConfig);
    await this.targetDatabase.connect();
    this.emit("connected", {
      replicator: this.name,
      target: this.connectionString || this.bucket
    });
  }
  async replicate(resourceName, operation, data, id) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      let result;
      switch (operation) {
        case "insert":
          result = await this.targetDatabase.resources[resourceName]?.insert(data);
          break;
        case "update":
          result = await this.targetDatabase.resources[resourceName]?.update(id, data);
          break;
        case "delete":
          result = await this.targetDatabase.resources[resourceName]?.delete(id);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        success: true
      });
      return { success: true, result };
    } catch (error) {
      this.emit("replication_error", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async replicateBatch(resourceName, records) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      const results = [];
      const errors = [];
      for (const record of records) {
        try {
          const result = await this.replicate(
            resourceName,
            record.operation,
            record.data,
            record.id
          );
          results.push(result);
        } catch (error) {
          errors.push({ id: record.id, error: error.message });
        }
      }
      this.emit("batch_replicated", {
        replicator: this.name,
        resourceName,
        total: records.length,
        successful: results.filter((r) => r.success).length,
        errors: errors.length
      });
      return {
        success: errors.length === 0,
        results,
        errors,
        total: records.length
      };
    } catch (error) {
      this.emit("batch_replication_error", {
        replicator: this.name,
        resourceName,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async testConnection() {
    try {
      if (!this.targetDatabase) {
        await this.initialize(this.database);
      }
      await this.targetDatabase.listResources();
      return true;
    } catch (error) {
      this.emit("connection_error", {
        replicator: this.name,
        error: error.message
      });
      return false;
    }
  }
  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.targetDatabase,
      targetDatabase: this.connectionString || this.bucket,
      resources: this.resources,
      totalReplications: this.listenerCount("replicated"),
      totalErrors: this.listenerCount("replication_error")
    };
  }
  async cleanup() {
    if (this.targetDatabase) {
      this.targetDatabase.removeAllListeners();
    }
    await super.cleanup();
  }
  shouldReplicateResource(resourceName) {
    return this.resources.length === 0 || this.resources.includes(resourceName);
  }
}

class SqsReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.queueUrl = config.queueUrl;
    this.queues = config.queues || {};
    this.defaultQueueUrl = config.defaultQueueUrl;
    this.region = config.region || "us-east-1";
    this.sqsClient = null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
  }
  validateConfig() {
    const errors = [];
    if (!this.queueUrl && Object.keys(this.queues).length === 0 && !this.defaultQueueUrl) {
      errors.push("Either queueUrl, queues object, or defaultQueueUrl must be provided");
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  /**
   * Get the appropriate queue URL for a resource
   */
  getQueueUrlForResource(resourceName) {
    if (this.queues[resourceName]) {
      return this.queues[resourceName];
    }
    if (this.queueUrl) {
      return this.queueUrl;
    }
    if (this.defaultQueueUrl) {
      return this.defaultQueueUrl;
    }
    throw new Error(`No queue URL found for resource '${resourceName}'`);
  }
  /**
   * Create standardized message structure
   */
  createMessage(resourceName, operation, data, id, beforeData = null) {
    const baseMessage = {
      resource: resourceName,
      action: operation,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source: "s3db-replication"
    };
    switch (operation) {
      case "insert":
        return {
          ...baseMessage,
          data
        };
      case "update":
        return {
          ...baseMessage,
          before: beforeData,
          data
        };
      case "delete":
        return {
          ...baseMessage,
          data
        };
      default:
        return {
          ...baseMessage,
          data
        };
    }
  }
  async initialize(database) {
    await super.initialize(database);
    try {
      const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      this.sqsClient = new SQSClient({
        region: this.region,
        credentials: this.config.credentials
      });
      this.emit("initialized", {
        replicator: this.name,
        queueUrl: this.queueUrl,
        queues: this.queues,
        defaultQueueUrl: this.defaultQueueUrl
      });
    } catch (error) {
      this.emit("initialization_error", {
        replicator: this.name,
        error: error.message
      });
      throw error;
    }
  }
  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const queueUrl = this.getQueueUrlForResource(resourceName);
      const message = this.createMessage(resourceName, operation, data, id, beforeData);
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: this.messageGroupId,
        MessageDeduplicationId: this.deduplicationId ? `${resourceName}:${operation}:${id}` : void 0
      });
      const result = await this.sqsClient.send(command);
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        queueUrl,
        messageId: result.MessageId,
        success: true
      });
      return { success: true, messageId: result.MessageId, queueUrl };
    } catch (error) {
      this.emit("replication_error", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async replicateBatch(resourceName, records) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      const queueUrl = this.getQueueUrlForResource(resourceName);
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < records.length; i += batchSize) {
        batches.push(records.slice(i, i + batchSize));
      }
      const results = [];
      const errors = [];
      for (const batch of batches) {
        try {
          const entries = batch.map((record, index) => ({
            Id: `${record.id}-${index}`,
            MessageBody: JSON.stringify(this.createMessage(
              resourceName,
              record.operation,
              record.data,
              record.id,
              record.beforeData
            )),
            MessageGroupId: this.messageGroupId,
            MessageDeduplicationId: this.deduplicationId ? `${resourceName}:${record.operation}:${record.id}` : void 0
          }));
          const command = new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: entries
          });
          const result = await this.sqsClient.send(command);
          results.push(result);
        } catch (error) {
          errors.push({ batch: batch.length, error: error.message });
        }
      }
      this.emit("batch_replicated", {
        replicator: this.name,
        resourceName,
        queueUrl,
        total: records.length,
        successful: results.length,
        errors: errors.length
      });
      return {
        success: errors.length === 0,
        results,
        errors,
        total: records.length,
        queueUrl
      };
    } catch (error) {
      this.emit("batch_replication_error", {
        replicator: this.name,
        resourceName,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async testConnection() {
    try {
      if (!this.sqsClient) {
        await this.initialize(this.database);
      }
      const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ["QueueArn"]
      });
      await this.sqsClient.send(command);
      return true;
    } catch (error) {
      this.emit("connection_error", {
        replicator: this.name,
        error: error.message
      });
      return false;
    }
  }
  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.sqsClient,
      queueUrl: this.queueUrl,
      region: this.region,
      resources: this.resources,
      totalReplications: this.listenerCount("replicated"),
      totalErrors: this.listenerCount("replication_error")
    };
  }
  async cleanup() {
    if (this.sqsClient) {
      this.sqsClient.destroy();
    }
    await super.cleanup();
  }
  shouldReplicateResource(resourceName) {
    return this.resources.length === 0 || this.resources.includes(resourceName);
  }
}

class BigqueryReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.projectId = config.projectId;
    this.datasetId = config.datasetId;
    this.tableId = config.tableId;
    this.tableMap = config.tableMap || {};
    this.bigqueryClient = null;
    this.credentials = config.credentials;
    this.location = config.location || "US";
    this.logOperations = config.logOperations !== false;
  }
  validateConfig() {
    const errors = [];
    if (!this.projectId) errors.push("projectId is required");
    if (!this.datasetId) errors.push("datasetId is required");
    if (!this.tableId) errors.push("tableId is required");
    return { isValid: errors.length === 0, errors };
  }
  async initialize(database) {
    await super.initialize(database);
    try {
      const { BigQuery } = await import('@google-cloud/bigquery');
      this.bigqueryClient = new BigQuery({
        projectId: this.projectId,
        credentials: this.credentials,
        location: this.location
      });
      this.emit("initialized", {
        replicator: this.name,
        projectId: this.projectId,
        datasetId: this.datasetId,
        tableId: this.tableId
      });
    } catch (error) {
      this.emit("initialization_error", { replicator: this.name, error: error.message });
      throw error;
    }
  }
  getTableForResource(resourceName) {
    return this.tableMap[resourceName] || this.tableId;
  }
  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      const tableId = this.getTableForResource(resourceName);
      const table = dataset.table(tableId);
      let job;
      if (operation === "insert") {
        const row = { ...data };
        job = await table.insert([row]);
      } else if (operation === "update") {
        const keys = Object.keys(data).filter((k) => k !== "id");
        const setClause = keys.map((k) => `
          ${k}=@${k}
        `).join(", ");
        const params = { id };
        keys.forEach((k) => {
          params[k] = data[k];
        });
        const query = `UPDATE           \`${this.projectId}.${this.datasetId}.${tableId}\`
        SET ${setClause}
        WHERE id=@id`;
        const [updateJob] = await this.bigqueryClient.createQueryJob({
          query,
          params
        });
        await updateJob.getQueryResults();
        job = [updateJob];
      } else if (operation === "delete") {
        const query = `DELETE FROM           \`${this.projectId}.${this.datasetId}.${tableId}\`
        WHERE id=@id`;
        const [deleteJob] = await this.bigqueryClient.createQueryJob({
          query,
          params: { id }
        });
        await deleteJob.getQueryResults();
        job = [deleteJob];
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      if (this.logOperations) {
        const logTable = dataset.table(this.tableId);
        await logTable.insert([{
          resource_name: resourceName,
          operation,
          record_id: id,
          data: JSON.stringify(data),
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          source: "s3db-replication"
        }]);
      }
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        jobId: job[0]?.id,
        success: true
      });
      return { success: true, jobId: job[0]?.id };
    } catch (error) {
      this.emit("replication_error", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    for (const record of records) {
      try {
        const res = await this.replicate(resourceName, record.operation, record.data, record.id, record.beforeData);
        results.push(res);
      } catch (err) {
        errors.push({ id: record.id, error: err.message });
      }
    }
    return { success: errors.length === 0, results, errors };
  }
  async testConnection() {
    try {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    } catch (error) {
      this.emit("connection_error", { replicator: this.name, error: error.message });
      return false;
    }
  }
  async cleanup() {
  }
  shouldReplicateResource(resourceName) {
    if (!this.resources || this.resources.length === 0) return true;
    return this.resources.includes(resourceName);
  }
}

class PostgresReplicator extends BaseReplicator {
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    this.connectionString = config.connectionString;
    this.host = config.host;
    this.port = config.port || 5432;
    this.database = config.database;
    this.user = config.user;
    this.password = config.password;
    this.tableName = config.tableName || "s3db_replication";
    this.tableMap = config.tableMap || {};
    this.client = null;
    this.ssl = config.ssl;
    this.logOperations = config.logOperations !== false;
  }
  validateConfig() {
    const errors = [];
    if (!this.connectionString && (!this.host || !this.database)) {
      errors.push("Either connectionString or host+database must be provided");
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  async initialize(database) {
    await super.initialize(database);
    try {
      const { Client } = await import('pg');
      const config = this.connectionString ? {
        connectionString: this.connectionString,
        ssl: this.ssl
      } : {
        host: this.host,
        port: this.port,
        database: this.database,
        user: this.user,
        password: this.password,
        ssl: this.ssl
      };
      this.client = new Client(config);
      await this.client.connect();
      if (this.logOperations) await this.createTableIfNotExists();
      this.emit("initialized", {
        replicator: this.name,
        database: this.database || "postgres",
        table: this.tableName
      });
    } catch (error) {
      this.emit("initialization_error", {
        replicator: this.name,
        error: error.message
      });
      throw error;
    }
  }
  async createTableIfNotExists() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        record_id VARCHAR(255) NOT NULL,
        data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(100) DEFAULT 's3db-replication',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_resource_name ON ${this.tableName}(resource_name);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_operation ON ${this.tableName}(operation);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_record_id ON ${this.tableName}(record_id);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp);
    `;
    await this.client.query(createTableQuery);
  }
  getTableForResource(resourceName) {
    return this.tableMap[resourceName] || resourceName;
  }
  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    try {
      const table = this.getTableForResource(resourceName);
      let result;
      if (operation === "insert") {
        const keys = Object.keys(data);
        const values = keys.map((k) => data[k]);
        const columns = keys.map((k) => `"${k}"`).join(", ");
        const params = keys.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
        result = await this.client.query(sql, values);
      } else if (operation === "update") {
        const keys = Object.keys(data).filter((k) => k !== "id");
        const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(", ");
        const values = keys.map((k) => data[k]);
        values.push(id);
        const sql = `UPDATE ${table} SET ${setClause} WHERE id=$${keys.length + 1} RETURNING *`;
        result = await this.client.query(sql, values);
      } else if (operation === "delete") {
        const sql = `DELETE FROM ${table} WHERE id=$1 RETURNING *`;
        result = await this.client.query(sql, [id]);
      } else {
        throw new Error(`Unsupported operation: ${operation}`);
      }
      if (this.logOperations) {
        await this.client.query(
          `INSERT INTO ${this.tableName} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`,
          [resourceName, operation, id, JSON.stringify(data), (/* @__PURE__ */ new Date()).toISOString(), "s3db-replication"]
        );
      }
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        result: result.rows,
        success: true
      });
      return { success: true, rows: result.rows };
    } catch (error) {
      this.emit("replication_error", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    for (const record of records) {
      try {
        const res = await this.replicate(resourceName, record.operation, record.data, record.id, record.beforeData);
        results.push(res);
      } catch (err) {
        errors.push({ id: record.id, error: err.message });
      }
    }
    return { success: errors.length === 0, results, errors };
  }
  async testConnection() {
    try {
      if (!this.client) await this.initialize();
      await this.client.query("SELECT 1");
      return true;
    } catch (error) {
      this.emit("connection_error", { replicator: this.name, error: error.message });
      return false;
    }
  }
  async cleanup() {
    if (this.client) await this.client.end();
  }
  shouldReplicateResource(resourceName) {
    if (!this.resources || this.resources.length === 0) return true;
    return this.resources.includes(resourceName);
  }
}

const REPLICATOR_DRIVERS = {
  s3db: S3dbReplicator,
  sqs: SqsReplicator,
  bigquery: BigqueryReplicator,
  postgres: PostgresReplicator
};
function createReplicator(driver, config = {}, resources = []) {
  const ReplicatorClass = REPLICATOR_DRIVERS[driver];
  if (!ReplicatorClass) {
    throw new Error(`Unknown replicator driver: ${driver}. Available drivers: ${Object.keys(REPLICATOR_DRIVERS).join(", ")}`);
  }
  return new ReplicatorClass(config, resources);
}
function validateReplicatorConfig(driver, config, resources = []) {
  const replicator = createReplicator(driver, config, resources);
  return replicator.validateConfig();
}

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
class ReplicationPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      replicators: options.replicators || [],
      syncMode: options.syncMode || "async",
      // 'sync' or 'async'
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1e3,
      // ms
      batchSize: options.batchSize || 10,
      compression: options.compression || false,
      // Enable compression
      compressionLevel: options.compressionLevel || 6,
      // 0-9
      ...options
    };
    this.replicators = [];
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      lastSync: null
    };
  }
  /**
   * Process data according to replication mode
   */
  processDataForReplication(data, metadata = {}) {
    switch (this.config.replicationMode) {
      case "exact-copy":
        return {
          body: data,
          metadata
        };
      case "just-metadata":
        return {
          body: null,
          metadata
        };
      case "all-in-body":
        return {
          body: {
            data,
            metadata,
            replicationMode: this.config.replicationMode,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          },
          metadata: {
            replicationMode: this.config.replicationMode,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        };
      default:
        return {
          body: data,
          metadata
        };
    }
  }
  /**
   * Compress data if compression is enabled
   */
  async compressData(data) {
    if (!this.config.compression || !data) {
      return data;
    }
    try {
      const jsonString = JSON.stringify(data);
      const compressed = await gzipAsync(jsonString, { level: this.config.compressionLevel });
      return compressed.toString("base64");
    } catch (error) {
      this.emit("replication.compression.failed", { error, data });
      return data;
    }
  }
  /**
   * Decompress data if it was compressed
   */
  async decompressData(data) {
    if (!this.config.compression || !data) {
      return data;
    }
    try {
      if (typeof data === "string" && data.startsWith("H4sI")) {
        const buffer = Buffer.from(data, "base64");
        const decompressed = await gunzipAsync(buffer);
        return JSON.parse(decompressed.toString());
      }
      return data;
    } catch (error) {
      this.emit("replication.decompression.failed", { error, data });
      return data;
    }
  }
  async setup(database) {
    this.database = database;
    if (!this.config.enabled) {
      return;
    }
    if (this.config.replicators && this.config.replicators.length > 0) {
      await this.initializeReplicators();
    }
    if (!database.resources.replication_logs) {
      this.replicationLog = await database.createResource({
        name: "replication_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          recordId: "string|required",
          replicatorId: "string|required",
          status: "string|required",
          attempts: "number|required",
          lastAttempt: "string|required",
          error: "string|required",
          data: "object|required",
          timestamp: "string|required"
        }
      });
    } else {
      this.replicationLog = database.resources.replication_logs;
    }
    for (const resourceName in database.resources) {
      if (resourceName !== "replication_logs") {
        this.installHooks(database.resources[resourceName]);
      }
    }
    const originalCreateResource = database.createResource.bind(database);
    database.createResource = async (config) => {
      const resource = await originalCreateResource(config);
      if (resource && resource.name !== "replication_logs") {
        this.installHooks(resource);
      }
      return resource;
    };
    this.startQueueProcessor();
  }
  async initializeReplicators() {
    for (const replicatorConfig of this.config.replicators) {
      try {
        const { driver, config: replicatorConfigData, resources = [] } = replicatorConfig;
        const validation = validateReplicatorConfig(driver, replicatorConfigData, resources);
        if (!validation.isValid) {
          this.emit("replicator.validation.failed", {
            driver,
            errors: validation.errors
          });
          continue;
        }
        const replicator = createReplicator(driver, replicatorConfigData, resources);
        await replicator.initialize(this.database);
        replicator.on("replicated", (data) => {
          this.emit("replication.success", data);
        });
        replicator.on("replication_error", (data) => {
          this.emit("replication.failed", data);
        });
        this.replicators.push({
          id: `${driver}-${Date.now()}`,
          driver,
          config: replicatorConfigData,
          resources,
          instance: replicator
        });
        this.emit("replicator.initialized", {
          driver,
          config: replicatorConfigData,
          resources
        });
      } catch (error) {
        this.emit("replicator.initialization.failed", {
          driver: replicatorConfig.driver,
          error: error.message
        });
      }
    }
  }
  async start() {
  }
  async stop() {
    this.isProcessing = false;
    await this.processQueue();
  }
  installHooks(resource) {
    if (!resource || resource.name === "replication_logs") return;
    const originalDataMap = /* @__PURE__ */ new Map();
    resource.addHook("afterInsert", async (data) => {
      await this.queueReplication(resource.name, "insert", data.id, data);
      return data;
    });
    resource.addHook("preUpdate", async (data) => {
      if (data.id) {
        try {
          const originalData = await resource.get(data.id);
          originalDataMap.set(data.id, originalData);
        } catch (error) {
          originalDataMap.set(data.id, { id: data.id });
        }
      }
      return data;
    });
    resource.addHook("afterUpdate", async (data) => {
      const beforeData = originalDataMap.get(data.id);
      await this.queueReplication(resource.name, "update", data.id, data, beforeData);
      originalDataMap.delete(data.id);
      return data;
    });
    resource.addHook("afterDelete", async (data) => {
      await this.queueReplication(resource.name, "delete", data.id, data);
      return data;
    });
    const originalDeleteMany = resource.deleteMany.bind(resource);
    resource.deleteMany = async (ids) => {
      const result = await originalDeleteMany(ids);
      if (result && result.length > 0) {
        for (const id of ids) {
          await this.queueReplication(resource.name, "delete", id, { id });
        }
      }
      return result;
    };
  }
  async queueReplication(resourceName, operation, recordId, data, beforeData = null) {
    if (!this.config.enabled) {
      return;
    }
    if (this.replicators.length === 0) {
      return;
    }
    const applicableReplicators = this.replicators.filter(
      (replicator) => replicator.instance.shouldReplicateResource(resourceName)
    );
    if (applicableReplicators.length === 0) {
      return;
    }
    const item = {
      id: `repl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      resourceName,
      operation,
      recordId,
      data: isPlainObject(data) ? data : { raw: data },
      beforeData: beforeData ? isPlainObject(beforeData) ? beforeData : { raw: beforeData } : null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 0
    };
    const logId = await this.logReplication(item);
    if (this.config.syncMode === "sync") {
      try {
        const result = await this.processReplicationItem(item);
        if (logId) {
          await this.updateReplicationLog(logId, {
            status: result.success ? "success" : "failed",
            attempts: 1,
            error: result.success ? "" : JSON.stringify(result.results)
          });
        }
        this.stats.totalOperations++;
        if (result.success) {
          this.stats.successfulOperations++;
        } else {
          this.stats.failedOperations++;
        }
      } catch (error) {
        if (logId) {
          await this.updateReplicationLog(logId, {
            status: "failed",
            attempts: 1,
            error: error.message
          });
        }
        this.stats.failedOperations++;
      }
    } else {
      this.queue.push(item);
      this.emit("replication.queued", { item, queueLength: this.queue.length });
    }
  }
  async processReplicationItem(item) {
    const { resourceName, operation, recordId, data, beforeData } = item;
    const applicableReplicators = this.replicators.filter(
      (replicator) => replicator.instance.shouldReplicateResource(resourceName)
    );
    if (applicableReplicators.length === 0) {
      return { success: true, skipped: true, reason: "no_applicable_replicators" };
    }
    const results = [];
    for (const replicator of applicableReplicators) {
      try {
        const result = await replicator.instance.replicate(resourceName, operation, data, recordId, beforeData);
        results.push({
          replicatorId: replicator.id,
          driver: replicator.driver,
          success: result.success,
          error: result.error,
          skipped: result.skipped
        });
      } catch (error) {
        results.push({
          replicatorId: replicator.id,
          driver: replicator.driver,
          success: false,
          error: error.message
        });
      }
    }
    return {
      success: results.every((r) => r.success || r.skipped),
      results
    };
  }
  async logReplication(item) {
    if (!this.replicationLog) return;
    try {
      const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.replicationLog.insert({
        id: logId,
        resourceName: item.resourceName,
        operation: item.operation,
        recordId: item.recordId,
        replicatorId: "all",
        // Will be updated with specific replicator results
        status: "queued",
        attempts: 0,
        lastAttempt: (/* @__PURE__ */ new Date()).toISOString(),
        error: "",
        data: isPlainObject(item.data) ? item.data : { raw: item.data },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      return logId;
    } catch (error) {
      this.emit("replication.log.failed", { error: error.message, item });
      return null;
    }
  }
  async updateReplicationLog(logId, updates) {
    if (!this.replicationLog) return;
    try {
      await this.replicationLog.update(logId, {
        ...updates,
        lastAttempt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      this.emit("replication.updateLog.failed", { error: error.message, logId, updates });
    }
  }
  startQueueProcessor() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processQueueLoop();
  }
  async processQueueLoop() {
    while (this.isProcessing) {
      if (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.config.batchSize);
        for (const item of batch) {
          await this.processReplicationItem(item);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
  }
  async processQueue() {
    if (this.queue.length === 0) return;
    const item = this.queue.shift();
    let attempts = 0;
    let lastError = null;
    while (attempts < this.config.retryAttempts) {
      try {
        attempts++;
        this.emit("replication.retry.started", {
          item,
          attempt: attempts,
          maxAttempts: this.config.retryAttempts
        });
        const result = await this.processReplicationItem(item);
        if (result.success) {
          this.stats.successfulOperations++;
          this.emit("replication.success", {
            item,
            attempts,
            results: result.results,
            stats: this.stats
          });
          return;
        } else {
          lastError = result.results;
          if (attempts < this.config.retryAttempts) {
            await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * attempts));
          }
        }
      } catch (error) {
        lastError = error.message;
        if (attempts < this.config.retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * attempts));
        } else {
          this.emit("replication.retry.exhausted", {
            attempts,
            lastError,
            item
          });
        }
      }
    }
    this.stats.failedOperations++;
    this.emit("replication.failed", {
      attempts,
      lastError,
      item,
      stats: this.stats
    });
  }
  // Utility methods
  async getReplicationStats() {
    const replicatorStats = await Promise.all(
      this.replicators.map(async (replicator) => {
        const status = await replicator.instance.getStatus();
        return {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
      })
    );
    return {
      enabled: this.config.enabled,
      replicators: replicatorStats,
      queue: {
        length: this.queue.length,
        isProcessing: this.isProcessing
      },
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }
  async getReplicationLogs(options = {}) {
    if (!this.replicationLog) {
      return [];
    }
    const {
      resourceName,
      operation,
      status,
      limit = 100,
      offset = 0
    } = options;
    let query = {};
    if (resourceName) {
      query.resourceName = resourceName;
    }
    if (operation) {
      query.operation = operation;
    }
    if (status) {
      query.status = status;
    }
    const logs = await this.replicationLog.list(query);
    return logs.slice(offset, offset + limit);
  }
  async retryFailedReplications() {
    if (!this.replicationLog) {
      return { retried: 0 };
    }
    const failedLogs = await this.replicationLog.list({
      status: "failed"
    });
    let retried = 0;
    for (const log of failedLogs) {
      try {
        await this.queueReplication(
          log.resourceName,
          log.operation,
          log.recordId,
          log.data
        );
        retried++;
      } catch (error) {
        console.error("Failed to retry replication:", error);
      }
    }
    return { retried };
  }
  async syncAllData(replicatorId) {
    const replicator = this.replicators.find((r) => r.id === replicatorId);
    if (!replicator) {
      throw new Error(`Replicator not found: ${replicatorId}`);
    }
    this.stats.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    for (const resourceName in this.database.resources) {
      if (resourceName === "replication_logs") continue;
      if (replicator.instance.shouldReplicateResource(resourceName)) {
        this.emit("replication.sync.resource", { resourceName, replicatorId });
        const resource = this.database.resources[resourceName];
        const allRecords = await resource.getAll();
        for (const record of allRecords) {
          await replicator.instance.replicate(resourceName, "insert", record, record.id);
        }
      }
    }
    this.emit("replication.sync.completed", { replicatorId, stats: this.stats });
  }
}

export { AVAILABLE_BEHAVIORS, AuditPlugin, AuthenticationError, BaseError, Cache, CachePlugin, Client, ConnectionString, CostsPlugin, DEFAULT_BEHAVIOR, Database, DatabaseError, EncryptionError, ErrorMap, FullTextPlugin, InvalidResourceItem, MemoryCache, MetricsPlugin, MissingMetadata, NoSuchBucket, NoSuchKey, NotFound, PermissionError, Plugin, PluginObject, ReplicationPlugin, Resource, ResourceIdsPageReader, ResourceIdsReader, ResourceNotFound, ResourceReader, ResourceWriter, S3Cache, S3DBError, S3_DEFAULT_ENDPOINT, S3_DEFAULT_REGION, S3db, Schema, SchemaActions, UnknownError, ValidationError, Validator, ValidatorManager, behaviors, calculateAttributeNamesSize, calculateAttributeSizes, calculateTotalSize, calculateUTF8Bytes, decrypt, S3db as default, encrypt, getBehavior, getSizeBreakdown, idGenerator, passwordGenerator, sha256, streamToString, transformValue };
