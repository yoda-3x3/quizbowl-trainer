var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
var init_utils = __esm({
  "node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(createNotImplementedError, "createNotImplementedError");
    __name(notImplemented, "notImplemented");
    __name(notImplementedClass, "notImplementedClass");
  }
});

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin, _performanceNow, nodeTiming, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList, Performance, PerformanceObserver, performance;
var init_performance = __esm({
  "node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
    nodeTiming = {
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: 0,
      nodeStart: 0,
      v8Start: 0,
      bootstrapComplete: 0,
      environment: 0,
      loopStart: 0,
      loopExit: 0,
      idleTime: 0,
      uvMetricsInfo: {
        loopCount: 0,
        events: 0,
        eventsWaiting: 0
      },
      detail: void 0,
      toJSON() {
        return this;
      }
    };
    PerformanceEntry = class {
      static {
        __name(this, "PerformanceEntry");
      }
      __unenv__ = true;
      detail;
      entryType = "event";
      name;
      startTime;
      constructor(name, options) {
        this.name = name;
        this.startTime = options?.startTime || _performanceNow();
        this.detail = options?.detail;
      }
      get duration() {
        return _performanceNow() - this.startTime;
      }
      toJSON() {
        return {
          name: this.name,
          entryType: this.entryType,
          startTime: this.startTime,
          duration: this.duration,
          detail: this.detail
        };
      }
    };
    PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
      static {
        __name(this, "PerformanceMark");
      }
      entryType = "mark";
      constructor() {
        super(...arguments);
      }
      get duration() {
        return 0;
      }
    };
    PerformanceMeasure = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceMeasure");
      }
      entryType = "measure";
    };
    PerformanceResourceTiming = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceResourceTiming");
      }
      entryType = "resource";
      serverTiming = [];
      connectEnd = 0;
      connectStart = 0;
      decodedBodySize = 0;
      domainLookupEnd = 0;
      domainLookupStart = 0;
      encodedBodySize = 0;
      fetchStart = 0;
      initiatorType = "";
      name = "";
      nextHopProtocol = "";
      redirectEnd = 0;
      redirectStart = 0;
      requestStart = 0;
      responseEnd = 0;
      responseStart = 0;
      secureConnectionStart = 0;
      startTime = 0;
      transferSize = 0;
      workerStart = 0;
      responseStatus = 0;
    };
    PerformanceObserverEntryList = class {
      static {
        __name(this, "PerformanceObserverEntryList");
      }
      __unenv__ = true;
      getEntries() {
        return [];
      }
      getEntriesByName(_name, _type) {
        return [];
      }
      getEntriesByType(type) {
        return [];
      }
    };
    Performance = class {
      static {
        __name(this, "Performance");
      }
      __unenv__ = true;
      timeOrigin = _timeOrigin;
      eventCounts = /* @__PURE__ */ new Map();
      _entries = [];
      _resourceTimingBufferSize = 0;
      navigation = void 0;
      timing = void 0;
      timerify(_fn, _options) {
        throw createNotImplementedError("Performance.timerify");
      }
      get nodeTiming() {
        return nodeTiming;
      }
      eventLoopUtilization() {
        return {};
      }
      markResourceTiming() {
        return new PerformanceResourceTiming("");
      }
      onresourcetimingbufferfull = null;
      now() {
        if (this.timeOrigin === _timeOrigin) {
          return _performanceNow();
        }
        return Date.now() - this.timeOrigin;
      }
      clearMarks(markName) {
        this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
      }
      clearMeasures(measureName) {
        this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
      }
      clearResourceTimings() {
        this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
      }
      getEntries() {
        return this._entries;
      }
      getEntriesByName(name, type) {
        return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
      }
      getEntriesByType(type) {
        return this._entries.filter((e) => e.entryType === type);
      }
      mark(name, options) {
        const entry = new PerformanceMark(name, options);
        this._entries.push(entry);
        return entry;
      }
      measure(measureName, startOrMeasureOptions, endMark) {
        let start;
        let end;
        if (typeof startOrMeasureOptions === "string") {
          start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
          end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
        } else {
          start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
          end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
        }
        const entry = new PerformanceMeasure(measureName, {
          startTime: start,
          detail: {
            start,
            end
          }
        });
        this._entries.push(entry);
        return entry;
      }
      setResourceTimingBufferSize(maxSize) {
        this._resourceTimingBufferSize = maxSize;
      }
      addEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.addEventListener");
      }
      removeEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.removeEventListener");
      }
      dispatchEvent(event) {
        throw createNotImplementedError("Performance.dispatchEvent");
      }
      toJSON() {
        return this;
      }
    };
    PerformanceObserver = class {
      static {
        __name(this, "PerformanceObserver");
      }
      __unenv__ = true;
      static supportedEntryTypes = [];
      _callback = null;
      constructor(callback) {
        this._callback = callback;
      }
      takeRecords() {
        return [];
      }
      disconnect() {
        throw createNotImplementedError("PerformanceObserver.disconnect");
      }
      observe(options) {
        throw createNotImplementedError("PerformanceObserver.observe");
      }
      bind(fn) {
        return fn;
      }
      runInAsyncScope(fn, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      }
      asyncId() {
        return 0;
      }
      triggerAsyncId() {
        return 0;
      }
      emitDestroy() {
        return this;
      }
    };
    performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
  }
});

// node_modules/unenv/dist/runtime/node/perf_hooks.mjs
var init_perf_hooks = __esm({
  "node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
var init_performance2 = __esm({
  "node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
    if (!("__unenv__" in performance)) {
      const proto = Performance.prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key !== "constructor" && !(key in performance)) {
          const desc = Object.getOwnPropertyDescriptor(proto, key);
          if (desc) {
            Object.defineProperty(performance, key, desc);
          }
        }
      }
    }
    globalThis.performance = performance;
    globalThis.Performance = Performance;
    globalThis.PerformanceEntry = PerformanceEntry;
    globalThis.PerformanceMark = PerformanceMark;
    globalThis.PerformanceMeasure = PerformanceMeasure;
    globalThis.PerformanceObserver = PerformanceObserver;
    globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
    globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
  }
});

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default;
var init_noop = __esm({
  "node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default = Object.assign(() => {
    }, { __unenv__: true });
  }
});

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";
var _console, _ignoreErrors, _stderr, _stdout, log, info, trace, debug, table, error, warn, createTask, clear, count, countReset, dir, dirxml, group, groupEnd, groupCollapsed, profile, profileEnd, time, timeEnd, timeLog, timeStamp, Console, _times, _stdoutErrorHandler, _stderrErrorHandler;
var init_console = __esm({
  "node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console = globalThis.console;
    _ignoreErrors = true;
    _stderr = new Writable();
    _stdout = new Writable();
    log = _console?.log ?? noop_default;
    info = _console?.info ?? log;
    trace = _console?.trace ?? info;
    debug = _console?.debug ?? log;
    table = _console?.table ?? log;
    error = _console?.error ?? log;
    warn = _console?.warn ?? error;
    createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
    clear = _console?.clear ?? noop_default;
    count = _console?.count ?? noop_default;
    countReset = _console?.countReset ?? noop_default;
    dir = _console?.dir ?? noop_default;
    dirxml = _console?.dirxml ?? noop_default;
    group = _console?.group ?? noop_default;
    groupEnd = _console?.groupEnd ?? noop_default;
    groupCollapsed = _console?.groupCollapsed ?? noop_default;
    profile = _console?.profile ?? noop_default;
    profileEnd = _console?.profileEnd ?? noop_default;
    time = _console?.time ?? noop_default;
    timeEnd = _console?.timeEnd ?? noop_default;
    timeLog = _console?.timeLog ?? noop_default;
    timeStamp = _console?.timeStamp ?? noop_default;
    Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
    _times = /* @__PURE__ */ new Map();
    _stdoutErrorHandler = noop_default;
    _stderrErrorHandler = noop_default;
  }
});

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole, assert, clear2, context, count2, countReset2, createTask2, debug2, dir2, dirxml2, error2, group2, groupCollapsed2, groupEnd2, info2, log2, profile2, profileEnd2, table2, time2, timeEnd2, timeLog2, timeStamp2, trace2, warn2, console_default;
var init_console2 = __esm({
  "node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole = globalThis["console"];
    ({
      assert,
      clear: clear2,
      context: (
        // @ts-expect-error undocumented public API
        context
      ),
      count: count2,
      countReset: countReset2,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask2
      ),
      debug: debug2,
      dir: dir2,
      dirxml: dirxml2,
      error: error2,
      group: group2,
      groupCollapsed: groupCollapsed2,
      groupEnd: groupEnd2,
      info: info2,
      log: log2,
      profile: profile2,
      profileEnd: profileEnd2,
      table: table2,
      time: time2,
      timeEnd: timeEnd2,
      timeLog: timeLog2,
      timeStamp: timeStamp2,
      trace: trace2,
      warn: warn2
    } = workerdConsole);
    Object.assign(workerdConsole, {
      Console,
      _ignoreErrors,
      _stderr,
      _stderrErrorHandler,
      _stdout,
      _stdoutErrorHandler,
      _times
    });
    console_default = workerdConsole;
  }
});

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default;
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime;
var init_hrtime = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
      const now = Date.now();
      const seconds = Math.trunc(now / 1e3);
      const nanos = now % 1e3 * 1e6;
      if (startTime) {
        let diffSeconds = seconds - startTime[0];
        let diffNanos = nanos - startTime[0];
        if (diffNanos < 0) {
          diffSeconds = diffSeconds - 1;
          diffNanos = 1e9 + diffNanos;
        }
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanos];
    }, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
      return BigInt(Date.now() * 1e6);
    }, "bigint") });
  }
});

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream;
var init_read_stream = __esm({
  "node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream = class {
      static {
        __name(this, "ReadStream");
      }
      fd;
      isRaw = false;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      setRawMode(mode) {
        this.isRaw = mode;
        return this;
      }
    };
  }
});

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream;
var init_write_stream = __esm({
  "node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream = class {
      static {
        __name(this, "WriteStream");
      }
      fd;
      columns = 80;
      rows = 24;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      clearLine(dir3, callback) {
        callback && callback();
        return false;
      }
      clearScreenDown(callback) {
        callback && callback();
        return false;
      }
      cursorTo(x, y, callback) {
        callback && typeof callback === "function" && callback();
        return false;
      }
      moveCursor(dx, dy, callback) {
        callback && callback();
        return false;
      }
      getColorDepth(env2) {
        return 1;
      }
      hasColors(count3, env2) {
        return false;
      }
      getWindowSize() {
        return [this.columns, this.rows];
      }
      write(str, encoding, cb) {
        if (str instanceof Uint8Array) {
          str = new TextDecoder().decode(str);
        }
        try {
          console.log(str);
        } catch {
        }
        cb && typeof cb === "function" && cb();
        return false;
      }
    };
  }
});

// node_modules/unenv/dist/runtime/node/tty.mjs
var init_tty = __esm({
  "node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION;
var init_node_version = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NODE_VERSION = "22.14.0";
  }
});

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";
var Process;
var init_process = __esm({
  "node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    init_node_version();
    Process = class _Process extends EventEmitter {
      static {
        __name(this, "Process");
      }
      env;
      hrtime;
      nextTick;
      constructor(impl) {
        super();
        this.env = impl.env;
        this.hrtime = impl.hrtime;
        this.nextTick = impl.nextTick;
        for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
          const value = this[prop];
          if (typeof value === "function") {
            this[prop] = value.bind(this);
          }
        }
      }
      // --- event emitter ---
      emitWarning(warning, type, code) {
        console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
      }
      emit(...args) {
        return super.emit(...args);
      }
      listeners(eventName) {
        return super.listeners(eventName);
      }
      // --- stdio (lazy initializers) ---
      #stdin;
      #stdout;
      #stderr;
      get stdin() {
        return this.#stdin ??= new ReadStream(0);
      }
      get stdout() {
        return this.#stdout ??= new WriteStream(1);
      }
      get stderr() {
        return this.#stderr ??= new WriteStream(2);
      }
      // --- cwd ---
      #cwd = "/";
      chdir(cwd2) {
        this.#cwd = cwd2;
      }
      cwd() {
        return this.#cwd;
      }
      // --- dummy props and getters ---
      arch = "";
      platform = "";
      argv = [];
      argv0 = "";
      execArgv = [];
      execPath = "";
      title = "";
      pid = 200;
      ppid = 100;
      get version() {
        return `v${NODE_VERSION}`;
      }
      get versions() {
        return { node: NODE_VERSION };
      }
      get allowedNodeEnvironmentFlags() {
        return /* @__PURE__ */ new Set();
      }
      get sourceMapsEnabled() {
        return false;
      }
      get debugPort() {
        return 0;
      }
      get throwDeprecation() {
        return false;
      }
      get traceDeprecation() {
        return false;
      }
      get features() {
        return {};
      }
      get release() {
        return {};
      }
      get connected() {
        return false;
      }
      get config() {
        return {};
      }
      get moduleLoadList() {
        return [];
      }
      constrainedMemory() {
        return 0;
      }
      availableMemory() {
        return 0;
      }
      uptime() {
        return 0;
      }
      resourceUsage() {
        return {};
      }
      // --- noop methods ---
      ref() {
      }
      unref() {
      }
      // --- unimplemented methods ---
      umask() {
        throw createNotImplementedError("process.umask");
      }
      getBuiltinModule() {
        return void 0;
      }
      getActiveResourcesInfo() {
        throw createNotImplementedError("process.getActiveResourcesInfo");
      }
      exit() {
        throw createNotImplementedError("process.exit");
      }
      reallyExit() {
        throw createNotImplementedError("process.reallyExit");
      }
      kill() {
        throw createNotImplementedError("process.kill");
      }
      abort() {
        throw createNotImplementedError("process.abort");
      }
      dlopen() {
        throw createNotImplementedError("process.dlopen");
      }
      setSourceMapsEnabled() {
        throw createNotImplementedError("process.setSourceMapsEnabled");
      }
      loadEnvFile() {
        throw createNotImplementedError("process.loadEnvFile");
      }
      disconnect() {
        throw createNotImplementedError("process.disconnect");
      }
      cpuUsage() {
        throw createNotImplementedError("process.cpuUsage");
      }
      setUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
      }
      hasUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
      }
      initgroups() {
        throw createNotImplementedError("process.initgroups");
      }
      openStdin() {
        throw createNotImplementedError("process.openStdin");
      }
      assert() {
        throw createNotImplementedError("process.assert");
      }
      binding() {
        throw createNotImplementedError("process.binding");
      }
      // --- attached interfaces ---
      permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
      report = {
        directory: "",
        filename: "",
        signal: "SIGUSR2",
        compact: false,
        reportOnFatalError: false,
        reportOnSignal: false,
        reportOnUncaughtException: false,
        getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
        writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
      };
      finalization = {
        register: /* @__PURE__ */ notImplemented("process.finalization.register"),
        unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
        registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
      };
      memoryUsage = Object.assign(() => ({
        arrayBuffers: 0,
        rss: 0,
        external: 0,
        heapTotal: 0,
        heapUsed: 0
      }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
      // --- undefined props ---
      mainModule = void 0;
      domain = void 0;
      // optional
      send = void 0;
      exitCode = void 0;
      channel = void 0;
      getegid = void 0;
      geteuid = void 0;
      getgid = void 0;
      getgroups = void 0;
      getuid = void 0;
      setegid = void 0;
      seteuid = void 0;
      setgid = void 0;
      setgroups = void 0;
      setuid = void 0;
      // internals
      _events = void 0;
      _eventsCount = void 0;
      _exiting = void 0;
      _maxListeners = void 0;
      _debugEnd = void 0;
      _debugProcess = void 0;
      _fatalException = void 0;
      _getActiveHandles = void 0;
      _getActiveRequests = void 0;
      _kill = void 0;
      _preload_modules = void 0;
      _rawDebug = void 0;
      _startProfilerIdleNotifier = void 0;
      _stopProfilerIdleNotifier = void 0;
      _tickCallback = void 0;
      _disconnect = void 0;
      _handleQueue = void 0;
      _pendingMessage = void 0;
      _channel = void 0;
      _send = void 0;
      _linkedBinding = void 0;
    };
  }
});

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess, getBuiltinModule, workerdProcess, unenvProcess, exit, features, platform, _channel, _debugEnd, _debugProcess, _disconnect, _events, _eventsCount, _exiting, _fatalException, _getActiveHandles, _getActiveRequests, _handleQueue, _kill, _linkedBinding, _maxListeners, _pendingMessage, _preload_modules, _rawDebug, _send, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, abort, addListener, allowedNodeEnvironmentFlags, arch, argv, argv0, assert2, availableMemory, binding, channel, chdir, config, connected, constrainedMemory, cpuUsage, cwd, debugPort, disconnect, dlopen, domain, emit, emitWarning, env, eventNames, execArgv, execPath, exitCode, finalization, getActiveResourcesInfo, getegid, geteuid, getgid, getgroups, getMaxListeners, getuid, hasUncaughtExceptionCaptureCallback, hrtime3, initgroups, kill, listenerCount, listeners, loadEnvFile, mainModule, memoryUsage, moduleLoadList, nextTick, off, on, once, openStdin, permission, pid, ppid, prependListener, prependOnceListener, rawListeners, reallyExit, ref, release, removeAllListeners, removeListener, report, resourceUsage, send, setegid, seteuid, setgid, setgroups, setMaxListeners, setSourceMapsEnabled, setuid, setUncaughtExceptionCaptureCallback, sourceMapsEnabled, stderr, stdin, stdout, throwDeprecation, title, traceDeprecation, umask, unref, uptime, version, versions, _process, process_default;
var init_process2 = __esm({
  "node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess = globalThis["process"];
    getBuiltinModule = globalProcess.getBuiltinModule;
    workerdProcess = getBuiltinModule("node:process");
    unenvProcess = new Process({
      env: globalProcess.env,
      hrtime,
      // `nextTick` is available from workerd process v1
      nextTick: workerdProcess.nextTick
    });
    ({ exit, features, platform } = workerdProcess);
    ({
      _channel,
      _debugEnd,
      _debugProcess,
      _disconnect,
      _events,
      _eventsCount,
      _exiting,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _handleQueue,
      _kill,
      _linkedBinding,
      _maxListeners,
      _pendingMessage,
      _preload_modules,
      _rawDebug,
      _send,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      arch,
      argv,
      argv0,
      assert: assert2,
      availableMemory,
      binding,
      channel,
      chdir,
      config,
      connected,
      constrainedMemory,
      cpuUsage,
      cwd,
      debugPort,
      disconnect,
      dlopen,
      domain,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exitCode,
      finalization,
      getActiveResourcesInfo,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getMaxListeners,
      getuid,
      hasUncaughtExceptionCaptureCallback,
      hrtime: hrtime3,
      initgroups,
      kill,
      listenerCount,
      listeners,
      loadEnvFile,
      mainModule,
      memoryUsage,
      moduleLoadList,
      nextTick,
      off,
      on,
      once,
      openStdin,
      permission,
      pid,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      reallyExit,
      ref,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      send,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setMaxListeners,
      setSourceMapsEnabled,
      setuid,
      setUncaughtExceptionCaptureCallback,
      sourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      throwDeprecation,
      title,
      traceDeprecation,
      umask,
      unref,
      uptime,
      version,
      versions
    } = unenvProcess);
    _process = {
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      hasUncaughtExceptionCaptureCallback,
      setUncaughtExceptionCaptureCallback,
      loadEnvFile,
      sourceMapsEnabled,
      arch,
      argv,
      argv0,
      chdir,
      config,
      connected,
      constrainedMemory,
      availableMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      disconnect,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exit,
      finalization,
      features,
      getBuiltinModule,
      getActiveResourcesInfo,
      getMaxListeners,
      hrtime: hrtime3,
      kill,
      listeners,
      listenerCount,
      memoryUsage,
      nextTick,
      on,
      off,
      once,
      pid,
      platform,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      setMaxListeners,
      setSourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      title,
      throwDeprecation,
      traceDeprecation,
      umask,
      uptime,
      version,
      versions,
      // @ts-expect-error old API
      domain,
      initgroups,
      moduleLoadList,
      reallyExit,
      openStdin,
      assert: assert2,
      binding,
      send,
      exitCode,
      channel,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getuid,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setuid,
      permission,
      mainModule,
      _events,
      _eventsCount,
      _exiting,
      _maxListeners,
      _debugEnd,
      _debugProcess,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _kill,
      _preload_modules,
      _rawDebug,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      _disconnect,
      _handleQueue,
      _pendingMessage,
      _channel,
      _send,
      _linkedBinding
    };
    process_default = _process;
  }
});

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default;
  }
});

// node_modules/damerau-levenshtein-js/app.js
var require_app = __commonJS({
  "node_modules/damerau-levenshtein-js/app.js"(exports, module) {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var initMatrix = /* @__PURE__ */ __name((s1, s2) => {
      if (void 0 == s1 || void 0 == s2) {
        return null;
      }
      let d = [];
      for (let i = 0; i <= s1.length; i++) {
        d[i] = [];
        d[i][0] = i;
      }
      for (let j = 0; j <= s2.length; j++) {
        d[0][j] = j;
      }
      return d;
    }, "initMatrix");
    var damerau = /* @__PURE__ */ __name((i, j, s1, s2, d, cost) => {
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        d[i][j] = Math.min.apply(null, [d[i][j], d[i - 2][j - 2] + cost]);
      }
    }, "damerau");
    var distance2 = /* @__PURE__ */ __name((s1, s2) => {
      if (void 0 == s1 || void 0 == s2 || "string" !== typeof s1 || "string" !== typeof s2) {
        return -1;
      }
      let d = initMatrix(s1, s2);
      if (null === d) {
        return -1;
      }
      for (var i = 1; i <= s1.length; i++) {
        let cost;
        for (let j = 1; j <= s2.length; j++) {
          if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min.apply(null, [
            d[i - 1][j] + 1,
            d[i][j - 1] + 1,
            d[i - 1][j - 1] + cost
          ]);
          damerau(i, j, s1, s2, d, cost);
        }
      }
      return d[s1.length][s2.length];
    }, "distance");
    var distanceProm = /* @__PURE__ */ __name((s1, s2) => new Promise((resolve2, reject) => {
      let result = distance2(s1, s2);
      if (0 <= result) {
        resolve2(result);
      } else {
        reject(result);
      }
    }), "distanceProm");
    var minDistanceProm = /* @__PURE__ */ __name((s1, list) => new Promise((resolve2, reject) => {
      if (void 0 == list || !Array.isArray(list)) {
        reject(-1);
        return;
      } else if (0 === list.length) {
        resolve2(distance2(s1, ""));
        return;
      }
      let min = -2;
      list.forEach((s2) => {
        let d = distance2(s1, s2);
        if (-2 === min || d < min) {
          min = d;
        }
      });
      if (0 <= min) {
        resolve2(min);
      } else {
        reject(min);
      }
    }), "minDistanceProm");
    module.exports = {
      distanceProm,
      distance: distance2,
      minDistanceProm
    };
  }
});

// node_modules/number-to-words/numberToWords.min.js
var require_numberToWords_min = __commonJS({
  "node_modules/number-to-words/numberToWords.min.js"(exports, module) {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    !(function() {
      "use strict";
      var e = "object" == typeof self && self.self === self && self || "object" == typeof global && global.global === global && global || this, t = 9007199254740991;
      function f(e2) {
        return !("number" != typeof e2 || e2 != e2 || e2 === 1 / 0 || e2 === -1 / 0);
      }
      __name(f, "f");
      function l(e2) {
        return "number" == typeof e2 && Math.abs(e2) <= t;
      }
      __name(l, "l");
      var r = /(hundred|thousand|(m|b|tr|quadr)illion)$/, n = /teen$/, o = /y$/, i = /(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/, h = { zero: "zeroth", one: "first", two: "second", three: "third", four: "fourth", five: "fifth", six: "sixth", seven: "seventh", eight: "eighth", nine: "ninth", ten: "tenth", eleven: "eleventh", twelve: "twelfth" };
      function a(e2) {
        return r.test(e2) || n.test(e2) ? e2 + "th" : o.test(e2) ? e2.replace(o, "ieth") : i.test(e2) ? e2.replace(i, s) : e2;
      }
      __name(a, "a");
      function s(e2, t2) {
        return h[t2];
      }
      __name(s, "s");
      var u = 10, p = 100, d = 1e3, v = 1e6, b = 1e9, y = 1e12, c = 1e15, m = 9007199254740992, g = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"], w = ["zero", "ten", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
      function M(e2, t2) {
        var r2, n2 = "number" == typeof e2 ? e2 < 0 ? Math.ceil(e2) : Math.floor(e2) : parseInt(e2, 10);
        if (!f(n2)) throw new TypeError("Not a finite number: " + e2 + " (" + typeof e2 + ")");
        if (!l(n2)) throw new RangeError("Input is not a safe number, it\u2019s either too large or too small.");
        return r2 = (/* @__PURE__ */ __name(function e3(t3) {
          var r3, n3, o2 = arguments[1];
          if (0 === t3) return o2 ? o2.join(" ").replace(/,$/, "") : "zero";
          o2 || (o2 = []);
          t3 < 0 && (o2.push("minus"), t3 = Math.abs(t3));
          t3 < 20 ? (r3 = 0, n3 = g[t3]) : t3 < p ? (r3 = t3 % u, n3 = w[Math.floor(t3 / u)], r3 && (n3 += "-" + g[r3], r3 = 0)) : t3 < d ? (r3 = t3 % p, n3 = e3(Math.floor(t3 / p)) + " hundred") : t3 < v ? (r3 = t3 % d, n3 = e3(Math.floor(t3 / d)) + " thousand,") : t3 < b ? (r3 = t3 % v, n3 = e3(Math.floor(t3 / v)) + " million,") : t3 < y ? (r3 = t3 % b, n3 = e3(Math.floor(t3 / b)) + " billion,") : t3 < c ? (r3 = t3 % y, n3 = e3(Math.floor(t3 / y)) + " trillion,") : t3 <= m && (r3 = t3 % c, n3 = e3(Math.floor(t3 / c)) + " quadrillion,");
          o2.push(n3);
          return e3(r3, o2);
        }, "e"))(n2), t2 ? a(r2) : r2;
      }
      __name(M, "M");
      var x = { toOrdinal: /* @__PURE__ */ __name(function(e2) {
        var t2 = "number" == typeof e2 ? e2 < 0 ? Math.ceil(e2) : Math.floor(e2) : parseInt(e2, 10);
        if (!f(t2)) throw new TypeError("Not a finite number: " + e2 + " (" + typeof e2 + ")");
        if (!l(t2)) throw new RangeError("Input is not a safe number, it\u2019s either too large or too small.");
        var r2 = String(t2), n2 = Math.abs(t2 % 100), o2 = 11 <= n2 && n2 <= 13, i2 = r2.charAt(r2.length - 1);
        return r2 + (o2 ? "th" : "1" === i2 ? "st" : "2" === i2 ? "nd" : "3" === i2 ? "rd" : "th");
      }, "toOrdinal"), toWords: M, toWordsOrdinal: /* @__PURE__ */ __name(function(e2) {
        return a(M(e2));
      }, "toWordsOrdinal") };
      "undefined" != typeof exports ? ("undefined" != typeof module && module.exports && (exports = module.exports = x), exports.numberToWords = x) : e.numberToWords = x;
    })();
  }
});

// node_modules/roman-numerals/lib/toArabic.js
var require_toArabic = __commonJS({
  "node_modules/roman-numerals/lib/toArabic.js"(exports, module) {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    (function() {
      var forEach = Array.prototype.forEach;
      function toArabic2(roman) {
        if ("string" !== typeof roman && !(roman instanceof String)) throw new TypeError("toArabic expects a string");
        if (/^nulla$/i.test(roman) || !roman.length) return 0;
        roman = roman.toUpperCase().match(/^(M{0,3})(CM|DC{0,3}|CD|C{0,3})(XC|LX{0,3}|XL|X{0,3})(IX|VI{0,3}|IV|I{0,3})$/);
        if (!roman) throw new Error("toArabic expects a valid roman number");
        var arabic = 0;
        arabic += roman[1].length * 1e3;
        if (roman[2] === "CM") arabic += 900;
        else if (roman[2] === "CD") arabic += 400;
        else arabic += roman[2].length * 100 + (roman[2][0] === "D" ? 400 : 0);
        if (roman[3] === "XC") arabic += 90;
        else if (roman[3] === "XL") arabic += 40;
        else arabic += roman[3].length * 10 + (roman[3][0] === "L" ? 40 : 0);
        if (roman[4] === "IX") arabic += 9;
        else if (roman[4] === "IV") arabic += 4;
        else arabic += roman[4].length * 1 + (roman[4][0] === "V" ? 4 : 0);
        return arabic;
      }
      __name(toArabic2, "toArabic");
      ;
      module.exports = toArabic2;
    })();
  }
});

// node_modules/roman-numerals/lib/toRoman.js
var require_toRoman = __commonJS({
  "node_modules/roman-numerals/lib/toRoman.js"(exports, module) {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    (function() {
      function upToTen(num4, one, five, ten) {
        var value = "";
        switch (num4) {
          case 0:
            return value;
          case 9:
            return one + ten;
          case 4:
            return one + five;
        }
        if (num4 >= 5) value = five, num4 -= 5;
        while (num4-- > 0) value += one;
        return value;
      }
      __name(upToTen, "upToTen");
      function toRoman(arabic) {
        if (arabic instanceof Number) arabic = parseInt(arabic, 10);
        if ("string" === typeof arabic || arabic instanceof String) {
          arabic = parseInt(arabic, 10);
          if (isNaN(arabic)) throw new TypeError("toArabic expects a number");
        }
        if ("number" !== typeof arabic) throw new TypeError("toArabic expects a number");
        if (isNaN(arabic)) throw new TypeError("toArabic expects a real number");
        if (arabic < 0) throw new Error("toArabic cannot express negative numbers");
        if (arabic > 3999) throw new Error("toArabic cannot express numbers over 3999");
        if (arabic === 0) return "nulla";
        var roman = "";
        roman += upToTen(Math.floor(arabic / 1e3), "M", "", ""), arabic %= 1e3;
        roman += upToTen(Math.floor(arabic / 100), "C", "D", "M"), arabic %= 100;
        roman += upToTen(Math.floor(arabic / 10), "X", "L", "C"), arabic %= 10;
        roman += upToTen(arabic, "I", "V", "X");
        return roman;
      }
      __name(toRoman, "toRoman");
      ;
      module.exports = toRoman;
    })();
  }
});

// node_modules/roman-numerals/index.js
var require_roman_numerals = __commonJS({
  "node_modules/roman-numerals/index.js"(exports, module) {
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    (function() {
      module.exports = {
        toArabic: require_toArabic(),
        toRoman: require_toRoman()
      };
    })();
  }
});

// workers/room/index.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// workers/room/room.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// workers/room/engine.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// workers/room/protocol.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var PROTOCOL_VERSION = 1;
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var CODE_LENGTH = 4;
var ANSWER_WINDOW_MS = 5e3;
var IDLE_TEARDOWN_MS = 30 * 60 * 1e3;
function toRoomQuestion(t, words, powerIndex) {
  return {
    id: t.id,
    words,
    powerIndex,
    category: t.category,
    subcategory: t.subcategory,
    difficulty: t.difficulty,
    setName: t.setName
  };
}
__name(toRoomQuestion, "toRoomQuestion");
function makeRoomCode(random = Math.random) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx] ?? "A";
  }
  return out;
}
__name(makeRoomCode, "makeRoomCode");

// src/engine/pacing.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function wordDelay(word, baseMs) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const lengthFactor = 0.6 + 0.4 * Math.min(2.5, letters / 5);
  let ms = baseMs * lengthFactor;
  if (/[.!?]['")\]]?$/.test(word)) ms += baseMs * 0.9;
  else if (/[,;:]['")\]]?$/.test(word)) ms += baseMs * 0.35;
  return ms;
}
__name(wordDelay, "wordDelay");
function buildSchedule(words, wpm) {
  const baseMs = 6e4 / Math.max(20, wpm);
  const out = new Array(words.length);
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    out[i] = acc;
    acc += wordDelay(words[i] ?? "", baseMs);
  }
  return out;
}
__name(buildSchedule, "buildSchedule");
function revealedAt(schedule, elapsed) {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if ((schedule[mid] ?? 0) <= elapsed) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
__name(revealedAt, "revealedAt");

// src/engine/scoring.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/engine/power.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var MARKER = "(*)";
function parseQuestion(questionSanitized) {
  const tokens = questionSanitized.split(/\s+/).filter((t) => t.length > 0);
  const words = [];
  let powerIndex = null;
  for (const token of tokens) {
    if (token === MARKER) {
      if (powerIndex === null) powerIndex = words.length - 1;
      continue;
    }
    if (token.includes(MARKER)) {
      const stripped = token.split(MARKER).join("").trim();
      if (stripped.length > 0) words.push(stripped);
      if (powerIndex === null) powerIndex = words.length - 1;
      continue;
    }
    words.push(token);
  }
  if (powerIndex !== null && powerIndex < 0) powerIndex = null;
  return { words, powerIndex };
}
__name(parseQuestion, "parseQuestion");
function isPower(buzzWordIndex, powerIndex) {
  if (buzzWordIndex === null || powerIndex === null) return false;
  return buzzWordIndex <= powerIndex;
}
__name(isPower, "isPower");

// src/engine/scoring.ts
function scoreTossup(opts) {
  const { buzzWordIndex, powerIndex, correct } = opts;
  const buzzed = buzzWordIndex !== null;
  if (!buzzed) {
    return { points: correct ? 10 : 0, powered: false, negged: false };
  }
  if (!correct) {
    return { points: -5, powered: false, negged: true };
  }
  const powered = isPower(buzzWordIndex, powerIndex);
  return { points: powered ? 15 : 10, powered, negged: false };
}
__name(scoreTossup, "scoreTossup");
function scoreBonusPart(correct, value = 10) {
  return correct ? value : 0;
}
__name(scoreBonusPart, "scoreBonusPart");

// workers/room/engine.ts
function createRoom(code) {
  return {
    code,
    phase: "lobby",
    players: {},
    question: null,
    answerline: null,
    answerSanitized: null,
    schedule: [],
    startedAt: null,
    frozenElapsed: 0,
    buzzer: null,
    buzzWordIndex: null,
    answerDeadline: null,
    lockedOut: [],
    reveal: null
  };
}
__name(createRoom, "createRoom");
function elapsedAt(s, now) {
  if (s.startedAt === null) return s.frozenElapsed;
  return s.frozenElapsed + (now - s.startedAt);
}
__name(elapsedAt, "elapsedAt");
function revealedNow(s, now) {
  if (!s.question) return 0;
  if (s.phase === "resolved") return s.question.words.length;
  return Math.min(
    revealedAt(s.schedule, elapsedAt(s, now)),
    s.question.words.length
  );
}
__name(revealedNow, "revealedNow");
function isFullyRead(s, now) {
  return s.question !== null && revealedNow(s, now) >= s.question.words.length;
}
__name(isFullyRead, "isFullyRead");
function playerViews(s) {
  return Object.values(s.players).map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
    lockedOut: s.lockedOut.includes(p.id)
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
__name(playerViews, "playerViews");
function snapshot(s, now) {
  return {
    v: PROTOCOL_VERSION,
    code: s.code,
    phase: s.phase,
    players: playerViews(s),
    question: s.question,
    revealed: revealedNow(s, now),
    serverNow: now,
    clock: { elapsed: elapsedAt(s, now), running: s.startedAt !== null },
    schedule: s.schedule,
    buzzer: s.buzzer,
    answerDeadline: s.answerDeadline,
    reveal: s.reveal
  };
}
__name(snapshot, "snapshot");
var NOTHING = { messages: [] };
function join(s, playerId, name, now) {
  const existing = s.players[playerId];
  if (existing) {
    existing.connected = true;
    existing.name = name || existing.name;
  } else {
    s.players[playerId] = {
      id: playerId,
      name: name || "player",
      score: 0,
      connected: true
    };
  }
  return { messages: [{ t: "state", snapshot: snapshot(s, now) }] };
}
__name(join, "join");
function leave(s, playerId, now) {
  const p = s.players[playerId];
  if (!p) return NOTHING;
  p.connected = false;
  if (s.buzzer === playerId && s.phase === "buzzed") {
    return timeout(s, now);
  }
  return { messages: [{ t: "state", snapshot: snapshot(s, now) }] };
}
__name(leave, "leave");
function startQuestion(s, opts, now) {
  s.phase = "reading";
  s.question = opts.question;
  s.answerline = opts.answerline;
  s.answerSanitized = opts.answerSanitized;
  s.schedule = opts.schedule;
  s.startedAt = now;
  s.frozenElapsed = 0;
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;
  s.lockedOut = [];
  s.reveal = null;
  const last = opts.schedule[opts.schedule.length - 1] ?? 0;
  return {
    messages: [{ t: "state", snapshot: snapshot(s, now) }],
    wakeAt: now + last
  };
}
__name(startQuestion, "startQuestion");
function buzz(s, playerId, now) {
  if (s.phase !== "reading") {
    return {
      messages: [{ t: "error", message: "not accepting buzzes" }]
    };
  }
  if (!s.players[playerId]) {
    return { messages: [{ t: "error", message: "not in this room" }] };
  }
  if (s.lockedOut.includes(playerId)) {
    return { messages: [{ t: "error", message: "locked out on this question" }] };
  }
  const elapsed = elapsedAt(s, now);
  s.frozenElapsed = elapsed;
  s.startedAt = null;
  const revealed = Math.min(
    revealedAt(s.schedule, elapsed),
    s.question?.words.length ?? 0
  );
  s.phase = "buzzed";
  s.buzzer = playerId;
  s.buzzWordIndex = Math.max(0, revealed - 1);
  s.answerDeadline = now + ANSWER_WINDOW_MS;
  return {
    messages: [
      {
        t: "buzz",
        playerId,
        wordIndex: s.buzzWordIndex,
        answerDeadline: s.answerDeadline,
        serverNow: now
      }
    ],
    wakeAt: s.answerDeadline
  };
}
__name(buzz, "buzz");
function applyJudgement(s, playerId, given, judgement, now) {
  if (s.phase !== "buzzed" || s.buzzer !== playerId) {
    return { messages: [{ t: "error", message: "you do not hold the buzz" }] };
  }
  if (judgement.directive === "prompt") {
    s.answerDeadline = now + ANSWER_WINDOW_MS;
    const msg = {
      t: "judged",
      playerId,
      given,
      directive: "prompt",
      points: 0,
      powered: false,
      resolved: false,
      ...judgement.directedPrompt ? { directedPrompt: judgement.directedPrompt } : {}
    };
    return { messages: [msg], wakeAt: s.answerDeadline };
  }
  const correct = judgement.directive === "accept";
  const outcome = scoreTossup({
    buzzWordIndex: s.buzzWordIndex,
    powerIndex: s.question?.powerIndex ?? null,
    correct
  });
  const player = s.players[playerId];
  if (player) player.score += outcome.points;
  if (correct) {
    return resolve(s, playerId, outcome.points, outcome.powered, given, now);
  }
  s.lockedOut.push(playerId);
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;
  const messages = [
    {
      t: "judged",
      playerId,
      given,
      directive: "reject",
      points: outcome.points,
      powered: false,
      resolved: false
    }
  ];
  if (s.frozenElapsed >= (s.schedule[s.schedule.length - 1] ?? 0)) {
    const done = resolve(s, null, 0, false, given, now);
    return { messages: [...messages, ...done.messages] };
  }
  s.phase = "reading";
  s.startedAt = now;
  const remaining = (s.schedule[s.schedule.length - 1] ?? 0) - s.frozenElapsed;
  messages.push({ t: "state", snapshot: snapshot(s, now) });
  return { messages, wakeAt: now + Math.max(0, remaining) };
}
__name(applyJudgement, "applyJudgement");
function timeout(s, now) {
  if (s.phase !== "buzzed" || s.buzzer === null) return NOTHING;
  return applyJudgement(s, s.buzzer, "", { directive: "reject" }, now);
}
__name(timeout, "timeout");
function finishReading(s, now) {
  if (s.phase !== "reading") return NOTHING;
  if (!isFullyRead(s, now)) return NOTHING;
  return resolve(s, null, 0, false, "", now);
}
__name(finishReading, "finishReading");
function abandonQuestion(s, now) {
  if (s.phase !== "reading" && s.phase !== "buzzed") return NOTHING;
  return resolve(s, null, 0, false, "", now);
}
__name(abandonQuestion, "abandonQuestion");
function resolve(s, winner, points, powered, given, now) {
  s.phase = "resolved";
  s.startedAt = null;
  s.buzzer = null;
  s.answerDeadline = null;
  s.reveal = {
    answerSanitized: s.answerSanitized ?? "",
    winner,
    points,
    powered
  };
  const messages = [];
  if (winner) {
    messages.push({
      t: "judged",
      playerId: winner,
      given,
      directive: "accept",
      points,
      powered,
      resolved: true
    });
  }
  messages.push({ t: "state", snapshot: snapshot(s, now) });
  return { messages };
}
__name(resolve, "resolve");
function nextQuestion(s, now) {
  s.phase = "lobby";
  s.question = null;
  s.answerline = null;
  s.answerSanitized = null;
  s.schedule = [];
  s.startedAt = null;
  s.frozenElapsed = 0;
  s.buzzer = null;
  s.buzzWordIndex = null;
  s.answerDeadline = null;
  s.lockedOut = [];
  s.reveal = null;
  return { messages: [{ t: "state", snapshot: snapshot(s, now) }] };
}
__name(nextQuestion, "nextQuestion");
function nextWake(s, now) {
  if (s.phase === "buzzed") return s.answerDeadline;
  if (s.phase === "reading") {
    const last = s.schedule[s.schedule.length - 1] ?? 0;
    const remaining = last - elapsedAt(s, now);
    return now + Math.max(0, remaining);
  }
  return null;
}
__name(nextWake, "nextWake");
function everyoneLockedOut(s) {
  const live = Object.values(s.players).filter((p) => p.connected);
  if (live.length === 0) return false;
  return live.every((p) => s.lockedOut.includes(p.id));
}
__name(everyoneLockedOut, "everyoneLockedOut");

// src/engine/judge.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// node_modules/qb-answer-checker/src/check-answer.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// node_modules/qb-answer-checker/src/contains-tokens.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var import_damerau_levenshtein_js = __toESM(require_app(), 1);

// node_modules/stemmer/index.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var step2list = {
  ational: "ate",
  tional: "tion",
  enci: "ence",
  anci: "ance",
  izer: "ize",
  bli: "ble",
  alli: "al",
  entli: "ent",
  eli: "e",
  ousli: "ous",
  ization: "ize",
  ation: "ate",
  ator: "ate",
  alism: "al",
  iveness: "ive",
  fulness: "ful",
  ousness: "ous",
  aliti: "al",
  iviti: "ive",
  biliti: "ble",
  logi: "log"
};
var step3list = {
  icate: "ic",
  ative: "",
  alize: "al",
  iciti: "ic",
  ical: "ic",
  ful: "",
  ness: ""
};
var consonant = "[^aeiou]";
var vowel = "[aeiouy]";
var consonants = "(" + consonant + "[^aeiouy]*)";
var vowels = "(" + vowel + "[aeiou]*)";
var gt0 = new RegExp("^" + consonants + "?" + vowels + consonants);
var eq1 = new RegExp(
  "^" + consonants + "?" + vowels + consonants + vowels + "?$"
);
var gt1 = new RegExp("^" + consonants + "?(" + vowels + consonants + "){2,}");
var vowelInStem = new RegExp("^" + consonants + "?" + vowel);
var consonantLike = new RegExp("^" + consonants + vowel + "[^aeiouwxy]$");
var sfxLl = /ll$/;
var sfxE = /^(.+?)e$/;
var sfxY = /^(.+?)y$/;
var sfxIon = /^(.+?(s|t))(ion)$/;
var sfxEdOrIng = /^(.+?)(ed|ing)$/;
var sfxAtOrBlOrIz = /(at|bl|iz)$/;
var sfxEED = /^(.+?)eed$/;
var sfxS = /^.+?[^s]s$/;
var sfxSsesOrIes = /^.+?(ss|i)es$/;
var sfxMultiConsonantLike = /([^aeiouylsz])\1$/;
var step2 = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
var step3 = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
var step4 = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
function stemmer(value) {
  let result = String(value).toLowerCase();
  if (result.length < 3) {
    return result;
  }
  let firstCharacterWasLowerCaseY = false;
  if (result.codePointAt(0) === 121) {
    firstCharacterWasLowerCaseY = true;
    result = "Y" + result.slice(1);
  }
  if (sfxSsesOrIes.test(result)) {
    result = result.slice(0, -2);
  } else if (sfxS.test(result)) {
    result = result.slice(0, -1);
  }
  let match;
  if (match = sfxEED.exec(result)) {
    if (gt0.test(match[1])) {
      result = result.slice(0, -1);
    }
  } else if ((match = sfxEdOrIng.exec(result)) && vowelInStem.test(match[1])) {
    result = match[1];
    if (sfxAtOrBlOrIz.test(result)) {
      result += "e";
    } else if (sfxMultiConsonantLike.test(result)) {
      result = result.slice(0, -1);
    } else if (consonantLike.test(result)) {
      result += "e";
    }
  }
  if ((match = sfxY.exec(result)) && vowelInStem.test(match[1])) {
    result = match[1] + "i";
  }
  if ((match = step2.exec(result)) && gt0.test(match[1])) {
    result = match[1] + step2list[match[2]];
  }
  if ((match = step3.exec(result)) && gt0.test(match[1])) {
    result = match[1] + step3list[match[2]];
  }
  if (match = step4.exec(result)) {
    if (gt1.test(match[1])) {
      result = match[1];
    }
  } else if ((match = sfxIon.exec(result)) && gt1.test(match[1])) {
    result = match[1];
  }
  if ((match = sfxE.exec(result)) && (gt1.test(match[1]) || eq1.test(match[1]) && !consonantLike.test(match[1]))) {
    result = match[1];
  }
  if (sfxLl.test(result) && gt1.test(result)) {
    result = result.slice(0, -1);
  }
  if (firstCharacterWasLowerCaseY) {
    result = "y" + result.slice(1);
  }
  return result;
}
__name(stemmer, "stemmer");

// node_modules/qb-answer-checker/src/contains-tokens.js
function referenceContainsTokens(tokens, references, strictness, acceptSubstring, useStemmer) {
  let index = 0;
  for (const token of tokens) {
    let containsToken = false;
    while (index < references.length) {
      const reference = references[index];
      index++;
      const errors = useStemmer ? (0, import_damerau_levenshtein_js.distance)(stemmer(token), stemmer(reference)) : (0, import_damerau_levenshtein_js.distance)(token, reference);
      if (strictness > 0 && strictness * errors <= reference.length) {
        containsToken = true;
        break;
      }
      if (acceptSubstring && reference.includes(token)) {
        containsToken = true;
        break;
      }
      if (errors === 0) {
        containsToken = true;
        break;
      }
    }
    if (!containsToken) {
      return false;
    }
  }
  return true;
}
__name(referenceContainsTokens, "referenceContainsTokens");

// node_modules/qb-answer-checker/src/generate-unformatted-answers.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// node_modules/qb-answer-checker/src/utils.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function extractKeyWords(string) {
  const requiredWords = extractUnderlining(string).split(" ");
  string = string.split(" ").filter((token) => token.length > 0).filter((token) => token.match(/<\/?u>/) || requiredWords.includes(token)).reduce((prev, curr) => prev + curr + " ", "").trim();
  return removeHTMLTags(string);
}
__name(extractKeyWords, "extractKeyWords");
function extractQuotes(string) {
  const matches = string.match(/"[^"]*(?=["])/g)?.map((match) => match.slice(1));
  if (matches) {
    return removeHTMLTags(matches.reduce((prev, curr) => prev + " " + curr, "").trim());
  } else {
    return removeHTMLTags(string);
  }
}
__name(extractQuotes, "extractQuotes");
function extractUnderlining(string) {
  const matches = string.match(/<u>[^<]*(?=<\/u>)/g)?.map((match) => match.slice(3));
  if (matches) {
    return removeHTMLTags(matches.reduce((prev, curr) => prev + curr + " ", "").trim());
  } else {
    return removeHTMLTags(string);
  }
}
__name(extractUnderlining, "extractUnderlining");
function removeHTMLTags(string) {
  return string.replace(/<[^>]*>/g, "");
}
__name(removeHTMLTags, "removeHTMLTags");
function removePunctuation(string) {
  return string.replace(/[.,!;:'"\\/?@#$%^&*_~’]/g, "");
}
__name(removePunctuation, "removePunctuation");

// node_modules/qb-answer-checker/src/generate-unformatted-answers.js
var elements = {
  hydrogen: ["h"],
  helium: ["he"],
  lithium: ["li"],
  beryllium: ["be"],
  boron: ["b"],
  carbon: ["c"],
  nitrogen: ["n"],
  oxygen: ["o"],
  fluorine: ["f"],
  neon: ["ne"],
  sodium: ["na"],
  magnesium: ["mg"],
  aluminum: ["al"],
  silicon: ["si"],
  phosphorus: ["p"],
  sulfur: ["s"],
  chlorine: ["cl"],
  argon: ["ar"],
  potassium: ["k"],
  calcium: ["ca"],
  scandium: ["sc"],
  titanium: ["ti"],
  vanadium: ["v"],
  chromium: ["cr"],
  manganese: ["mn"],
  iron: ["fe"],
  cobalt: ["co"],
  nickel: ["ni"],
  copper: ["cu"],
  zinc: ["zn"],
  gallium: ["ga"],
  germanium: ["ge"],
  arsenic: ["as"],
  selenium: ["se"],
  bromine: ["br"],
  krypton: ["kr"],
  rubidium: ["rb"],
  strontium: ["sr"],
  yttrium: ["y"],
  zirconium: ["zr"],
  niobium: ["nb"],
  molybdenum: ["mo"],
  technetium: ["tc"],
  ruthenium: ["ru"],
  rhodium: ["rh"],
  palladium: ["pd"],
  silver: ["ag"],
  cadmium: ["cd"],
  indium: ["in"],
  tin: ["sn"],
  antimony: ["sb"],
  tellurium: ["te"],
  iodine: ["i"],
  xenon: ["xe"],
  cesium: ["cs"],
  barium: ["ba"],
  lanthanum: ["la"],
  cerium: ["ce"],
  praseodymium: ["pr"],
  neodymium: ["nd"],
  promethium: ["pm"],
  samarium: ["sm"],
  europium: ["eu"],
  gadolinium: ["gd"],
  terbium: ["tb"],
  dysprosium: ["dy"],
  holmium: ["ho"],
  erbium: ["er"],
  thulium: ["tm"],
  ytterbium: ["yb"],
  lutetium: ["lu"],
  hafnium: ["hf"],
  tantalum: ["ta"],
  tungsten: ["w"],
  rhenium: ["re"],
  osmium: ["os"],
  iridium: ["ir"],
  platinum: ["pt"],
  gold: ["au"],
  mercury: ["hg"],
  thallium: ["tl"],
  lead: ["pb"],
  bismuth: ["bi"],
  polonium: ["po"],
  astatine: ["at"],
  radon: ["rn"],
  francium: ["fr"],
  radium: ["ra"],
  actinium: ["ac"],
  thorium: ["th"],
  protactinium: ["pa"],
  uranium: ["u"],
  neptunium: ["np"],
  plutonium: ["pu"],
  americium: ["am"],
  curium: ["cm"],
  berkelium: ["bk"],
  californium: ["cf"],
  einsteinium: ["es"],
  fermium: ["fm"],
  mendelevium: ["md"],
  nobelium: ["no"],
  lawrencium: ["lr"],
  rutherfordium: ["rf"],
  dubnium: ["db"],
  seaborgium: ["sg"],
  bohrium: ["bh"],
  hassium: ["hs"],
  meitnerium: ["mt"],
  darmstadtium: ["ds"],
  roentgenium: ["rg"],
  copernicium: ["cn"],
  nihonium: ["nh"],
  flerovium: ["fl"],
  moscovium: ["mc"],
  livermorium: ["lv"],
  tennessine: ["ts"],
  oganesson: ["og"]
};
var equivalentAnswers = {
  ...elements,
  "atomic bombs": ["atomic weapons", "nuclear bombs", "nuclear weapons", "nukes", "fission bombs", "A-bombs"],
  "nuclear weapons": ["atomic bombs", "atomic weapons", "nuclear bombs", "nukes", "fission bombs", "A-bombs"],
  nukes: ["atomic bombs", "atomic weapons", "nuclear bombs", "nuclear weapons", "fission bombs", "A-bombs"],
  fairytales: ["fairy tales"],
  "fairy tales": ["fairytales"],
  house: ["home", "dwelling", "residence"],
  mouse: ["mice"],
  rail: ["railroad"],
  railroad: ["rail"],
  "nineteen eighty-four": ["1984", "nineteen eighty four"],
  "nineteen eighty four": ["1984", "nineteen eighty-four"],
  "oxidation number": ["oxidation state"],
  "oxidation state": ["oxidation number"],
  "ralph vaughan-williams": ["rvw"],
  spacewalk: ["space walk"],
  spacewalks: ["space walk"],
  "sugar cane": ["sugarcane"],
  sugarcane: ["sugar cane"],
  wavefunction: ["wave function"],
  "Gulf of Mexico": ["Gulf of America"],
  "wave function": ["wavefunction"],
  "world war 1": ["first world war", "great war", "world war i", "world war one"],
  "world war i": ["first world war", "great war", "world war 1", "world war one"],
  "world war one": ["first world war", "great war", "world war 1", "world war i"],
  "world war ii": ["ww2", "wwii", "world war 2", "world war two", "second world war"],
  "world war two": ["ww2", "wwii", "world war ii", "world war 2", "second world war"],
  "world war 2": ["ww2", "wwii", "world war ii", "world war two", "second world war"],
  "Kanye West": ["kayne", "west"],
  superconductors: ["super conductors", "super conductor"],
  "baha' i": ["bahai"],
  "united states of america": ["united states", "usa", "us", "america"],
  "the united states of america": ["united states", "usa", "us", "america"],
  usa: ["united states", "us", "america"]
};
function getAbbreviation(string) {
  return string.split(" ").filter((token) => token.length > 0).map((token) => removeHTMLTags(token).charAt(0)).reduce((a, b) => a + b, "").trim();
}
__name(getAbbreviation, "getAbbreviation");
function generateUnformattedAnswers(formattedAnswer, isMainAnswer) {
  if (/-/.test(formattedAnswer)) {
    const object1 = generateUnformattedAnswers(formattedAnswer.replace(/-/g, " "), isMainAnswer);
    const object2 = generateUnformattedAnswers(formattedAnswer.replace(/-/g, ""), isMainAnswer);
    return [...object1, ...object2];
  }
  const answers = [
    removeHTMLTags(formattedAnswer),
    extractUnderlining(formattedAnswer),
    extractKeyWords(formattedAnswer),
    extractQuotes(formattedAnswer)
  ];
  if (isMainAnswer) {
    for (const answer of [formattedAnswer, extractUnderlining(formattedAnswer)]) {
      const abbreviation = getAbbreviation(answer);
      if (abbreviation.length > 1) {
        answers.push(abbreviation);
      }
    }
  }
  if (answers[0] in equivalentAnswers) {
    answers.push(...equivalentAnswers[answers[0]]);
  }
  return answers.map((answer) => removePunctuation(answer));
}
__name(generateUnformattedAnswers, "generateUnformattedAnswers");

// node_modules/qb-answer-checker/src/get-special-directives.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// node_modules/qb-answer-checker/src/constants.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var DIRECTIVES = {
  accept: ["accept", "or", "antiprompt on", "anti-prompt on", "antiprompt", "anti-prompt"],
  prompt: ["prompt on", "prompt"],
  reject: ["reject", "do not accept or prompt on", "do not accept", "do not prompt on", "do not prompt"]
};
var DIRECTIVES_FLATTENED = Object.values(DIRECTIVES).flat();
var SPECIAL_DIRECTIVES = {
  "accept either": ["accept either", "accept any"],
  "prompt on partial": ["prompt on partial", "prompt on a partial", "prompt on either"]
};

// node_modules/qb-answer-checker/src/get-special-directives.js
function getSpecialDirectives(answerline) {
  const directives = [];
  for (const directive of Object.keys(SPECIAL_DIRECTIVES)) {
    for (const phrase of SPECIAL_DIRECTIVES[directive]) {
      if (answerline.includes(phrase)) {
        directives.push(directive);
      }
    }
  }
  return directives;
}
__name(getSpecialDirectives, "getSpecialDirectives");

// node_modules/qb-answer-checker/src/split-into-sections.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function removeParentheses(string) {
  return string.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "");
}
__name(removeParentheses, "removeParentheses");
function splitIntoSections(answerline) {
  const mainSection = removeParentheses(answerline);
  let bracketSections = answerline.match(/\[[^\]]*(?=\])/g) ?? [];
  bracketSections = bracketSections.map((section) => section.slice(1));
  let parenthesisSections = answerline.match(/\([^)]*(?=\))/g) ?? [];
  parenthesisSections = parenthesisSections.map((section) => section.slice(1));
  bracketSections = bracketSections.filter((section) => DIRECTIVES_FLATTENED.some((directive) => section.startsWith(directive)));
  parenthesisSections = parenthesisSections.filter((section) => DIRECTIVES_FLATTENED.some((directive) => section.startsWith(directive)));
  return [mainSection, ...bracketSections, ...parenthesisSections];
}
__name(splitIntoSections, "splitIntoSections");

// node_modules/qb-answer-checker/src/split-section-into-clauses.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function getDirective(clause) {
  for (const directive of Object.keys(DIRECTIVES)) {
    for (const phrase of DIRECTIVES[directive]) {
      if (clause.startsWith(phrase)) {
        clause = clause.replace(phrase, "").trim();
        return { directive, clause };
      }
    }
  }
  return { directive: "accept", clause };
}
__name(getDirective, "getDirective");
function getDirectedPrompt(clause) {
  for (const key of ["by asking", "with"]) {
    const index = clause.indexOf(key);
    if (index < 0) {
      continue;
    }
    const directedPrompt = extractQuotes(clause.slice(index + key.length));
    clause = clause.slice(0, index).trim();
    return { directedPrompt, clause };
  }
  return { clause };
}
__name(getDirectedPrompt, "getDirectedPrompt");
function splitSectionIntoParsedClauses(section, isMainAnswer) {
  const clauses = section.split(";").map((clause) => clause.trim());
  const regex = isMainAnswer ? /,? or / : /,? or |, /;
  const parsedClauses = [];
  for (let clause of clauses) {
    let directive;
    ({ directive, clause } = getDirective(clause));
    let directedPrompt;
    if (directive === "prompt") {
      ({ directedPrompt, clause } = getDirectedPrompt(clause));
    }
    let formattedAnswers = clause.split(regex);
    formattedAnswers = formattedAnswers.map((token) => token.trim()).filter((token) => token.length > 0);
    parsedClauses.push({ directive, formattedAnswers, directedPrompt, isMainAnswer });
  }
  return parsedClauses;
}
__name(splitSectionIntoParsedClauses, "splitSectionIntoParsedClauses");

// node_modules/qb-answer-checker/src/tokenize.js
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var import_number_to_words = __toESM(require_numberToWords_min(), 1);
var import_roman_numerals = __toESM(require_roman_numerals(), 1);
var { toWords } = import_number_to_words.default;
var typoCorrections = {
  \u0441ontainor: "container",
  \u0441ontainors: "containers",
  \u0441ontains: "contains",
  contentinal: "continental",
  \u00E9valuate: "evaluate",
  mittani: "mitanni",
  ludmilla: "lyudmila",
  grandma: "grandmother",
  grandpa: "grandfather",
  sulayman: "solomon"
};
var ordinalConversions = {
  "1st": "first",
  "2nd": "second",
  "3rd": "third",
  "4th": "fourth",
  "5th": "fifth",
  "6th": "sixth",
  "7th": "seventh",
  "8th": "eighth",
  "9th": "ninth",
  "10th": "tenth",
  "11th": "eleventh",
  "12th": "twelfth",
  "13th": "thirteenth",
  "14th": "fourteenth",
  "15th": "fifteenth",
  "16th": "sixteenth",
  "17th": "seventeenth",
  "18th": "eighteenth",
  "19th": "nineteenth",
  "20th": "twentieth",
  "30th": "thirtieth",
  "40th": "fortieth",
  "50th": "fiftieth",
  "60th": "sixtieth",
  "70th": "seventieth",
  "80th": "eightieth",
  "90th": "ninetieth"
};
var honorificConversions = {
  dr: "doctor",
  st: "saint",
  mr: "mister",
  mrs: "missus",
  ms: "miss",
  esq: "esquire",
  jr: "junior",
  sr: "senior",
  rev: "reverend",
  fr: "father",
  prof: "professor",
  hon: "honorable",
  pres: "president",
  vp: "vice president",
  gov: "governor",
  ofc: "officer",
  pr: "pastor",
  br: "brother",
  rep: "representative",
  // 'M': 'Monsieur', this might convert things that are not honorifics.
  Mme: "Madame",
  Mlle: "Mademoiselle",
  Hr: "Herr",
  Fr: "Frau"
};
var unitConversions = {
  // SI units
  // 's': 'second',
  // 'm': 'metere',
  kg: "kilogram",
  mol: "mole",
  cd: "candela",
  // 'A': 'ampere',
  // 'K': 'kelvin',
  // 22 Derived units
  Hz: "hertz",
  // 'N': 'newton',
  Pa: "pascal",
  rad: "radian",
  // 'sr': 'steradian',
  W: "watt",
  // 'C': 'coulomb', // might be speed of light?
  J: "joule",
  V: "volt",
  Wb: "weber",
  F: "farad",
  Ohm: "ohm",
  \u03A9: "ohm",
  // 'S': 'siemens',
  kat: "katal",
  lm: "lumen",
  lx: "lux",
  Bq: "becquerel",
  Gy: "gray",
  Sv: "sievert",
  // imperical units
  in: "inch",
  ft: "foot",
  yd: "yard",
  mi: "mile",
  nmi: "nautical mile",
  sqmi: "square mile",
  gal: "gallon",
  qt: "quart",
  pt: "pint",
  cup: "cup"
};
var britishConversions = {
  colour: "color",
  flavour: "flavor",
  humour: "humor",
  labour: "labor",
  neighbour: "neighbor",
  odour: "odor",
  organize: "organise",
  leukaemia: "leukemia",
  manoeuvre: "maneuver",
  oestrogen: "estrogen",
  paediatric: "pediatric"
};
var muhammadConversions = {
  muhammed: "muhammad",
  muhamad: "muhammad",
  mohammad: "muhammad",
  mohammed: "muhammad",
  mahammad: "muhammad",
  maxammed: "muhammad",
  mehemmed: "muhammad",
  mohamad: "muhammad",
  mohamed: "muhammad"
};
function romanToWord(token) {
  try {
    token = (0, import_roman_numerals.toArabic)(token);
  } catch (e) {
    if (e.message !== "toArabic expects a valid roman number" && !(e instanceof TypeError)) {
      throw e;
    } else {
      return token;
    }
  }
  return toWords(token);
}
__name(romanToWord, "romanToWord");
function tokenize(string, sort = false) {
  const tokens = string.split(" ").filter((token) => token.length > 0);
  for (let i = 0; i <= tokens.length - 1; i++) {
    if (Object.prototype.hasOwnProperty.call(ordinalConversions, tokens[i])) {
      tokens[i] = ordinalConversions[tokens[i]];
    }
    if (Object.prototype.hasOwnProperty.call(honorificConversions, tokens[i])) {
      tokens[i] = honorificConversions[tokens[i]];
    }
    if (Object.prototype.hasOwnProperty.call(unitConversions, tokens[i])) {
      tokens[i] = unitConversions[tokens[i]];
    }
    if (Object.prototype.hasOwnProperty.call(britishConversions, tokens[i])) {
      tokens[i] = britishConversions[tokens[i]];
    }
    if (Object.prototype.hasOwnProperty.call(typoCorrections, tokens[i])) {
      tokens[i] = typoCorrections[tokens[i]];
    }
    if (Object.prototype.hasOwnProperty.call(muhammadConversions, tokens[i])) {
      tokens[i] = muhammadConversions[tokens[i]];
    }
    if (tokens[i].endsWith("s") && tokens[i].length > 1 && isFinite(tokens[i].at(-2))) {
      tokens[i] = tokens[i].slice(0, -1);
    }
    tokens[i] = romanToWord(tokens[i]);
    if (isFinite(tokens[i])) {
      tokens[i] = parseInt(tokens[i]);
      tokens[i] = tokens[i] <= 100 ? toWords(tokens[i]) : tokens[i].toString();
    }
  }
  return tokens.sort();
}
__name(tokenize, "tokenize");

// node_modules/qb-answer-checker/src/check-answer.js
function normalizeString(string) {
  return string.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(s\)/g, "s").replace(/["“‟❝”❞]/g, '"').replace(/[\u2018-\u201B]/g, "'").replace(/\p{Pd}/gu, "-").replace(/[\u00B7\u22C5\u2027]/g, "").replace(/<\/?i>/g, "");
}
__name(normalizeString, "normalizeString");
function checkAnswer(answerline, givenAnswer, strictness = 7, verbose = false) {
  if (typeof answerline !== "string" || typeof givenAnswer !== "string") {
    return { directive: "reject", directedPrompt: void 0 };
  }
  if (answerline === "" || givenAnswer === "") {
    return { directive: "reject", directedPrompt: void 0 };
  }
  if (typeof strictness !== "number" || strictness < 0) {
    strictness = 7;
  }
  if (/<b>/.test(answerline) && !/<u>/.test(answerline)) {
    answerline = answerline.replace(/<b>/g, "<u>").replace(/<\/b>/g, "</u>");
  }
  if (answerline.includes("[") && !answerline.includes("]")) {
    answerline = answerline + "]";
  }
  const isFormattedAnswerline = /<u>/.test(answerline);
  answerline = normalizeString(answerline);
  givenAnswer = normalizeString(givenAnswer);
  givenAnswer = removePunctuation(givenAnswer);
  const givenAnswerTokens = tokenize(givenAnswer, true);
  const sections = splitIntoSections(answerline);
  const parsedClauses = sections.flatMap((section, index) => splitSectionIntoParsedClauses(section, index === 0));
  const mainAnswer = parsedClauses[0].formattedAnswers[0];
  if (!isFormattedAnswerline && mainAnswer?.length > 1 && givenAnswer.length === 1 && isNaN(givenAnswer)) {
    return { directive: "reject" };
  }
  for (const specialDirective of getSpecialDirectives(answerline)) {
    if (specialDirective === "accept either") {
      parsedClauses.push({ directive: "accept", formattedAnswers: mainAnswer.split(" ") });
    }
    if (specialDirective === "prompt on partial") {
      parsedClauses.push({ directive: "prompt", formattedAnswers: mainAnswer.split(" ") });
    }
  }
  parsedClauses.sort((a, b) => (a.directive === "reject" ? -1 : 1) - (b.directive === "reject" ? -1 : 1));
  for (const { directive, formattedAnswers, directedPrompt, isMainAnswer } of parsedClauses) {
    for (const formattedAnswer of formattedAnswers) {
      for (const unformattedAnswer of generateUnformattedAnswers(formattedAnswer, isMainAnswer)) {
        if (unformattedAnswer === "") {
          continue;
        }
        const tokens = tokenize(unformattedAnswer, true);
        let matches;
        if (directive === "reject") {
          matches = unformattedAnswer === givenAnswer;
        } else {
          matches = referenceContainsTokens(
            isFormattedAnswerline ? tokens : givenAnswerTokens,
            isFormattedAnswerline ? givenAnswerTokens : tokens,
            strictness,
            !isFormattedAnswerline,
            true
          );
        }
        if (matches) {
          return { directive, directedPrompt };
        }
      }
    }
  }
  return { directive: "reject" };
}
__name(checkAnswer, "checkAnswer");
var check_answer_default = checkAnswer;

// src/engine/judge.ts
var DEFAULT_STRICTNESS = 2;
function coerceDirective(value) {
  if (value === "accept" || value === "prompt" || value === "reject") {
    return value;
  }
  return "reject";
}
__name(coerceDirective, "coerceDirective");
function judge(answerline, given, strictness = DEFAULT_STRICTNESS) {
  const trimmed = given.trim();
  if (trimmed.length === 0) return { directive: "reject" };
  try {
    const raw = check_answer_default(answerline, trimmed, strictness);
    const directive = coerceDirective(raw?.directive);
    const prompt = raw?.directedPrompt;
    return prompt ? { directive, directedPrompt: prompt } : { directive };
  } catch {
    return { directive: "reject" };
  }
}
__name(judge, "judge");

// src/data/qbreader.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/data/bundled.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var BUNDLED_TOSSUPS = [
  {
    "id": "bundled-t-001",
    "question": `This artist depicted a man in a bowler hat obscured by a green apple in The Son of Man, and he placed a locomotive emerging from a fireplace in Time Transfixed. (*) A pipe accompanied by the caption "Ceci n'est pas une pipe" appears in this artist's The Treachery of Images. This painter of The Human Condition depicted men in bowler hats raining from the sky in Golconda.`,
    "questionSanitized": `This artist depicted a man in a bowler hat obscured by a green apple in The Son of Man, and he placed a locomotive emerging from a fireplace in Time Transfixed. (*) A pipe accompanied by the caption "Ceci n'est pas une pipe" appears in this artist's The Treachery of Images. This painter of The Human Condition depicted men in bowler hats raining from the sky in Golconda.`,
    "answer": "<b><u>Ren\xE9 Magritte</u></b> [accept Magritte or Rene Magritte]",
    "answerSanitized": "Ren\xE9 Magritte [accept Magritte or Rene Magritte]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 1,
    "source": "bundled"
  },
  {
    "id": "bundled-t-002",
    "question": `This sculptor's studies of horses in motion informed his design for the Monument to Gattamelata, and he created a bronze David that was the first freestanding nude since antiquity. (*) He designed the octagonal lantern atop Florence Cathedral and rediscovered linear perspective while studying the Baptistery. This sculptor of the bronze doors competition loser "Sacrifice of Isaac" trained Michelangelo's teacher.`,
    "questionSanitized": `This sculptor's studies of horses in motion informed his design for the Monument to Gattamelata, and he created a bronze David that was the first freestanding nude since antiquity. (*) He designed the octagonal lantern atop Florence Cathedral and rediscovered linear perspective while studying the Baptistery. This sculptor of the bronze doors competition loser "Sacrifice of Isaac" trained Michelangelo's teacher.`,
    "answer": "<b><u>Filippo Brunelleschi</u></b> [accept Brunelleschi]",
    "answerSanitized": "Filippo Brunelleschi [accept Brunelleschi]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 2,
    "source": "bundled"
  },
  {
    "id": "bundled-t-003",
    "question": `This composer's Symphony No. 6 is subtitled "Pathetique" and premiered days before his death. (*) He wrote a ballet featuring the Sugar Plum Fairy and the Nutcracker Prince, and another ballet in which Prince Siegfried falls for Odette. This composer of the 1812 Overture also wrote Swan Lake.`,
    "questionSanitized": `This composer's Symphony No. 6 is subtitled "Pathetique" and premiered days before his death. (*) He wrote a ballet featuring the Sugar Plum Fairy and the Nutcracker Prince, and another ballet in which Prince Siegfried falls for Odette. This composer of the 1812 Overture also wrote Swan Lake.`,
    "answer": "<b><u>Pyotr Ilyich Tchaikovsky</u></b> [accept Tchaikovsky or Peter Tchaikovsky or Pyotr Tchaikovsky]",
    "answerSanitized": "Pyotr Ilyich Tchaikovsky [accept Tchaikovsky or Peter Tchaikovsky or Pyotr Tchaikovsky]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 3,
    "source": "bundled"
  },
  {
    "id": "bundled-t-004",
    "question": "This artist's Rouen Cathedral series depicts the same facade under changing light at different times of day. (*) He painted his wife Camille on her deathbed, and a work by him showing orange and blue brushstrokes of a harbor at dawn gave a movement its name. This painter of the Water Lilies series at Giverny painted Impression, Sunrise.",
    "questionSanitized": "This artist's Rouen Cathedral series depicts the same facade under changing light at different times of day. (*) He painted his wife Camille on her deathbed, and a work by him showing orange and blue brushstrokes of a harbor at dawn gave a movement its name. This painter of the Water Lilies series at Giverny painted Impression, Sunrise.",
    "answer": "<b><u>Claude Monet</u></b> [accept Monet]",
    "answerSanitized": "Claude Monet [accept Monet]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 4,
    "source": "bundled"
  },
  {
    "id": "bundled-t-005",
    "question": `This architect's Fallingwater is built directly over a waterfall in rural Pennsylvania. (*) He developed the "Prairie School" style and designed the spiraling ramp of the Guggenheim Museum in New York. This architect designed Taliesin as his home and studio in Wisconsin.`,
    "questionSanitized": `This architect's Fallingwater is built directly over a waterfall in rural Pennsylvania. (*) He developed the "Prairie School" style and designed the spiraling ramp of the Guggenheim Museum in New York. This architect designed Taliesin as his home and studio in Wisconsin.`,
    "answer": "<b><u>Frank Lloyd Wright</u></b> [accept Wright]",
    "answerSanitized": "Frank Lloyd Wright [accept Wright]",
    "category": "Fine Arts",
    "subcategory": "Other Fine Arts",
    "alternateSubcategory": "Architecture",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 5,
    "source": "bundled"
  },
  {
    "id": "bundled-t-006",
    "question": `This composer went completely deaf by the time he wrote his Ninth Symphony, which sets Schiller's "Ode to Joy" in its final movement. (*) His only opera is Fidelio, and his Third Symphony was originally dedicated to Napoleon before he angrily renamed it "Eroica." This composer wrote a Fifth Symphony that opens with a four-note motif often described as "fate knocking at the door."`,
    "questionSanitized": `This composer went completely deaf by the time he wrote his Ninth Symphony, which sets Schiller's "Ode to Joy" in its final movement. (*) His only opera is Fidelio, and his Third Symphony was originally dedicated to Napoleon before he angrily renamed it "Eroica." This composer wrote a Fifth Symphony that opens with a four-note motif often described as "fate knocking at the door."`,
    "answer": "<b><u>Ludwig van Beethoven</u></b> [accept Beethoven or Ludwig Beethoven]",
    "answerSanitized": "Ludwig van Beethoven [accept Beethoven or Ludwig Beethoven]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 6,
    "source": "bundled"
  },
  {
    "id": "bundled-t-007",
    "question": "This artist cut off part of his own ear after an argument with Paul Gauguin in Arles. (*) He painted a swirling night sky over a village beneath a cypress tree, and a series of paintings depicting sunflowers in a vase. This Dutch Post-Impressionist painted Starry Night and cut off his ear.",
    "questionSanitized": "This artist cut off part of his own ear after an argument with Paul Gauguin in Arles. (*) He painted a swirling night sky over a village beneath a cypress tree, and a series of paintings depicting sunflowers in a vase. This Dutch Post-Impressionist painted Starry Night and cut off his ear.",
    "answer": "<b><u>Vincent van Gogh</u></b> [accept van Gogh]",
    "answerSanitized": "Vincent van Gogh [accept van Gogh]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 7,
    "source": "bundled"
  },
  {
    "id": "bundled-t-008",
    "question": "This sculptor's The Gates of Hell was commissioned for a Paris museum and includes a smaller figure of a seated, brooding man resting his chin on his hand. (*) He sculpted a group of six burghers with nooses around their necks for a city in northern France. This sculptor of The Kiss and The Thinker also made a bronze of Balzac.",
    "questionSanitized": "This sculptor's The Gates of Hell was commissioned for a Paris museum and includes a smaller figure of a seated, brooding man resting his chin on his hand. (*) He sculpted a group of six burghers with nooses around their necks for a city in northern France. This sculptor of The Kiss and The Thinker also made a bronze of Balzac.",
    "answer": "<b><u>Auguste Rodin</u></b> [accept Rodin]",
    "answerSanitized": "Auguste Rodin [accept Rodin]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 8,
    "source": "bundled"
  },
  {
    "id": "bundled-t-009",
    "question": "This composer's Requiem was left unfinished at his death and was completed by his student Franz Xaver S\xFCssmayr. (*) He wrote an opera in which Papageno the bird-catcher helps Prince Tamino rescue Pamina, called The Magic Flute. This composer of Don Giovanni and The Marriage of Figaro was a child prodigy from Salzburg.",
    "questionSanitized": "This composer's Requiem was left unfinished at his death and was completed by his student Franz Xaver S\xFCssmayr. (*) He wrote an opera in which Papageno the bird-catcher helps Prince Tamino rescue Pamina, called The Magic Flute. This composer of Don Giovanni and The Marriage of Figaro was a child prodigy from Salzburg.",
    "answer": "<b><u>Wolfgang Amadeus Mozart</u></b> [accept Mozart or Wolfgang Mozart]",
    "answerSanitized": "Wolfgang Amadeus Mozart [accept Mozart or Wolfgang Mozart]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 9,
    "source": "bundled"
  },
  {
    "id": "bundled-t-010",
    "question": `This artist's Guernica depicts the bombing of a Basque town during the Spanish Civil War in monochrome grays and blacks. (*) He co-founded Cubism with Georges Braque and went through a "Blue Period" characterized by melancholic figures. This Spanish painter created Les Demoiselles d'Avignon.`,
    "questionSanitized": `This artist's Guernica depicts the bombing of a Basque town during the Spanish Civil War in monochrome grays and blacks. (*) He co-founded Cubism with Georges Braque and went through a "Blue Period" characterized by melancholic figures. This Spanish painter created Les Demoiselles d'Avignon.`,
    "answer": "<b><u>Pablo Picasso</u></b> [accept Picasso]",
    "answerSanitized": "Pablo Picasso [accept Picasso]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 10,
    "source": "bundled"
  },
  {
    "id": "bundled-t-011",
    "question": "This architect designed a glass pyramid entrance for the Louvre in Paris. (*) He also designed the East Building of the National Gallery of Art in Washington, D.C., using sharp triangular forms. This Chinese-American architect designed the Bank of China Tower in Hong Kong.",
    "questionSanitized": "This architect designed a glass pyramid entrance for the Louvre in Paris. (*) He also designed the East Building of the National Gallery of Art in Washington, D.C., using sharp triangular forms. This Chinese-American architect designed the Bank of China Tower in Hong Kong.",
    "answer": "<b><u>I. M. Pei</u></b> [accept Pei or I.M. Pei or Ieoh Ming Pei]",
    "answerSanitized": "I. M. Pei [accept Pei or I.M. Pei or Ieoh Ming Pei]",
    "category": "Fine Arts",
    "subcategory": "Other Fine Arts",
    "alternateSubcategory": "Architecture",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 11,
    "source": "bundled"
  },
  {
    "id": "bundled-t-012",
    "question": "This artist's American Gothic depicts a farmer holding a pitchfork standing beside a woman in front of a house with a Gothic window. (*) He was a leading figure of the Regionalism movement centered in the American Midwest. This painter from Iowa depicted his sister and his dentist as the models for American Gothic.",
    "questionSanitized": "This artist's American Gothic depicts a farmer holding a pitchfork standing beside a woman in front of a house with a Gothic window. (*) He was a leading figure of the Regionalism movement centered in the American Midwest. This painter from Iowa depicted his sister and his dentist as the models for American Gothic.",
    "answer": "<b><u>Grant Wood</u></b> [accept Wood]",
    "answerSanitized": "Grant Wood [accept Wood]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 12,
    "source": "bundled"
  },
  {
    "id": "bundled-t-013",
    "question": 'This composer wrote a set of four violin concertos collectively titled The Four Seasons. (*) He was known as "The Red Priest" for his hair color and his ordination in Venice, where he taught at an orphanage for girls. This Baroque composer wrote hundreds of concertos, many of them for solo violin.',
    "questionSanitized": 'This composer wrote a set of four violin concertos collectively titled The Four Seasons. (*) He was known as "The Red Priest" for his hair color and his ordination in Venice, where he taught at an orphanage for girls. This Baroque composer wrote hundreds of concertos, many of them for solo violin.',
    "answer": "<b><u>Antonio Vivaldi</u></b> [accept Vivaldi]",
    "answerSanitized": "Antonio Vivaldi [accept Vivaldi]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 13,
    "source": "bundled"
  },
  {
    "id": "bundled-t-014",
    "question": "This artist painted a nighttime diner scene called Nighthawks, showing isolated figures under fluorescent light. (*) He often depicted lonely American figures in motels, offices, and gas stations bathed in stark light. This painter of Automat and Office in a Small City is considered a master of American Realism.",
    "questionSanitized": "This artist painted a nighttime diner scene called Nighthawks, showing isolated figures under fluorescent light. (*) He often depicted lonely American figures in motels, offices, and gas stations bathed in stark light. This painter of Automat and Office in a Small City is considered a master of American Realism.",
    "answer": "<b><u>Edward Hopper</u></b> [accept Hopper]",
    "answerSanitized": "Edward Hopper [accept Hopper]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 14,
    "source": "bundled"
  },
  {
    "id": "bundled-t-015",
    "question": "This sculptor carved a colossal statue of a shepherd boy from a single block of flawed marble, unveiling it in the Piazza della Signoria in Florence. (*) He painted the ceiling of the Sistine Chapel and later its altar wall with The Last Judgment. This sculptor of the Piet\xE0 and David also designed the dome of St. Peter's Basilica.",
    "questionSanitized": "This sculptor carved a colossal statue of a shepherd boy from a single block of flawed marble, unveiling it in the Piazza della Signoria in Florence. (*) He painted the ceiling of the Sistine Chapel and later its altar wall with The Last Judgment. This sculptor of the Piet\xE0 and David also designed the dome of St. Peter's Basilica.",
    "answer": "<b><u>Michelangelo</u></b> [accept Michelangelo Buonarroti or Michelangelo di Lodovico Buonarroti Simoni]",
    "answerSanitized": "Michelangelo [accept Michelangelo Buonarroti or Michelangelo di Lodovico Buonarroti Simoni]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 15,
    "source": "bundled"
  },
  {
    "id": "bundled-t-016",
    "question": `This composer's Symphony No. 9, subtitled "From the New World," incorporates melodies inspired by African-American spirituals and Native American music. (*) He wrote this symphony while directing a conservatory in New York City. This Czech composer also wrote a set of Slavonic Dances and the opera Rusalka.`,
    "questionSanitized": `This composer's Symphony No. 9, subtitled "From the New World," incorporates melodies inspired by African-American spirituals and Native American music. (*) He wrote this symphony while directing a conservatory in New York City. This Czech composer also wrote a set of Slavonic Dances and the opera Rusalka.`,
    "answer": "<b><u>Anton\xEDn Dvo\u0159\xE1k</u></b> [accept Dvorak or Antonin Dvorak]",
    "answerSanitized": "Anton\xEDn Dvo\u0159\xE1k [accept Dvorak or Antonin Dvorak]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 16,
    "source": "bundled"
  },
  {
    "id": "bundled-t-017",
    "question": "This artist's The Persistence of Memory features melting pocket watches draped over a barren landscape. (*) He collaborated with Luis Bu\xF1uel on the surrealist film Un Chien Andalou. This mustached Spanish Surrealist also designed the Chupa Chups logo.",
    "questionSanitized": "This artist's The Persistence of Memory features melting pocket watches draped over a barren landscape. (*) He collaborated with Luis Bu\xF1uel on the surrealist film Un Chien Andalou. This mustached Spanish Surrealist also designed the Chupa Chups logo.",
    "answer": "<b><u>Salvador Dal\xED</u></b> [accept Dali or Salvador Dali]",
    "answerSanitized": "Salvador Dal\xED [accept Dali or Salvador Dali]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 17,
    "source": "bundled"
  },
  {
    "id": "bundled-t-018",
    "question": "This architect designed the Sydney Opera House, whose roof shells resemble a series of interlocking sails or shells. (*) A dispute over cost overruns caused this Danish architect to resign before the building's completion in 1973. This architect never saw his finished Sydney Opera House in person.",
    "questionSanitized": "This architect designed the Sydney Opera House, whose roof shells resemble a series of interlocking sails or shells. (*) A dispute over cost overruns caused this Danish architect to resign before the building's completion in 1973. This architect never saw his finished Sydney Opera House in person.",
    "answer": "<b><u>J\xF8rn Utzon</u></b> [accept Utzon or Jorn Utzon]",
    "answerSanitized": "J\xF8rn Utzon [accept Utzon or Jorn Utzon]",
    "category": "Fine Arts",
    "subcategory": "Other Fine Arts",
    "alternateSubcategory": "Architecture",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 18,
    "source": "bundled"
  },
  {
    "id": "bundled-t-019",
    "question": "This composer's Rite of Spring caused a riot at its 1913 Paris premiere due to its dissonant rhythms and the choreography by Nijinsky. (*) He also composed the ballets The Firebird and Petrushka for Diaghilev's Ballets Russes. This Russian composer later became a leading figure of Neoclassicism.",
    "questionSanitized": "This composer's Rite of Spring caused a riot at its 1913 Paris premiere due to its dissonant rhythms and the choreography by Nijinsky. (*) He also composed the ballets The Firebird and Petrushka for Diaghilev's Ballets Russes. This Russian composer later became a leading figure of Neoclassicism.",
    "answer": "<b><u>Igor Stravinsky</u></b> [accept Stravinsky]",
    "answerSanitized": "Igor Stravinsky [accept Stravinsky]",
    "category": "Fine Arts",
    "subcategory": "Auditory Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 19,
    "source": "bundled"
  },
  {
    "id": "bundled-t-020",
    "question": "This artist painted a self-portrait wearing a thorn necklace and another depicting herself in a plaster corset after a bus accident shattered her spine. (*) She was married to muralist Diego Rivera and often incorporated Mexican folk art traditions and monkeys into her self-portraits. This painter of The Two Fridas was known for her unibrow.",
    "questionSanitized": "This artist painted a self-portrait wearing a thorn necklace and another depicting herself in a plaster corset after a bus accident shattered her spine. (*) She was married to muralist Diego Rivera and often incorporated Mexican folk art traditions and monkeys into her self-portraits. This painter of The Two Fridas was known for her unibrow.",
    "answer": "<b><u>Frida Kahlo</u></b> [accept Kahlo]",
    "answerSanitized": "Frida Kahlo [accept Kahlo]",
    "category": "Fine Arts",
    "subcategory": "Visual Fine Arts",
    "difficulty": 3,
    "setName": "Bundled Fine Arts Pack",
    "setYear": 2025,
    "packetNumber": 1,
    "questionNumber": 20,
    "source": "bundled"
  }
];

// src/data/qbreader.ts
var BASE = "https://www.qbreader.org/api";
function stripTags(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
__name(stripTags, "stripTags");
function normalizeTossup(raw) {
  const question = raw.question ?? raw.question_sanitized;
  const answer = raw.answer ?? raw.answer_sanitized;
  if (!question || !answer) return null;
  const questionSanitized = raw.question_sanitized ?? stripTags(question);
  return {
    id: raw._id ?? `qb-${Math.random().toString(36).slice(2)}`,
    question,
    questionSanitized,
    answer,
    answerSanitized: raw.answer_sanitized ?? stripTags(answer),
    category: raw.category ?? "Other Academic",
    subcategory: raw.subcategory ?? raw.category ?? "Other Academic",
    ...raw.alternate_subcategory ? { alternateSubcategory: raw.alternate_subcategory } : {},
    difficulty: raw.difficulty ?? 3,
    setName: raw.set?.name ?? "unknown set",
    setYear: raw.set?.year ?? 0,
    packetNumber: raw.packet?.number ?? 0,
    questionNumber: raw.number ?? 0,
    source: "qbreader"
  };
}
__name(normalizeTossup, "normalizeTossup");
var RateLimited = class extends Error {
  constructor(retryAfterMs) {
    super("qbreader rate limit");
    this.retryAfterMs = retryAfterMs;
  }
  retryAfterMs;
  static {
    __name(this, "RateLimited");
  }
};
function buildQuery(filters, number) {
  const p = new URLSearchParams();
  p.set("number", String(number));
  if (filters.difficulties.length > 0) {
    p.set("difficulties", filters.difficulties.join(","));
  }
  if (filters.categories.length > 0) {
    p.set("categories", filters.categories.join(","));
  }
  if (filters.subcategories.length > 0) {
    p.set("subcategories", filters.subcategories.join(","));
  }
  if (filters.minYear !== void 0) p.set("minYear", String(filters.minYear));
  if (filters.maxYear !== void 0) p.set("maxYear", String(filters.maxYear));
  if (filters.standardOnly) p.set("standardOnly", "true");
  if (filters.powermarkOnly) p.set("powermarkOnly", "true");
  return p.toString();
}
__name(buildQuery, "buildQuery");
async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "1");
    throw new RateLimited(Math.max(1e3, retry * 1e3));
  }
  if (!res.ok) throw new Error(`qbreader ${res.status}`);
  return res.json();
}
__name(getJson, "getJson");
async function fetchTossups(filters, n = 20) {
  const data = await getJson(`/random-tossup?${buildQuery(filters, n)}`);
  return (data.tossups ?? []).map(normalizeTossup).filter((t) => t !== null);
}
__name(fetchTossups, "fetchTossups");
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== void 0 && b !== void 0) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}
__name(shuffle, "shuffle");
var REFILL_THRESHOLD = 5;
var BATCH = 20;
var TossupQueue = class {
  constructor(filters) {
    this.filters = filters;
  }
  filters;
  static {
    __name(this, "TossupQueue");
  }
  pool = [];
  seen = /* @__PURE__ */ new Set();
  fetching = null;
  offline = false;
  get isOffline() {
    return this.offline;
  }
  setFilters(filters) {
    this.filters = filters;
    this.pool = [];
  }
  async refill() {
    try {
      const batch = await fetchTossups(this.filters, BATCH);
      const fresh = batch.filter((t) => !this.seen.has(t.id));
      if (fresh.length === 0) {
        this.seen.clear();
        this.pool.push(...shuffle(batch));
      } else {
        this.pool.push(...shuffle(fresh));
      }
      this.offline = false;
    } catch {
      this.offline = true;
      const fallback = BUNDLED_TOSSUPS.filter((t) => !this.seen.has(t.id));
      if (fallback.length === 0) this.seen.clear();
      this.pool.push(
        ...shuffle(fallback.length > 0 ? fallback : BUNDLED_TOSSUPS)
      );
    }
  }
  ensureRefill() {
    if (this.fetching) return this.fetching;
    this.fetching = this.refill().finally(() => {
      this.fetching = null;
    });
    return this.fetching;
  }
  async next() {
    if (this.pool.length === 0) await this.ensureRefill();
    const t = this.pool.shift() ?? null;
    if (t) this.seen.add(t.id);
    if (this.pool.length < REFILL_THRESHOLD) void this.ensureRefill();
    return t;
  }
};
function defaultFilters() {
  return {
    difficulties: [3, 4, 5],
    categories: [],
    subcategories: [],
    standardOnly: true
  };
}
__name(defaultFilters, "defaultFilters");

// workers/room/room.ts
var DEFAULT_WPM = 150;
var MAX_PLAYERS = 12;
var HEARTBEAT_MS = 2e4;
var Room = class {
  constructor(ctx, env2) {
    this.ctx = ctx;
    this.env = env2;
    this.room = createRoom("????");
    void this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get("room");
      if (saved) {
        this.room = saved;
        for (const p of Object.values(this.room.players)) p.connected = false;
        this.room.startedAt = null;
      }
      const wpm = await this.ctx.storage.get("wpm");
      if (typeof wpm === "number") this.wpm = wpm;
    });
  }
  ctx;
  static {
    __name(this, "Room");
  }
  room;
  sessions = /* @__PURE__ */ new Map();
  queue = new TossupQueue(defaultFilters());
  wpm = DEFAULT_WPM;
  lastActivity = Date.now();
  env;
  /** True once we've written the create row for this DO lifetime. */
  registered = false;
  lastHeartbeat = 0;
  /** Player count last written to D1, so we skip no-op updates. */
  lastWrittenPlayerCount = -1;
  // -------------------------------------------------------------------------
  // HTTP / websocket entry
  // -------------------------------------------------------------------------
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      if (this.sessions.size >= MAX_PLAYERS) {
        return new Response("room full", { status: 503 });
      }
      const code = url.searchParams.get("code") ?? this.room.code;
      if (this.room.code === "????") this.room.code = code.toUpperCase();
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.wire(server);
      await this.registerLive(Date.now());
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith("/state")) {
      return Response.json(snapshot(this.room, Date.now()));
    }
    if (url.pathname.endsWith("/__internal/close")) {
      const presented = request.headers.get("x-internal-secret") ?? "";
      const expected = this.env.INTERNAL_SECRET ?? "";
      if (expected.length === 0 || !constantTimeEquals(presented, expected)) {
        return new Response("forbidden", { status: 403 });
      }
      await this.drainAndClose("closed by admin");
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }
  // -------------------------------------------------------------------------
  // Session plumbing
  // -------------------------------------------------------------------------
  wire(ws) {
    ws.addEventListener("message", (ev) => {
      void this.onMessage(ws, ev);
    });
    const close = /* @__PURE__ */ __name(() => void this.onClose(ws), "close");
    ws.addEventListener("close", close);
    ws.addEventListener("error", close);
  }
  async onMessage(ws, ev) {
    this.lastActivity = Date.now();
    await this.heartbeat(this.lastActivity);
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      this.sendTo(ws, { t: "error", message: "bad message" });
      return;
    }
    const now = Date.now();
    const playerId = this.sessions.get(ws);
    if (msg.t === "join") {
      const id = msg.playerId?.trim() || crypto.randomUUID();
      this.sessions.set(ws, id);
      const out = join(this.room, id, String(msg.name ?? "").slice(0, 24), now);
      this.sendTo(ws, {
        t: "welcome",
        playerId: id,
        snapshot: snapshot(this.room, now)
      });
      await this.commit(out, ws);
      return;
    }
    if (!playerId) {
      this.sendTo(ws, { t: "error", message: "join first" });
      return;
    }
    switch (msg.t) {
      case "ping":
        this.sendTo(ws, { t: "pong", sent: msg.sent, serverNow: now });
        return;
      case "start":
        await this.commit(await this.beginQuestion(now), ws);
        return;
      case "buzz":
        await this.commit(buzz(this.room, playerId, now), ws);
        return;
      case "answer": {
        if (this.room.buzzer !== playerId) {
          this.sendTo(ws, { t: "error", message: "you do not hold the buzz" });
          return;
        }
        const line = this.room.answerline ?? this.room.answerSanitized ?? "";
        const verdict = judge(line, String(msg.given ?? ""));
        await this.commit(
          applyJudgement(this.room, playerId, String(msg.given ?? ""), verdict, now),
          ws
        );
        return;
      }
      case "next":
        await this.commit(nextQuestion(this.room, now), ws);
        return;
      default:
        this.sendTo(ws, { t: "error", message: "unknown message" });
    }
  }
  async onClose(ws) {
    const playerId = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (!playerId) return;
    const stillHere = [...this.sessions.values()].includes(playerId);
    if (stillHere) {
      await this.touchLive(Date.now());
      return;
    }
    await this.commit(leave(this.room, playerId, Date.now()));
    if (this.sessions.size === 0) await this.deregisterLive();
  }
  // -------------------------------------------------------------------------
  // Questions
  // -------------------------------------------------------------------------
  async beginQuestion(now) {
    const tossup = await this.queue.next();
    if (!tossup) {
      return { messages: [{ t: "error", message: "no questions available" }] };
    }
    const parsed = parseQuestion(tossup.questionSanitized);
    const schedule = buildSchedule(parsed.words, this.wpm);
    return startQuestion(
      this.room,
      {
        question: toRoomQuestion(tossup, parsed.words, parsed.powerIndex),
        answerline: tossup.answer,
        answerSanitized: tossup.answerSanitized,
        schedule
      },
      now
    );
  }
  // -------------------------------------------------------------------------
  // Alarms drive the two deadlines: the answer window and end of reading.
  // -------------------------------------------------------------------------
  async alarm() {
    const now = Date.now();
    if (this.room.phase === "buzzed" && this.room.answerDeadline !== null && now >= this.room.answerDeadline) {
      await this.commit(timeout(this.room, now));
      return;
    }
    if (this.room.phase === "reading") {
      const out = finishReading(this.room, now);
      if (out.messages.length > 0) {
        await this.commit(out);
        return;
      }
    }
    if (this.sessions.size === 0 && now - this.lastActivity > IDLE_TEARDOWN_MS) {
      await this.ctx.storage.deleteAll();
      await this.deregisterLive();
      return;
    }
    await this.rearm();
  }
  // -------------------------------------------------------------------------
  // Commit: broadcast, persist, and arm the next alarm
  // -------------------------------------------------------------------------
  /**
   * @param origin when given, `error` messages go only to that socket. An
   *   error is a reply to one player's action; broadcasting it told everyone
   *   in the room that somebody's buzz lost.
   */
  async commit(out, origin) {
    for (const m of out.messages) {
      if (m.t === "error" && origin) this.sendTo(origin, m);
      else this.broadcast(m);
    }
    if (this.room.phase === "reading" && everyoneLockedOut(this.room)) {
      const done = abandonQuestion(this.room, Date.now());
      for (const m of done.messages) this.broadcast(m);
    }
    await this.ctx.storage.put("room", this.room);
    await this.touchLive(Date.now());
    await this.rearm();
  }
  /**
   * Set the alarm from room state, every time. Never conditional on what is
   * already pending: a stale alarm that fires early must still leave the room
   * with an alarm for its real next deadline.
   */
  async rearm() {
    const wake = nextWake(this.room, Date.now());
    if (wake === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const existing = await this.ctx.storage.getAlarm();
    if (existing !== wake) await this.ctx.storage.setAlarm(wake);
  }
  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
  sendTo(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      this.sessions.delete(ws);
    }
  }
  // -------------------------------------------------------------------------
  // Live-rooms index (D1-backed) and admin-driven close.
  //
  // Writes here must never break a room. Every path catches its own errors so
  // a D1 outage degrades cleanly to "the admin dashboard won't list this
  // room" rather than "nobody can play".
  // -------------------------------------------------------------------------
  connectedCount() {
    const ids = /* @__PURE__ */ new Set();
    for (const id of this.sessions.values()) ids.add(id);
    return ids.size;
  }
  async registerLive(now) {
    if (!this.env.DB) return;
    if (this.room.code === "????") return;
    const count3 = this.connectedCount();
    try {
      await this.env.DB.prepare(
        `INSERT INTO live_rooms (id, created_at, last_seen, player_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
                                         player_count = excluded.player_count`
      ).bind(this.room.code, now, now, count3).run();
      this.registered = true;
      this.lastHeartbeat = now;
      this.lastWrittenPlayerCount = count3;
    } catch (err) {
      console.error("live_rooms register failed", err);
    }
  }
  /**
   * Write the row's `last_seen` and (if changed) `player_count`. Also reads
   * back `closed_at` and triggers a drain if the admin marked this room for
   * closure since the last heartbeat.
   */
  async touchLive(now) {
    if (!this.env.DB) return;
    if (this.room.code === "????") return;
    const count3 = this.connectedCount();
    const sameCount = count3 === this.lastWrittenPlayerCount;
    const tooSoon = now - this.lastHeartbeat < HEARTBEAT_MS;
    if (sameCount && tooSoon) return;
    try {
      const row = await this.env.DB.prepare(
        `INSERT INTO live_rooms (id, created_at, last_seen, player_count)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
                                         player_count = excluded.player_count
           RETURNING closed_at`
      ).bind(this.room.code, now, now, count3).first();
      this.registered = true;
      this.lastHeartbeat = now;
      this.lastWrittenPlayerCount = count3;
      if (row && row.closed_at !== null) {
        await this.drainAndClose("closed by admin");
      }
    } catch (err) {
      console.error("live_rooms touch failed", err);
    }
  }
  async heartbeat(now) {
    await this.touchLive(now);
  }
  async deregisterLive() {
    if (!this.env.DB) return;
    if (!this.registered && this.room.code === "????") return;
    try {
      await this.env.DB.prepare("DELETE FROM live_rooms WHERE id = ?").bind(this.room.code).run();
    } catch (err) {
      console.error("live_rooms deregister failed", err);
    }
    this.registered = false;
    this.lastWrittenPlayerCount = -1;
  }
  /**
   * Broadcast a closed message to every connected client, close every socket,
   * and clear the row. Idempotent: calling this on a room with no sockets
   * simply deletes the row.
   */
  async drainAndClose(reason) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const payload = JSON.stringify({ t: "closed", reason });
      for (const ws of [...this.sessions.keys()]) {
        try {
          ws.send(payload);
        } catch {
        }
        try {
          ws.close(1e3, "closed by admin");
        } catch {
        }
      }
      this.sessions.clear();
      await this.deregisterLive();
    });
  }
};
function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
__name(constantTimeEquals, "constantTimeEquals");

// workers/room/auth.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// workers/room/password.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var ITERATIONS = 1e5;
var SALT_BYTES = 16;
var HASH_BYTES = 32;
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
__name(toB64, "toB64");
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
__name(fromB64, "fromB64");
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function derive(password, salt, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}
__name(derive, "derive");
async function hash(password) {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const out = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(out)}`;
}
__name(hash, "hash");
async function verify(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [scheme, iterStr, saltB64, hashB64] = parts;
  if (scheme !== "pbkdf2") return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 1e7) {
    return false;
  }
  let salt;
  let expected;
  try {
    salt = fromB64(saltB64 ?? "");
    expected = fromB64(hashB64 ?? "");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual;
  try {
    actual = await derive(password, salt, iterations);
  } catch {
    return false;
  }
  return constantTimeEqual(actual, expected);
}
__name(verify, "verify");

// workers/room/session.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var SESSION_COOKIE = "session";
var SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
var SESSION_TTL_MS = SESSION_TTL_SECONDS * 1e3;
function newSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += (b < 16 ? "0" : "") + b.toString(16);
  }
  return out;
}
__name(newSessionToken, "newSessionToken");
function serializeSessionCookie(token) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ].join("; ");
}
__name(serializeSessionCookie, "serializeSessionCookie");
function serializeClearedSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
}
__name(serializeClearedSessionCookie, "serializeClearedSessionCookie");
function parseSessionCookie(header) {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
__name(parseSessionCookie, "parseSessionCookie");

// workers/room/auth.ts
var USERNAME_RE = /^[a-z0-9_]+$/i;
var USERNAME_MIN = 3;
var USERNAME_MAX = 32;
var PASSWORD_MIN = 8;
function validateUsername(u) {
  if (typeof u !== "string") return "Username is required.";
  if (u.length < USERNAME_MIN)
    return `Username must be at least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX)
    return `Username cannot exceed ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(u))
    return "Username may only contain letters, digits and underscores.";
  return null;
}
__name(validateUsername, "validateUsername");
function validatePassword(p) {
  if (typeof p !== "string") return "Password is required.";
  if (p.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  return null;
}
__name(validatePassword, "validatePassword");
var RATE_LIMIT_MAX = 10;
var RATE_LIMIT_WINDOW_MS = 10 * 60 * 1e3;
var buckets = /* @__PURE__ */ new Map();
function rateLimit(key, now, max = RATE_LIMIT_MAX) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
__name(rateLimit, "rateLimit");
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
__name(num, "num");
function roleOf(v) {
  return v === "admin" ? "admin" : "user";
}
__name(roleOf, "roleOf");
function d1Store(db) {
  return {
    async countUsers() {
      const row = await db.prepare("SELECT COUNT(*) AS c FROM users").first();
      return row ? num(row.c) : 0;
    },
    async findUserByUsername(username) {
      const row = await db.prepare(
        "SELECT id, username, pw_hash, role, created_at, banned_at FROM users WHERE username = ?"
      ).bind(username).first();
      if (!row) return null;
      return {
        id: num(row.id),
        username: String(row.username),
        pwHash: String(row.pw_hash),
        role: roleOf(row.role),
        createdAt: num(row.created_at),
        bannedAt: row.banned_at == null ? null : num(row.banned_at)
      };
    },
    async findUserById(id) {
      const row = await db.prepare(
        "SELECT id, username, pw_hash, role, created_at, banned_at FROM users WHERE id = ?"
      ).bind(id).first();
      if (!row) return null;
      return {
        id: num(row.id),
        username: String(row.username),
        pwHash: String(row.pw_hash),
        role: roleOf(row.role),
        createdAt: num(row.created_at),
        bannedAt: row.banned_at == null ? null : num(row.banned_at)
      };
    },
    async createUser(username, pwHash, role, createdAt) {
      const res = await db.prepare(
        "INSERT INTO users (username, pw_hash, role, created_at) VALUES (?, ?, ?, ?)"
      ).bind(username, pwHash, role, createdAt).run();
      const meta = res.meta;
      return num(meta?.last_row_id);
    },
    async createSession(token, userId, createdAt, expiresAt) {
      await db.prepare(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
      ).bind(token, userId, createdAt, expiresAt).run();
    },
    async findSession(token) {
      const row = await db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").bind(token).first();
      if (!row) return null;
      return {
        userId: num(row.user_id),
        expiresAt: num(row.expires_at)
      };
    },
    async deleteSession(token) {
      await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    }
  };
}
__name(d1Store, "d1Store");
function json(body, status = 200, extra) {
  const headers = new Headers({ "content-type": "application/json" });
  if (extra) {
    for (const [k, v] of new Headers(extra).entries()) headers.append(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
__name(json, "json");
async function readCredentials(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return null;
    const b = body;
    const username = typeof b.username === "string" ? b.username : "";
    const password = typeof b.password === "string" ? b.password : "";
    return { username, password };
  } catch {
    return null;
  }
}
__name(readCredentials, "readCredentials");
function toPublicUser(u) {
  return { id: u.id, username: u.username, role: u.role };
}
__name(toPublicUser, "toPublicUser");
async function authenticate(request, store, now) {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (!token) return null;
  const session = await store.findSession(token);
  if (!session) return null;
  if (session.expiresAt <= now) return null;
  const user = await store.findUserById(session.userId);
  if (!user) return null;
  if (user.bannedAt != null) return null;
  return { user: toPublicUser(user), token };
}
__name(authenticate, "authenticate");
async function requireUser(request, store, now) {
  const auth = await authenticate(request, store, now);
  return auth ? auth.user : null;
}
__name(requireUser, "requireUser");
async function handleSignup(request, store, ctx) {
  const creds = await readCredentials(request);
  if (!creds) return json({ error: "invalid body" }, 400);
  const uErr = validateUsername(creds.username);
  if (uErr) return json({ error: uErr }, 400);
  const pErr = validatePassword(creds.password);
  if (pErr) return json({ error: pErr }, 400);
  const existing = await store.findUserByUsername(creds.username);
  if (existing) return json({ error: "username taken" }, 409);
  const existingCount = await store.countUsers();
  const role = existingCount === 0 ? "admin" : "user";
  const pwHash = await hash(creds.password);
  const id = await store.createUser(creds.username, pwHash, role, ctx.now);
  const token = newSessionToken();
  await store.createSession(token, id, ctx.now, ctx.now + SESSION_TTL_MS);
  return json(
    { user: { id, username: creds.username, role } },
    200,
    { "set-cookie": serializeSessionCookie(token) }
  );
}
__name(handleSignup, "handleSignup");
async function handleSignin(request, store, ctx) {
  const creds = await readCredentials(request);
  if (!creds) return json({ error: "invalid body" }, 400);
  if (typeof creds.username !== "string" || creds.username.length === 0) {
    return json({ error: "invalid credentials" }, 401);
  }
  const rateKey = `${ctx.colo}:${ctx.ip}:${creds.username.toLowerCase()}`;
  if (!rateLimit(rateKey, ctx.now)) {
    return json({ error: "too many attempts, try again later" }, 429);
  }
  const user = await store.findUserByUsername(creds.username);
  if (!user) {
    await verify(creds.password, "pbkdf2$1$AAAA$AAAA");
    return json({ error: "invalid credentials" }, 401);
  }
  const ok = await verify(creds.password, user.pwHash);
  if (!ok) return json({ error: "invalid credentials" }, 401);
  if (user.bannedAt != null)
    return json({ error: "account is not available" }, 403);
  const token = newSessionToken();
  await store.createSession(token, user.id, ctx.now, ctx.now + SESSION_TTL_MS);
  return json({ user: toPublicUser(user) }, 200, {
    "set-cookie": serializeSessionCookie(token)
  });
}
__name(handleSignin, "handleSignin");
async function handleSignout(request, store) {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (token) await store.deleteSession(token);
  return json({ ok: true }, 200, {
    "set-cookie": serializeClearedSessionCookie()
  });
}
__name(handleSignout, "handleSignout");
async function handleMe(request, store, ctx) {
  const auth = await authenticate(request, store, ctx.now);
  if (!auth) return json({ error: "not signed in" }, 401);
  return json({ user: auth.user });
}
__name(handleMe, "handleMe");
async function handleAuth(request, store, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/auth/signup") {
    if (request.method !== "POST")
      return json({ error: "method not allowed" }, 405);
    return handleSignup(request, store, ctx);
  }
  if (path === "/api/auth/signin") {
    if (request.method !== "POST")
      return json({ error: "method not allowed" }, 405);
    return handleSignin(request, store, ctx);
  }
  if (path === "/api/auth/signout") {
    if (request.method !== "POST")
      return json({ error: "method not allowed" }, 405);
    return handleSignout(request, store);
  }
  if (path === "/api/auth/me") {
    if (request.method !== "GET")
      return json({ error: "method not allowed" }, 405);
    return handleMe(request, store, ctx);
  }
  return null;
}
__name(handleAuth, "handleAuth");

// workers/room/tournaments.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var TOURNAMENT_NAME_MIN = 1;
var TOURNAMENT_NAME_MAX = 60;
var TOURNAMENT_TOSSUPS_MIN = 1;
var TOURNAMENT_TOSSUPS_MAX = 50;
var TOURNAMENT_BONUSES_MAX = 50;
var PROTEST_REASON_MIN = 10;
var PROTEST_REASON_MAX = 1e3;
var TEAM_MAX = 40;
var PROTEST_RATE_LIMIT_MAX = 5;
var ATTEMPT_RATE_LIMIT_MAX = 200;
var ATTEMPT_ANSWER_MAX = 500;
function isFormat(v) {
  return v === "tossups" || v === "tossups_bonuses";
}
__name(isFormat, "isFormat");
function isKind(v) {
  return v === "tossup" || v === "bonus";
}
__name(isKind, "isKind");
function isDirective(v) {
  return v === "accept" || v === "prompt" || v === "reject";
}
__name(isDirective, "isDirective");
function num2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
__name(num2, "num");
function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
__name(numOrNull, "numOrNull");
function strOrNull(v) {
  if (v == null) return null;
  return String(v);
}
__name(strOrNull, "strOrNull");
function stateOf(v) {
  return v === "running" || v === "finished" || v === "cancelled" ? v : "open";
}
__name(stateOf, "stateOf");
function protestStateOf(v) {
  return v === "accepted" || v === "rejected" ? v : "pending";
}
__name(protestStateOf, "protestStateOf");
function formatOf(v) {
  return v === "tossups_bonuses" ? "tossups_bonuses" : "tossups";
}
__name(formatOf, "formatOf");
function kindOf(v) {
  return v === "bonus" ? "bonus" : "tossup";
}
__name(kindOf, "kindOf");
function directiveOf(v) {
  return v === "accept" || v === "prompt" || v === "reject" ? v : "reject";
}
__name(directiveOf, "directiveOf");
function rowToTournament(row) {
  return {
    id: num2(row.id),
    name: String(row.name ?? ""),
    format: formatOf(row.format),
    nTossups: num2(row.n_tossups),
    nBonuses: num2(row.n_bonuses),
    createdBy: num2(row.created_by),
    createdAt: num2(row.created_at),
    startedAt: numOrNull(row.started_at),
    finishedAt: numOrNull(row.finished_at),
    state: stateOf(row.state)
  };
}
__name(rowToTournament, "rowToTournament");
function rowToPlayer(row) {
  return {
    tournamentId: num2(row.tournament_id),
    userId: num2(row.user_id),
    team: String(row.team ?? ""),
    joinedAt: num2(row.joined_at)
  };
}
__name(rowToPlayer, "rowToPlayer");
function rowToQuestion(row) {
  return {
    tournamentId: num2(row.tournament_id),
    seq: num2(row.seq),
    questionId: String(row.question_id ?? ""),
    questionKind: kindOf(row.question_kind)
  };
}
__name(rowToQuestion, "rowToQuestion");
function rowToAttempt(row) {
  return {
    id: num2(row.id),
    tournamentId: num2(row.tournament_id),
    userId: num2(row.user_id),
    seq: num2(row.seq),
    questionId: String(row.question_id ?? ""),
    givenAnswer: String(row.given_answer ?? ""),
    directive: directiveOf(row.directive),
    points: num2(row.points),
    powered: num2(row.powered) === 1,
    buzzWordIndex: numOrNull(row.buzz_word_index),
    totalWords: num2(row.total_words),
    powerWordIndex: numOrNull(row.power_word_index),
    msToAnswer: numOrNull(row.ms_to_answer),
    createdAt: num2(row.created_at),
    restitutedAt: numOrNull(row.restituted_at),
    restitutionDelta: num2(row.restitution_delta)
  };
}
__name(rowToAttempt, "rowToAttempt");
function rowToProtest(row) {
  return {
    id: num2(row.id),
    tournamentId: num2(row.tournament_id),
    questionId: String(row.question_id ?? ""),
    raisedBy: num2(row.raised_by),
    reason: String(row.reason ?? ""),
    givenAnswer: String(row.given_answer ?? ""),
    state: protestStateOf(row.state),
    createdAt: num2(row.created_at),
    resolvedBy: numOrNull(row.resolved_by),
    resolvedAt: numOrNull(row.resolved_at),
    resolvedNote: strOrNull(row.resolved_note)
  };
}
__name(rowToProtest, "rowToProtest");
function d1TournamentStore(db) {
  return {
    async createTournament(t) {
      const res = await db.prepare(
        `INSERT INTO tournaments
             (name, format, n_tossups, n_bonuses, created_by, created_at,
              started_at, finished_at, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        t.name,
        t.format,
        t.nTossups,
        t.nBonuses,
        t.createdBy,
        t.createdAt,
        t.startedAt,
        t.finishedAt,
        t.state
      ).run();
      const meta = res.meta;
      return num2(meta?.last_row_id);
    },
    async findTournament(id) {
      const row = await db.prepare(
        `SELECT id, name, format, n_tossups, n_bonuses, created_by,
                  created_at, started_at, finished_at, state
             FROM tournaments WHERE id = ?`
      ).bind(id).first();
      return row ? rowToTournament(row) : null;
    },
    async listUnfinished() {
      const res = await db.prepare(
        `SELECT id, name, format, n_tossups, n_bonuses, created_by,
                  created_at, started_at, finished_at, state
             FROM tournaments
             WHERE state != 'finished'
             ORDER BY created_at DESC`
      ).all();
      const rows = res.results ?? [];
      return rows.map(rowToTournament);
    },
    async setTournamentState(id, state, startedAt, finishedAt) {
      await db.prepare(
        `UPDATE tournaments SET state = ?, started_at = ?, finished_at = ?
             WHERE id = ?`
      ).bind(state, startedAt, finishedAt, id).run();
    },
    async addPlayer(p) {
      await db.prepare(
        `INSERT INTO tournament_players (tournament_id, user_id, team, joined_at)
             VALUES (?, ?, ?, ?)`
      ).bind(p.tournamentId, p.userId, p.team, p.joinedAt).run();
    },
    async findPlayer(tournamentId, userId) {
      const row = await db.prepare(
        `SELECT tournament_id, user_id, team, joined_at
             FROM tournament_players
             WHERE tournament_id = ? AND user_id = ?`
      ).bind(tournamentId, userId).first();
      return row ? rowToPlayer(row) : null;
    },
    async listPlayers(tournamentId) {
      const res = await db.prepare(
        `SELECT tournament_id, user_id, team, joined_at
             FROM tournament_players
             WHERE tournament_id = ?
             ORDER BY joined_at ASC`
      ).bind(tournamentId).all();
      const rows = res.results ?? [];
      return rows.map(rowToPlayer);
    },
    async addQuestions(tournamentId, qs) {
      for (const q of qs) {
        await db.prepare(
          `INSERT INTO tournament_questions
               (tournament_id, seq, question_id, question_kind)
               VALUES (?, ?, ?, ?)`
        ).bind(tournamentId, q.seq, q.questionId, q.questionKind).run();
      }
    },
    async listQuestions(tournamentId) {
      const res = await db.prepare(
        `SELECT tournament_id, seq, question_id, question_kind
             FROM tournament_questions
             WHERE tournament_id = ?
             ORDER BY seq ASC`
      ).bind(tournamentId).all();
      const rows = res.results ?? [];
      return rows.map(rowToQuestion);
    },
    async createProtest(p) {
      const res = await db.prepare(
        `INSERT INTO protests
             (tournament_id, question_id, raised_by, reason, given_answer,
              state, created_at, resolved_by, resolved_at, resolved_note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        p.tournamentId,
        p.questionId,
        p.raisedBy,
        p.reason,
        p.givenAnswer,
        p.state,
        p.createdAt,
        p.resolvedBy,
        p.resolvedAt,
        p.resolvedNote
      ).run();
      const meta = res.meta;
      return num2(meta?.last_row_id);
    },
    async listProtestsForUser(tournamentId, userId) {
      const res = await db.prepare(
        `SELECT id, tournament_id, question_id, raised_by, reason, given_answer,
                  state, created_at, resolved_by, resolved_at, resolved_note
             FROM protests
             WHERE tournament_id = ? AND raised_by = ?
             ORDER BY created_at DESC`
      ).bind(tournamentId, userId).all();
      const rows = res.results ?? [];
      return rows.map(rowToProtest);
    },
    async listProtestsForTournament(tournamentId) {
      const res = await db.prepare(
        `SELECT id, tournament_id, question_id, raised_by, reason, given_answer,
                  state, created_at, resolved_by, resolved_at, resolved_note
             FROM protests
             WHERE tournament_id = ?
             ORDER BY created_at DESC`
      ).bind(tournamentId).all();
      const rows = res.results ?? [];
      return rows.map(rowToProtest);
    },
    async createAttempt(a) {
      const res = await db.prepare(
        `INSERT INTO tournament_attempts
             (tournament_id, user_id, seq, question_id, given_answer, directive,
              points, powered, buzz_word_index, total_words, power_word_index,
              ms_to_answer, created_at, restituted_at, restitution_delta)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        a.tournamentId,
        a.userId,
        a.seq,
        a.questionId,
        a.givenAnswer,
        a.directive,
        a.points,
        a.powered ? 1 : 0,
        a.buzzWordIndex,
        a.totalWords,
        a.powerWordIndex,
        a.msToAnswer,
        a.createdAt,
        a.restitutedAt,
        a.restitutionDelta
      ).run();
      const meta = res.meta;
      return num2(meta?.last_row_id);
    },
    async listAttempts(tournamentId) {
      const res = await db.prepare(
        `SELECT id, tournament_id, user_id, seq, question_id, given_answer,
                  directive, points, powered, buzz_word_index, total_words,
                  power_word_index, ms_to_answer, created_at, restituted_at,
                  restitution_delta
             FROM tournament_attempts
             WHERE tournament_id = ?
             ORDER BY created_at ASC`
      ).bind(tournamentId).all();
      const rows = res.results ?? [];
      return rows.map(rowToAttempt);
    },
    async findAttemptForProtest(tournamentId, userId, questionId) {
      const row = await db.prepare(
        `SELECT id, tournament_id, user_id, seq, question_id, given_answer,
                  directive, points, powered, buzz_word_index, total_words,
                  power_word_index, ms_to_answer, created_at, restituted_at,
                  restitution_delta
             FROM tournament_attempts
             WHERE tournament_id = ? AND user_id = ?
               AND (question_id = ? OR question_id LIKE ?)
             ORDER BY created_at DESC
             LIMIT 1`
      ).bind(tournamentId, userId, questionId, `${questionId}#%`).first();
      return row ? rowToAttempt(row) : null;
    },
    async applyAttemptRestitution(attemptId, delta, restitutedAt) {
      await db.prepare(
        `UPDATE tournament_attempts
             SET restitution_delta = ?, restituted_at = ?
             WHERE id = ?`
      ).bind(delta, restitutedAt, attemptId).run();
    }
  };
}
__name(d1TournamentStore, "d1TournamentStore");
var QB_BASE = "https://www.qbreader.org/api";
function qbReaderQuestionFetcher() {
  return {
    async fetchTossup(id) {
      try {
        const res = await fetch(`${QB_BASE}/tossup-by-id?id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const body = await res.json();
        return body.tossup ? rawToPublicTossup(body.tossup) : null;
      } catch {
        return null;
      }
    },
    async fetchBonus(id) {
      try {
        const res = await fetch(`${QB_BASE}/bonus-by-id?id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        const body = await res.json();
        return body.bonus ? rawToPublicBonus(body.bonus) : null;
      } catch {
        return null;
      }
    }
  };
}
__name(qbReaderQuestionFetcher, "qbReaderQuestionFetcher");
function stripTagsSafe(html) {
  if (typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
__name(stripTagsSafe, "stripTagsSafe");
function rawToPublicTossup(raw) {
  const set = raw.set ?? {};
  const packet = raw.packet ?? {};
  const question = typeof raw.question === "string" ? raw.question : "";
  const answer = typeof raw.answer === "string" ? raw.answer : "";
  return {
    id: String(raw._id ?? ""),
    question,
    question_sanitized: typeof raw.question_sanitized === "string" ? raw.question_sanitized : stripTagsSafe(question),
    answer,
    answer_sanitized: typeof raw.answer_sanitized === "string" ? raw.answer_sanitized : stripTagsSafe(answer),
    category: typeof raw.category === "string" ? raw.category : "Other Academic",
    subcategory: typeof raw.subcategory === "string" ? raw.subcategory : typeof raw.category === "string" ? raw.category : "Other Academic",
    difficulty: typeof raw.difficulty === "number" ? raw.difficulty : 3,
    set_name: typeof set.name === "string" ? set.name : "unknown set",
    set_year: typeof set.year === "number" ? set.year : 0,
    packet_number: typeof packet.number === "number" ? packet.number : 0,
    question_number: typeof raw.number === "number" ? raw.number : 0
  };
}
__name(rawToPublicTossup, "rawToPublicTossup");
function rawToPublicBonus(raw) {
  const set = raw.set ?? {};
  const parts = Array.isArray(raw.parts) ? raw.parts : [];
  const answers = Array.isArray(raw.answers) ? raw.answers : Array.isArray(raw.answers_sanitized) ? raw.answers_sanitized : [];
  const n = Math.min(parts.length, answers.length);
  const partsSanitized = Array.isArray(raw.parts_sanitized) ? raw.parts_sanitized : parts;
  const answersSanitized = Array.isArray(raw.answers_sanitized) ? raw.answers_sanitized : answers.map(stripTagsSafe);
  const values = Array.isArray(raw.values) ? raw.values : null;
  return {
    id: String(raw._id ?? ""),
    leadin: typeof raw.leadin === "string" ? raw.leadin : "",
    leadin_sanitized: typeof raw.leadin_sanitized === "string" ? raw.leadin_sanitized : stripTagsSafe(raw.leadin),
    parts: parts.slice(0, n),
    parts_sanitized: partsSanitized.slice(0, n),
    answers: answers.slice(0, n),
    answers_sanitized: answersSanitized.slice(0, n),
    values: values ? values.slice(0, n) : null,
    category: typeof raw.category === "string" ? raw.category : "Other Academic",
    subcategory: typeof raw.subcategory === "string" ? raw.subcategory : typeof raw.category === "string" ? raw.category : "Other Academic",
    difficulty: typeof raw.difficulty === "number" ? raw.difficulty : 3,
    set_name: typeof set.name === "string" ? set.name : "unknown set"
  };
}
__name(rawToPublicBonus, "rawToPublicBonus");
var QUESTION_CACHE_MAX = 500;
var questionCache = /* @__PURE__ */ new Map();
function cacheKey(kind, id) {
  return `${kind}:${id}`;
}
__name(cacheKey, "cacheKey");
function cacheGet(kind, id) {
  const key = cacheKey(kind, id);
  const v = questionCache.get(key);
  if (!v) return null;
  questionCache.delete(key);
  questionCache.set(key, v);
  return v;
}
__name(cacheGet, "cacheGet");
function cacheSet(kind, id, v) {
  const key = cacheKey(kind, id);
  if (questionCache.has(key)) questionCache.delete(key);
  questionCache.set(key, v);
  while (questionCache.size > QUESTION_CACHE_MAX) {
    const oldest = questionCache.keys().next().value;
    if (oldest === void 0) break;
    questionCache.delete(oldest);
  }
}
__name(cacheSet, "cacheSet");
function json2(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(json2, "json");
async function readBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return null;
    return body;
  } catch {
    return null;
  }
}
__name(readBody, "readBody");
async function usernameOf(authStore, id) {
  const u = await authStore.findUserById(id);
  return u ? u.username : "";
}
__name(usernameOf, "usernameOf");
async function toTournamentPublic(authStore, tStore, t) {
  const players = await tStore.listPlayers(t.id);
  const creatorUsername = await usernameOf(authStore, t.createdBy);
  return {
    id: t.id,
    name: t.name,
    format: t.format,
    n_tossups: t.nTossups,
    n_bonuses: t.nBonuses,
    created_by: t.createdBy,
    creator_username: creatorUsername,
    created_at: t.createdAt,
    started_at: t.startedAt,
    finished_at: t.finishedAt,
    state: t.state,
    player_count: players.length
  };
}
__name(toTournamentPublic, "toTournamentPublic");
async function toTournamentDetail(authStore, tStore, t) {
  const players = await tStore.listPlayers(t.id);
  const questions = await tStore.listQuestions(t.id);
  const base = await toTournamentPublic(authStore, tStore, t);
  const playersPublic = [];
  for (const p of players) {
    const username = await usernameOf(authStore, p.userId);
    playersPublic.push({
      user_id: p.userId,
      username,
      team: p.team,
      joined_at: p.joinedAt
    });
  }
  return {
    ...base,
    players: playersPublic,
    questions: questions.map((q) => ({
      seq: q.seq,
      question_id: q.questionId,
      question_kind: q.questionKind
    }))
  };
}
__name(toTournamentDetail, "toTournamentDetail");
async function handleCreate(request, authStore, tStore, ctx) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const body = await readBody(request);
  if (!body) return json2({ error: "invalid body" }, 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < TOURNAMENT_NAME_MIN || name.length > TOURNAMENT_NAME_MAX) {
    return json2(
      { error: `name must be 1 to ${TOURNAMENT_NAME_MAX} characters` },
      400
    );
  }
  if (!isFormat(body.format)) {
    return json2({ error: "format must be tossups or tossups_bonuses" }, 400);
  }
  const nTossups = Number(body.n_tossups);
  if (!Number.isInteger(nTossups) || nTossups < TOURNAMENT_TOSSUPS_MIN || nTossups > TOURNAMENT_TOSSUPS_MAX) {
    return json2(
      {
        error: `n_tossups must be an integer from ${TOURNAMENT_TOSSUPS_MIN} to ${TOURNAMENT_TOSSUPS_MAX}`
      },
      400
    );
  }
  const rawBonuses = body.n_bonuses;
  const nBonuses = rawBonuses == null || rawBonuses === "" ? 0 : Number(rawBonuses);
  if (!Number.isInteger(nBonuses) || nBonuses < 0 || nBonuses > TOURNAMENT_BONUSES_MAX) {
    return json2(
      { error: `n_bonuses must be 0 to ${TOURNAMENT_BONUSES_MAX}` },
      400
    );
  }
  const team = typeof body.team === "string" ? body.team.slice(0, TEAM_MAX).trim() : "";
  const id = await tStore.createTournament({
    name,
    format: body.format,
    nTossups,
    nBonuses,
    createdBy: me.id,
    createdAt: ctx.now,
    startedAt: null,
    finishedAt: null,
    state: "open"
  });
  await tStore.addPlayer({
    tournamentId: id,
    userId: me.id,
    team,
    joinedAt: ctx.now
  });
  const tournament = await tStore.findTournament(id);
  if (!tournament) return json2({ error: "internal" }, 500);
  const detail = await toTournamentDetail(authStore, tStore, tournament);
  return json2({ tournament: detail }, 200);
}
__name(handleCreate, "handleCreate");
async function handleList(_request, authStore, tStore) {
  const rows = await tStore.listUnfinished();
  const tournaments = [];
  for (const r of rows) {
    tournaments.push(await toTournamentPublic(authStore, tStore, r));
  }
  return json2({ tournaments });
}
__name(handleList, "handleList");
async function handleGet(_request, authStore, tStore, id) {
  const t = await tStore.findTournament(id);
  if (!t) return json2({ error: "not found" }, 404);
  return json2({ tournament: await toTournamentDetail(authStore, tStore, t) });
}
__name(handleGet, "handleGet");
async function handleJoin(request, authStore, tStore, ctx, id) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const t = await tStore.findTournament(id);
  if (!t) return json2({ error: "not found" }, 404);
  if (t.state !== "open") {
    return json2({ error: "tournament is not open" }, 400);
  }
  const existing = await tStore.findPlayer(id, me.id);
  if (existing) return json2({ error: "already joined" }, 409);
  const body = await readBody(request) ?? {};
  const team = typeof body.team === "string" ? body.team.slice(0, TEAM_MAX).trim() : "";
  await tStore.addPlayer({
    tournamentId: id,
    userId: me.id,
    team,
    joinedAt: ctx.now
  });
  const fresh = await tStore.findTournament(id);
  if (!fresh) return json2({ error: "internal" }, 500);
  return json2({ tournament: await toTournamentDetail(authStore, tStore, fresh) }, 200);
}
__name(handleJoin, "handleJoin");
async function handleStart(request, authStore, tStore, ctx, id) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const t = await tStore.findTournament(id);
  if (!t) return json2({ error: "not found" }, 404);
  if (t.createdBy !== me.id) {
    return json2({ error: "only the creator can start the tournament" }, 403);
  }
  if (t.state !== "open") {
    return json2({ error: "tournament is not open" }, 400);
  }
  const body = await readBody(request);
  if (!body || !Array.isArray(body.questions)) {
    return json2({ error: "questions array required" }, 400);
  }
  const expected = t.nTossups + t.nBonuses;
  if (body.questions.length !== expected) {
    return json2(
      { error: `expected ${expected} questions, got ${body.questions.length}` },
      400
    );
  }
  const parsed = [];
  for (let i = 0; i < body.questions.length; i++) {
    const q = body.questions[i];
    if (!q || typeof q !== "object") {
      return json2({ error: `question at index ${i} is malformed` }, 400);
    }
    const seq = Number(q.seq);
    const questionId = typeof q.question_id === "string" ? q.question_id : "";
    if (!Number.isInteger(seq) || seq < 0) {
      return json2({ error: `question at index ${i} has invalid seq` }, 400);
    }
    if (!questionId) {
      return json2({ error: `question at index ${i} has empty question_id` }, 400);
    }
    if (!isKind(q.question_kind)) {
      return json2({ error: `question at index ${i} has invalid question_kind` }, 400);
    }
    parsed.push({ seq, questionId, questionKind: q.question_kind });
  }
  await tStore.addQuestions(id, parsed);
  await tStore.setTournamentState(id, "running", ctx.now, null);
  const fresh = await tStore.findTournament(id);
  if (!fresh) return json2({ error: "internal" }, 500);
  return json2({ tournament: await toTournamentDetail(authStore, tStore, fresh) }, 200);
}
__name(handleStart, "handleStart");
async function handleProtest(request, authStore, tStore, ctx, id) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const t = await tStore.findTournament(id);
  if (!t) return json2({ error: "not found" }, 404);
  const player = await tStore.findPlayer(id, me.id);
  if (!player) {
    return json2({ error: "only tournament players can file a protest" }, 403);
  }
  const rateKey = `protest:${me.id}`;
  if (!rateLimit(rateKey, ctx.now, PROTEST_RATE_LIMIT_MAX)) {
    return json2({ error: "too many protests, try again later" }, 429);
  }
  const body = await readBody(request);
  if (!body) return json2({ error: "invalid body" }, 400);
  const questionId = typeof body.question_id === "string" ? body.question_id : "";
  if (!questionId) {
    return json2({ error: "question_id is required" }, 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < PROTEST_REASON_MIN) {
    return json2(
      { error: `reason must be at least ${PROTEST_REASON_MIN} characters` },
      400
    );
  }
  if (reason.length > PROTEST_REASON_MAX) {
    return json2(
      { error: `reason cannot exceed ${PROTEST_REASON_MAX} characters` },
      400
    );
  }
  const givenAnswer = typeof body.given_answer === "string" ? body.given_answer.slice(0, 500) : "";
  const protestId = await tStore.createProtest({
    tournamentId: id,
    questionId,
    raisedBy: me.id,
    reason,
    givenAnswer,
    state: "pending",
    createdAt: ctx.now,
    resolvedBy: null,
    resolvedAt: null,
    resolvedNote: null
  });
  return json2({ id: protestId, state: "pending" }, 200);
}
__name(handleProtest, "handleProtest");
async function handleGetQuestion(_request, authStore, tStore, ctx, fetcher, tournamentId, seq) {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json2({ error: "not found" }, 404);
  const me = await requireUser(_request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  if (me.role !== "admin" && t.createdBy !== me.id) {
    const player = await tStore.findPlayer(tournamentId, me.id);
    if (!player) return json2({ error: "not a player in this tournament" }, 403);
  }
  const questions = await tStore.listQuestions(tournamentId);
  const pinned = questions.find((q) => q.seq === seq);
  if (!pinned) return json2({ error: "seq out of range" }, 404);
  const cached = cacheGet(pinned.questionKind, pinned.questionId);
  if (cached) {
    return json2({
      seq: pinned.seq,
      question_id: pinned.questionId,
      question_kind: pinned.questionKind,
      total: questions.length,
      ...pinned.questionKind === "tossup" ? { tossup: cached } : { bonus: cached }
    });
  }
  const resolved = pinned.questionKind === "tossup" ? await fetcher.fetchTossup(pinned.questionId) : await fetcher.fetchBonus(pinned.questionId);
  if (!resolved) {
    return json2(
      { error: `upstream could not resolve ${pinned.questionKind} ${pinned.questionId}` },
      502
    );
  }
  cacheSet(pinned.questionKind, pinned.questionId, resolved);
  return json2({
    seq: pinned.seq,
    question_id: pinned.questionId,
    question_kind: pinned.questionKind,
    total: questions.length,
    ...pinned.questionKind === "tossup" ? { tossup: resolved } : { bonus: resolved }
  });
}
__name(handleGetQuestion, "handleGetQuestion");
async function handleRecordAttempt(request, authStore, tStore, ctx, tournamentId) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json2({ error: "not found" }, 404);
  const player = await tStore.findPlayer(tournamentId, me.id);
  if (!player) return json2({ error: "only players can record attempts" }, 403);
  if (!rateLimit(`attempt:${me.id}`, ctx.now, ATTEMPT_RATE_LIMIT_MAX)) {
    return json2({ error: "too many attempts, try again later" }, 429);
  }
  const body = await readBody(request);
  if (!body) return json2({ error: "invalid body" }, 400);
  const seq = Number(body.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return json2({ error: "seq must be a non-negative integer" }, 400);
  }
  const questionId = typeof body.question_id === "string" ? body.question_id : "";
  if (!questionId) return json2({ error: "question_id is required" }, 400);
  if (!isDirective(body.directive)) {
    return json2({ error: "directive must be accept, prompt or reject" }, 400);
  }
  const points = Number(body.points);
  if (!Number.isFinite(points) || !Number.isInteger(points)) {
    return json2({ error: "points must be an integer" }, 400);
  }
  const totalWords = Number(body.total_words);
  if (!Number.isInteger(totalWords) || totalWords < 0) {
    return json2({ error: "total_words must be a non-negative integer" }, 400);
  }
  const buzzWordIndex = body.buzz_word_index == null || body.buzz_word_index === "" ? null : Number(body.buzz_word_index);
  if (buzzWordIndex !== null && (!Number.isInteger(buzzWordIndex) || buzzWordIndex < 0)) {
    return json2({ error: "buzz_word_index must be a non-negative integer or null" }, 400);
  }
  const powerWordIndex = body.power_word_index == null || body.power_word_index === "" ? null : Number(body.power_word_index);
  if (powerWordIndex !== null && (!Number.isInteger(powerWordIndex) || powerWordIndex < 0)) {
    return json2({ error: "power_word_index must be a non-negative integer or null" }, 400);
  }
  const msToAnswer = body.ms_to_answer == null || body.ms_to_answer === "" ? null : Number(body.ms_to_answer);
  if (msToAnswer !== null && (!Number.isFinite(msToAnswer) || msToAnswer < 0)) {
    return json2({ error: "ms_to_answer must be a non-negative number or null" }, 400);
  }
  const givenAnswer = typeof body.given_answer === "string" ? body.given_answer.slice(0, ATTEMPT_ANSWER_MAX) : "";
  const powered = body.powered === true || body.powered === 1 || body.powered === "1";
  const id = await tStore.createAttempt({
    tournamentId,
    userId: me.id,
    seq,
    questionId,
    givenAnswer,
    directive: body.directive,
    points,
    powered,
    buzzWordIndex,
    totalWords,
    powerWordIndex,
    msToAnswer,
    createdAt: ctx.now,
    restitutedAt: null,
    restitutionDelta: 0
  });
  return json2({ id, recorded_at: ctx.now }, 200);
}
__name(handleRecordAttempt, "handleRecordAttempt");
async function computeScoreboard(authStore, tStore, tournamentId) {
  const players = await tStore.listPlayers(tournamentId);
  const attempts = await tStore.listAttempts(tournamentId);
  const byUser = /* @__PURE__ */ new Map();
  for (const p of players) byUser.set(p.userId, { base: 0, delta: 0 });
  for (const a of attempts) {
    const bucket = byUser.get(a.userId) ?? { base: 0, delta: 0 };
    bucket.base += a.points;
    bucket.delta += a.restitutionDelta;
    byUser.set(a.userId, bucket);
  }
  const entries = [];
  for (const p of players) {
    const b = byUser.get(p.userId) ?? { base: 0, delta: 0 };
    const username = await usernameOf(authStore, p.userId);
    entries.push({
      user_id: p.userId,
      username,
      team: p.team,
      base_points: b.base,
      restitution_delta: b.delta,
      points: b.base + b.delta
    });
  }
  entries.sort((a, b) => b.points - a.points);
  return entries;
}
__name(computeScoreboard, "computeScoreboard");
async function handleScoreboard(_request, authStore, tStore, tournamentId) {
  const t = await tStore.findTournament(tournamentId);
  if (!t) return json2({ error: "not found" }, 404);
  const scoreboard = await computeScoreboard(authStore, tStore, tournamentId);
  return json2({ scoreboard });
}
__name(handleScoreboard, "handleScoreboard");
async function handleListProtests(request, authStore, tStore, ctx, id) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json2({ error: "not signed in" }, 401);
  const t = await tStore.findTournament(id);
  if (!t) return json2({ error: "not found" }, 404);
  const rows = me.role === "admin" ? await tStore.listProtestsForTournament(id) : await tStore.listProtestsForUser(id, me.id);
  return json2({
    protests: rows.map((p) => ({
      id: p.id,
      tournament_id: p.tournamentId,
      question_id: p.questionId,
      raised_by: p.raisedBy,
      reason: p.reason,
      given_answer: p.givenAnswer,
      state: p.state,
      created_at: p.createdAt,
      resolved_by: p.resolvedBy,
      resolved_at: p.resolvedAt,
      resolved_note: p.resolvedNote
    }))
  });
}
__name(handleListProtests, "handleListProtests");
function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
__name(parseId, "parseId");
async function handleTournaments(request, authStore, tStore, ctx, fetcher = qbReaderQuestionFetcher()) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/tournaments")) return null;
  if (path === "/api/tournaments") {
    if (request.method === "GET") return handleList(request, authStore, tStore);
    if (request.method === "POST") return handleCreate(request, authStore, tStore, ctx);
    return json2({ error: "method not allowed" }, 405);
  }
  const rest = path.slice("/api/tournaments/".length);
  if (rest.length === 0) return json2({ error: "not found" }, 404);
  const parts = rest.split("/");
  const [idRaw, action, arg, ...more] = parts;
  if (more.length > 0) return json2({ error: "not found" }, 404);
  const id = parseId(idRaw ?? "");
  if (id === null) return json2({ error: "not found" }, 404);
  if (action === void 0) {
    if (request.method !== "GET")
      return json2({ error: "method not allowed" }, 405);
    return handleGet(request, authStore, tStore, id);
  }
  if (action === "join" && arg === void 0) {
    if (request.method !== "POST")
      return json2({ error: "method not allowed" }, 405);
    return handleJoin(request, authStore, tStore, ctx, id);
  }
  if (action === "start" && arg === void 0) {
    if (request.method !== "POST")
      return json2({ error: "method not allowed" }, 405);
    return handleStart(request, authStore, tStore, ctx, id);
  }
  if (action === "protest" && arg === void 0) {
    if (request.method !== "POST")
      return json2({ error: "method not allowed" }, 405);
    return handleProtest(request, authStore, tStore, ctx, id);
  }
  if (action === "protests" && arg === void 0) {
    if (request.method !== "GET")
      return json2({ error: "method not allowed" }, 405);
    return handleListProtests(request, authStore, tStore, ctx, id);
  }
  if (action === "attempts" && arg === void 0) {
    if (request.method !== "POST")
      return json2({ error: "method not allowed" }, 405);
    return handleRecordAttempt(request, authStore, tStore, ctx, id);
  }
  if (action === "scoreboard" && arg === void 0) {
    if (request.method !== "GET")
      return json2({ error: "method not allowed" }, 405);
    return handleScoreboard(request, authStore, tStore, id);
  }
  if (action === "questions" && arg !== void 0) {
    if (request.method !== "GET")
      return json2({ error: "method not allowed" }, 405);
    const seq = Number(arg);
    if (!Number.isInteger(seq) || seq < 0) {
      return json2({ error: "seq must be a non-negative integer" }, 400);
    }
    return handleGetQuestion(request, authStore, tStore, ctx, fetcher, id, seq);
  }
  return json2({ error: "not found" }, 404);
}
__name(handleTournaments, "handleTournaments");

// workers/room/admin.ts
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var LIVE_ROOMS_STALENESS_MS = 2 * 60 * 1e3;
var USER_LIST_LIMIT_MAX = 50;
var USER_LIST_LIMIT_DEFAULT = 25;
var PROTEST_NOTE_MAX = 1e3;
function isRole(v) {
  return v === "user" || v === "admin";
}
__name(isRole, "isRole");
function isProtestState(v) {
  return v === "pending" || v === "accepted" || v === "rejected";
}
__name(isProtestState, "isProtestState");
function isDecision(v) {
  return v === "accepted" || v === "rejected";
}
__name(isDecision, "isDecision");
function num3(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
__name(num3, "num");
function numOrNull2(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
__name(numOrNull2, "numOrNull");
function strOrNull2(v) {
  if (v == null) return null;
  return String(v);
}
__name(strOrNull2, "strOrNull");
function roleOf2(v) {
  return v === "admin" ? "admin" : "user";
}
__name(roleOf2, "roleOf");
function protestStateOf2(v) {
  return v === "accepted" || v === "rejected" ? v : "pending";
}
__name(protestStateOf2, "protestStateOf");
function rowToUser(row) {
  return {
    id: num3(row.id),
    username: String(row.username ?? ""),
    pwHash: String(row.pw_hash ?? ""),
    role: roleOf2(row.role),
    createdAt: num3(row.created_at),
    bannedAt: numOrNull2(row.banned_at)
  };
}
__name(rowToUser, "rowToUser");
function rowToLiveRoom(row) {
  return {
    id: String(row.id ?? ""),
    createdAt: num3(row.created_at),
    lastSeen: num3(row.last_seen),
    playerCount: num3(row.player_count),
    closedAt: numOrNull2(row.closed_at)
  };
}
__name(rowToLiveRoom, "rowToLiveRoom");
function rowToProtest2(row) {
  return {
    id: num3(row.id),
    tournamentId: num3(row.tournament_id),
    questionId: String(row.question_id ?? ""),
    raisedBy: num3(row.raised_by),
    reason: String(row.reason ?? ""),
    givenAnswer: String(row.given_answer ?? ""),
    state: protestStateOf2(row.state),
    createdAt: num3(row.created_at),
    resolvedBy: numOrNull2(row.resolved_by),
    resolvedAt: numOrNull2(row.resolved_at),
    resolvedNote: strOrNull2(row.resolved_note)
  };
}
__name(rowToProtest2, "rowToProtest");
function d1AdminStore(db) {
  return {
    async listUsers({ q, offset, limit }) {
      const safeLimit = Math.max(1, Math.min(limit, USER_LIST_LIMIT_MAX));
      const safeOffset = Math.max(0, offset);
      const like = `%${q.toLowerCase().replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      const totalRow = await db.prepare(
        `SELECT COUNT(*) AS c FROM users WHERE lower(username) LIKE ? ESCAPE '\\'`
      ).bind(like).first();
      const total = totalRow ? num3(totalRow.c) : 0;
      const res = await db.prepare(
        `SELECT id, username, pw_hash, role, created_at, banned_at
             FROM users
             WHERE lower(username) LIKE ? ESCAPE '\\'
             ORDER BY id ASC
             LIMIT ? OFFSET ?`
      ).bind(like, safeLimit, safeOffset).all();
      const rows = (res.results ?? []).map(rowToUser);
      return { rows, total };
    },
    async setUserRole(id, role) {
      await db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
    },
    async setUserBanned(id, bannedAt) {
      await db.prepare("UPDATE users SET banned_at = ? WHERE id = ?").bind(bannedAt, id).run();
    },
    async deleteSessionsForUser(userId) {
      await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
    },
    async listLiveRooms(now, stalenessMs) {
      const cutoff = now - stalenessMs;
      await db.prepare("DELETE FROM live_rooms WHERE last_seen < ?").bind(cutoff).run();
      const res = await db.prepare(
        `SELECT id, created_at, last_seen, player_count, closed_at
             FROM live_rooms
             WHERE closed_at IS NULL
             ORDER BY created_at ASC`
      ).all();
      return (res.results ?? []).map(rowToLiveRoom);
    },
    async findLiveRoom(id) {
      const row = await db.prepare(
        `SELECT id, created_at, last_seen, player_count, closed_at
             FROM live_rooms WHERE id = ?`
      ).bind(id).first();
      return row ? rowToLiveRoom(row) : null;
    },
    async markRoomClosed(id, closedAt) {
      const res = await db.prepare("UPDATE live_rooms SET closed_at = ? WHERE id = ?").bind(closedAt, id).run();
      const changes = res.meta?.changes ?? -1;
      if (changes >= 0) return changes > 0;
      return await this.findLiveRoom(id) !== null;
    },
    async listProtests(state) {
      if (state === null) {
        const res2 = await db.prepare(
          `SELECT id, tournament_id, question_id, raised_by, reason,
                    given_answer, state, created_at, resolved_by, resolved_at,
                    resolved_note
               FROM protests
               ORDER BY created_at DESC`
        ).all();
        return (res2.results ?? []).map(rowToProtest2);
      }
      const res = await db.prepare(
        `SELECT id, tournament_id, question_id, raised_by, reason,
                  given_answer, state, created_at, resolved_by, resolved_at,
                  resolved_note
             FROM protests
             WHERE state = ?
             ORDER BY created_at DESC`
      ).bind(state).all();
      return (res.results ?? []).map(rowToProtest2);
    },
    async findProtest(id) {
      const row = await db.prepare(
        `SELECT id, tournament_id, question_id, raised_by, reason,
                  given_answer, state, created_at, resolved_by, resolved_at,
                  resolved_note
             FROM protests WHERE id = ?`
      ).bind(id).first();
      return row ? rowToProtest2(row) : null;
    },
    async resolveProtest(id, state, resolvedBy, resolvedAt, note) {
      await db.prepare(
        `UPDATE protests
             SET state = ?, resolved_by = ?, resolved_at = ?, resolved_note = ?
             WHERE id = ?`
      ).bind(state, resolvedBy, resolvedAt, note, id).run();
    }
  };
}
__name(d1AdminStore, "d1AdminStore");
function json3(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(json3, "json");
async function readBody2(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return null;
    return body;
  } catch {
    return null;
  }
}
__name(readBody2, "readBody");
async function requireAdmin(request, authStore, ctx) {
  const me = await requireUser(request, authStore, ctx.now);
  if (!me) return json3({ error: "not signed in" }, 401);
  if (me.role !== "admin") return json3({ error: "admin only" }, 403);
  return me;
}
__name(requireAdmin, "requireAdmin");
function toUserListEntry(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    created_at: u.createdAt,
    banned_at: u.bannedAt
  };
}
__name(toUserListEntry, "toUserListEntry");
async function handleListUsers(request, authStore, admin, ctx) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const limitRaw = Number(url.searchParams.get("limit") ?? USER_LIST_LIMIT_DEFAULT);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, USER_LIST_LIMIT_MAX) : USER_LIST_LIMIT_DEFAULT;
  const { rows, total } = await admin.listUsers({
    q,
    offset: (page - 1) * limit,
    limit
  });
  const pageCount = total === 0 ? 1 : Math.ceil(total / limit);
  return json3({
    users: rows.map(toUserListEntry),
    page,
    pageCount,
    total
  });
}
__name(handleListUsers, "handleListUsers");
async function handleSetRole(request, authStore, admin, ctx, userId) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const body = await readBody2(request);
  if (!body) return json3({ error: "invalid body" }, 400);
  if (!isRole(body.role)) {
    return json3({ error: 'role must be "user" or "admin"' }, 400);
  }
  const target = await authStore.findUserById(userId);
  if (!target) return json3({ error: "user not found" }, 404);
  if (target.id === me.id && body.role !== "admin") {
    return json3({ error: "cannot demote yourself" }, 400);
  }
  await admin.setUserRole(userId, body.role);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json3({ error: "user not found" }, 404);
  return json3({ user: toUserListEntry(fresh) });
}
__name(handleSetRole, "handleSetRole");
async function handleBan(request, authStore, admin, ctx, userId) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const target = await authStore.findUserById(userId);
  if (!target) return json3({ error: "user not found" }, 404);
  if (target.id === me.id) {
    return json3({ error: "cannot ban yourself" }, 400);
  }
  await admin.setUserBanned(userId, ctx.now);
  await admin.deleteSessionsForUser(userId);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json3({ error: "user not found" }, 404);
  return json3({ user: toUserListEntry(fresh) });
}
__name(handleBan, "handleBan");
async function handleUnban(request, authStore, admin, ctx, userId) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const target = await authStore.findUserById(userId);
  if (!target) return json3({ error: "user not found" }, 404);
  await admin.setUserBanned(userId, null);
  const fresh = await authStore.findUserById(userId);
  if (!fresh) return json3({ error: "user not found" }, 404);
  return json3({ user: toUserListEntry(fresh) });
}
__name(handleUnban, "handleUnban");
function toLiveRoomView(r) {
  return {
    id: r.id,
    created_at: r.createdAt,
    last_seen: r.lastSeen,
    player_count: r.playerCount
  };
}
__name(toLiveRoomView, "toLiveRoomView");
async function handleListRooms(request, authStore, admin, ctx) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const rows = await admin.listLiveRooms(ctx.now, LIVE_ROOMS_STALENESS_MS);
  return json3({ rooms: rows.map(toLiveRoomView) });
}
__name(handleListRooms, "handleListRooms");
async function handleCloseRoom(request, authStore, admin, rooms, ctx, id) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const row = await admin.findLiveRoom(id);
  if (!row) return json3({ error: "room not found" }, 404);
  await admin.markRoomClosed(id, ctx.now);
  try {
    await rooms.close(id);
  } catch (err) {
    console.error("direct room close failed", err);
  }
  return json3({ ok: true });
}
__name(handleCloseRoom, "handleCloseRoom");
async function handleListPackets(request, authStore, ctx) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  return json3({
    packets: [],
    note: "packet import is client-side; nothing to manage server-side yet"
  });
}
__name(handleListPackets, "handleListPackets");
async function handleRemovePacket(request, authStore, ctx) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  return json3(
    {
      error: "packets are not persisted server-side; nothing to remove"
    },
    404
  );
}
__name(handleRemovePacket, "handleRemovePacket");
async function deltaForProtest(tStore, p) {
  if (p.state !== "accepted") return null;
  const attempt = await tStore.findAttemptForProtest(
    p.tournamentId,
    p.raisedBy,
    p.questionId
  );
  if (!attempt) return null;
  return attempt.restitutionDelta;
}
__name(deltaForProtest, "deltaForProtest");
async function handleListProtests2(request, authStore, admin, tStore, ctx) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "pending";
  const filter = rawState === "all" ? null : isProtestState(rawState) ? rawState : "pending";
  const rows = await admin.listProtests(filter);
  const views = [];
  for (const p of rows) {
    const tournament = await tStore.findTournament(p.tournamentId);
    const raiser = await authStore.findUserById(p.raisedBy);
    const delta = await deltaForProtest(tStore, p);
    views.push({
      id: p.id,
      tournament_id: p.tournamentId,
      tournament_name: tournament ? tournament.name : "",
      question_id: p.questionId,
      raised_by: p.raisedBy,
      raised_by_username: raiser ? raiser.username : "",
      reason: p.reason,
      given_answer: p.givenAnswer,
      state: p.state,
      created_at: p.createdAt,
      resolved_by: p.resolvedBy,
      resolved_at: p.resolvedAt,
      resolved_note: p.resolvedNote,
      restitution_delta: delta
    });
  }
  return json3({ protests: views });
}
__name(handleListProtests2, "handleListProtests");
function restitutedPointsFor(attempt) {
  if (attempt.questionId.includes("#")) {
    const inferredValue = Math.max(attempt.points, 10);
    return scoreBonusPart(true, inferredValue);
  }
  const outcome = scoreTossup({
    buzzWordIndex: attempt.buzzWordIndex,
    powerIndex: attempt.powerWordIndex,
    correct: true
  });
  return outcome.points;
}
__name(restitutedPointsFor, "restitutedPointsFor");
async function handleResolveProtest(request, authStore, admin, tStore, ctx, protestId) {
  const me = await requireAdmin(request, authStore, ctx);
  if (me instanceof Response) return me;
  const body = await readBody2(request);
  if (!body) return json3({ error: "invalid body" }, 400);
  if (!isDecision(body.decision)) {
    return json3({ error: 'decision must be "accepted" or "rejected"' }, 400);
  }
  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  if (rawNote.length > PROTEST_NOTE_MAX) {
    return json3(
      { error: `note cannot exceed ${PROTEST_NOTE_MAX} characters` },
      400
    );
  }
  const note = rawNote.length > 0 ? rawNote : null;
  const existing = await admin.findProtest(protestId);
  if (!existing) return json3({ error: "protest not found" }, 404);
  if (existing.state !== "pending") {
    return json3({ error: "protest has already been resolved" }, 400);
  }
  await admin.resolveProtest(
    protestId,
    body.decision,
    me.id,
    ctx.now,
    note
  );
  let restitutionDelta = null;
  if (body.decision === "accepted") {
    const attempt = await tStore.findAttemptForProtest(
      existing.tournamentId,
      existing.raisedBy,
      existing.questionId
    );
    if (attempt) {
      const target = restitutedPointsFor(attempt);
      restitutionDelta = target - attempt.points;
      await tStore.applyAttemptRestitution(
        attempt.id,
        restitutionDelta,
        ctx.now
      );
    }
  }
  const fresh = await admin.findProtest(protestId);
  if (!fresh) return json3({ error: "protest not found" }, 404);
  return json3({
    protest: {
      id: fresh.id,
      tournament_id: fresh.tournamentId,
      question_id: fresh.questionId,
      raised_by: fresh.raisedBy,
      reason: fresh.reason,
      given_answer: fresh.givenAnswer,
      state: fresh.state,
      created_at: fresh.createdAt,
      resolved_by: fresh.resolvedBy,
      resolved_at: fresh.resolvedAt,
      resolved_note: fresh.resolvedNote,
      restitution_delta: restitutionDelta
    }
  });
}
__name(handleResolveProtest, "handleResolveProtest");
function parseId2(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
__name(parseId2, "parseId");
var NOOP_ROOM_CLOSER = { async close() {
} };
async function handleAdmin(request, authStore, admin, tStore, ctxOrRooms, maybeCtx) {
  const rooms = maybeCtx === void 0 ? NOOP_ROOM_CLOSER : ctxOrRooms;
  const ctx = maybeCtx === void 0 ? ctxOrRooms : maybeCtx;
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/admin")) return null;
  if (path === "/api/admin/users") {
    if (request.method !== "GET")
      return json3({ error: "method not allowed" }, 405);
    return handleListUsers(request, authStore, admin, ctx);
  }
  if (path === "/api/admin/rooms") {
    if (request.method !== "GET")
      return json3({ error: "method not allowed" }, 405);
    return handleListRooms(request, authStore, admin, ctx);
  }
  if (path === "/api/admin/packets") {
    if (request.method !== "GET")
      return json3({ error: "method not allowed" }, 405);
    return handleListPackets(request, authStore, ctx);
  }
  if (path === "/api/admin/protests") {
    if (request.method !== "GET")
      return json3({ error: "method not allowed" }, 405);
    return handleListProtests2(request, authStore, admin, tStore, ctx);
  }
  const userAction = /^\/api\/admin\/users\/(\d+)\/(role|ban|unban)$/.exec(path);
  if (userAction) {
    if (request.method !== "POST")
      return json3({ error: "method not allowed" }, 405);
    const id = parseId2(userAction[1] ?? "");
    if (id === null) return json3({ error: "not found" }, 404);
    const action = userAction[2];
    if (action === "role")
      return handleSetRole(request, authStore, admin, ctx, id);
    if (action === "ban")
      return handleBan(request, authStore, admin, ctx, id);
    if (action === "unban")
      return handleUnban(request, authStore, admin, ctx, id);
  }
  const roomAction = /^\/api\/admin\/rooms\/([A-Za-z0-9]+)\/close$/.exec(path);
  if (roomAction) {
    if (request.method !== "POST")
      return json3({ error: "method not allowed" }, 405);
    const id = (roomAction[1] ?? "").toUpperCase();
    return handleCloseRoom(request, authStore, admin, rooms, ctx, id);
  }
  const packetAction = /^\/api\/admin\/packets\/([^/]+)\/remove$/.exec(path);
  if (packetAction) {
    if (request.method !== "POST")
      return json3({ error: "method not allowed" }, 405);
    return handleRemovePacket(request, authStore, ctx);
  }
  const protestAction = /^\/api\/admin\/protests\/(\d+)\/resolve$/.exec(path);
  if (protestAction) {
    if (request.method !== "POST")
      return json3({ error: "method not allowed" }, 405);
    const id = parseId2(protestAction[1] ?? "");
    if (id === null) return json3({ error: "not found" }, 404);
    return handleResolveProtest(request, authStore, admin, tStore, ctx, id);
  }
  return json3({ error: "not found" }, 404);
}
__name(handleAdmin, "handleAdmin");

// workers/room/index.ts
function roomCloserFor(env2) {
  return {
    async close(id) {
      const stub = env2.ROOM.get(env2.ROOM.idFromName(id));
      await stub.fetch("https://do/__internal/close", {
        method: "POST",
        headers: { "x-internal-secret": env2.INTERNAL_SECRET ?? "" }
      });
    }
  };
}
__name(roomCloserFor, "roomCloserFor");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
};
function json4(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS }
  });
}
__name(json4, "json");
function contextFrom(request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const colo = request.cf?.colo ?? "local";
  return { ip: ip.toLowerCase(), colo, now: Date.now() };
}
__name(contextFrom, "contextFrom");
var index_default = {
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (url.pathname.startsWith("/api/auth/")) {
      const response = await handleAuth(request, d1Store(env2.DB), contextFrom(request));
      if (response) return response;
    }
    if (url.pathname.startsWith("/api/admin")) {
      const authStore = d1Store(env2.DB);
      const tStore = d1TournamentStore(env2.DB);
      const adminStore = d1AdminStore(env2.DB);
      const response = await handleAdmin(
        request,
        authStore,
        adminStore,
        tStore,
        roomCloserFor(env2),
        contextFrom(request)
      );
      if (response) return response;
    }
    if (url.pathname.startsWith("/api/tournaments")) {
      const authStore = d1Store(env2.DB);
      const tStore = d1TournamentStore(env2.DB);
      const response = await handleTournaments(
        request,
        authStore,
        tStore,
        contextFrom(request)
      );
      if (response) return response;
    }
    if (request.method === "POST" && url.pathname === "/api/room") {
      const code = makeRoomCode();
      return json4({ code });
    }
    const match = /^\/api\/room\/([A-Za-z0-9]{4})\/(ws|state)$/.exec(
      url.pathname
    );
    if (match) {
      const code = (match[1] ?? "").toUpperCase();
      const id = env2.ROOM.idFromName(code);
      const stub = env2.ROOM.get(id);
      const forwarded = new URL(request.url);
      forwarded.searchParams.set("code", code);
      return stub.fetch(new Request(forwarded.toString(), request));
    }
    return json4({ error: "not found" }, 404);
  }
};
export {
  Room,
  index_default as default
};
/*! Bundled license information:

number-to-words/numberToWords.min.js:
  (*!
   * Number-To-Words util
   * @version v1.2.5
   * @link https://github.com/marlun78/number-to-words
   * @author Martin Eneqvist (https://github.com/marlun78)
   * @contributors Aleksey Pilyugin (https://github.com/pilyugin),Jeremiah Hall (https://github.com/jeremiahrhall),Adriano Melo (https://github.com/adrianomelo),dmrzn (https://github.com/dmrzn)
   * @license MIT
   *)
*/
//# sourceMappingURL=index.js.map
