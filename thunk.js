// v0.4.0
//
// **Github:** https://github.com/teambition/thunk
//
// **License:** MIT

/* global module, define, setImmediate, console */
;(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.thunk = root.Thunk = factory();
  }
}(this, function () {
  'use strict';

  var toString = Object.prototype.toString,
    isArray = Array.isArray || function (obj) {
      return toString.call(obj) === '[object Array]';
    };

  function isFunction(fn) {
    return typeof fn === 'function';
  }

  function isObject(obj) {
    return obj && Object === obj.constructor;
  }

  function isThunk(fn) {
    return isFunction(fn) && fn._isThunk;
  }

  // fast slice for `arguments`.
  function slice(args, start) {
    var ret = [], len = args.length;
    start = start || 0;
    while (len-- > start) ret[len - start] = args[len];
    return ret;
  }

  return function (options) {
    var scope = {};

    if (isFunction(options)) scope.onerror = options;
    else if (options) {
      scope.debug = isFunction(options.debug) ? options.debug : null;
      scope.onerror = isFunction(options.onerror) ? options.onerror : null;
    }

    // main fucntion **thunk**
    function Thunk(start) {
      var current = {};

      start = toThunk(start);
      if (isThunk(start)) {
        continuation({
          next: current,
          result: [null],
          callback: function () { return start; }
        });
      } else {
        current.result = start == null ? [null] : [null, start];
      }
      return childThunk(current);
    }

    Thunk.all = function (array) {
      return Thunk(objectToThunk(array));
    };

    function continuation(parent) {
      var result, args = parent.result, current = parent.next, onerror = scope.onerror || callback;

      parent.result = false;
      // debug in scope
      if (scope.debug) scope.debug.apply(null, args);
      // onerror in scope.
      if (args[0] != null) {
        if (scope.onerror) return onerror(args[0]);
        args = [args[0]];
      }
      try {
        switch (args.length) {
          case 1: result = parent.callback(args[0]); break;
          case 2: result = parent.callback(args[0], args[1]); break;
          case 3: result = parent.callback(args[0], args[1], args[2]); break;
          default: result = parent.callback.apply(null, args);
        }
      } catch (error) {
        return onerror(error);
      }

      if (result == null) return callback(null);
      result = toThunk(result);
      if (!isThunk(result)) return callback(null, result);
      try {
        result(callback);
      } catch (error) {
        return onerror(error);
      }

      function callback() {
        if (current.result === false) return;
        current.result = arguments;
        if (current.callback) continuation(current);
      }
    }

    function toThunk(obj) {
      if (!obj) return obj;
      if (isFunction(obj)) obj = thunkFactory(obj);
      else if (isFunction(obj.thunk)) obj = thunkFactory(obj.thunk);
      else if (isFunction(obj.then)) obj = thunkFactory(promiseToThunk(obj));
      return obj;
    }

    function thunkFactory(thunk) {
      thunk._isThunk = true;
      return thunk;
    }

    function childThunk(parent) {
      return thunkFactory(function (callback) {
        var current = {};

        if (parent.result === false) return;
        parent.callback = callback;
        parent.next = current;
        if (parent.result) continuation(parent);
        return childThunk(current);
      });
    }

    function objectToThunk(obj) {
      return function (callback) {
        var pending, finished, result = new obj.constructor();

        try {
          exec();
        } catch (error) {
          finished = true;
          callback(error);
        }

        function exec() {
          if (isArray(obj)) {
            pending = obj.length;
            for (var i = pending - 1; i >= 0; i--) {
              run(obj[i], i);
            }
          } else if (isObject(obj)) {
            pending = 1;
            for (var key in obj) {
              pending += 1;
              run(obj[key], key);
            }
            pending -= 1;
          } else throw new Error('Not array or object');
          if (!(pending || finished)) callback(null, result);
        }

        function run(fn, index) {
          if (finished) return;
          fn = toThunk(fn);
          if (!isThunk(fn)) {
            result[index] = fn;
            return --pending || callback(null, result);
          }
          fn(function (error, res) {
            if (finished) return;
            if (error != null) return finished = true, callback(error);
            result[index] = arguments.length > 2 ? slice(arguments, 1) : res;
            return --pending || callback(null, result);
          });
        }
      };
    }

    function promiseToThunk(promise) {
      return function (callback) {
        promise.then(function (res) {
          callback(null, res);
        }, callback);
      };
    }

    return Thunk;
  };
}));
