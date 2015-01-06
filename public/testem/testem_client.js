/*

testem_client.js
================

The client-side script that reports results back to the Testem server via Socket.IO.
It also restarts the tests by refreshing the page when instructed by the server to do so.

*/


function getBrowserName(userAgent){
  var regexs = [
    /MS(?:(IE) (1?[0-9]\.[0-9]))/,
    [/(OPR)\/([0-9]+\.[0-9]+)/, function(m){
      return ['Opera', m[2]].join(' ')
    }],
    /(Opera).*Version\/([0-9]+\.[0-9]+)/,
    /(Chrome)\/([0-9]+\.[0-9]+)/,
    /(Firefox)\/([0-9a-z]+\.[0-9a-z]+)/,
    /(PhantomJS)\/([0-9]+\.[0-9]+)/,
    [/(Android).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m){
      return [m[1], m[3], m[2]].join(' ')
    }],
    [/(iPhone).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m){
      return [m[1], m[3], m[2]].join(' ')
    }],
    [/(iPad).*Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m){
      return [m[1], m[3], m[2]].join(' ')
    }],
    [/Version\/([0-9]+\.[0-9]+).*(Safari)/, function(m){
      return [m[2], m[1]].join(' ')
    }]
  ]
  for (var i = 0; i < regexs.length; i++){
    var regex = regexs[i]
    var pick = function(m){
      return m.slice(1).join(' ')
    }
    if (regex instanceof Array){
      pick = regex[1]
      regex = regex[0]
    }
    var match = userAgent.match(regex)
    if (match){
      return pick(match)
    }
  }
  return userAgent
}

var socket, connectStatus = 'disconnected'

function syncConnectStatus(){
  var elm = document.getElementById('__testem_ui__')
  if (elm) elm.className = connectStatus
}

function startTests(){
  socket.disconnect()
  window.location.reload()
}

function initUI(){
  var markup = '\
  <style>\
  #__testem_ui__{\
    position: fixed;\
    bottom: 5px;\
    right: 5px;\
    background-color: #444;\
    padding: 3px;\
    color: #fff;\
    font-family: Monaco, monospace;\
    text-transform: uppercase;\
    opacity: 0.8;\
  }\
  #__testem_ui__.connected{\
    color: #89e583;\
  }\
  #__testem_ui__.disconnected{\
    color: #cc7575;\
  }\
  </style>\
  TEST\u0027EM \u0027SCRIPTS!\
  '
  var elm = document.createElement('div')
  elm.id = '__testem_ui__'
  elm.className = connectStatus
  elm.innerHTML = markup
  document.body.appendChild(elm)
}

function initTestFrameworkHooks(){
  if (typeof getJasmineRequireObj === 'function'){
    jasmine2Adapter(socket)
  }else if (typeof jasmine === 'object'){
    jasmineAdapter(socket)
  }else if ((typeof mocha).match(/function|object/)){
    mochaAdapter(socket)
  }else if (typeof QUnit === 'object'){
    qunitAdapter(socket)
  }else if (typeof buster !== 'undefined'){
    busterAdapter(socket)
  }
}

var addListener = window.addEventListener ?
  function(obj, evt, cb){ obj.addEventListener(evt, cb, false) } :
  function(obj, evt, cb){ obj.attachEvent('on' + evt, cb) }

function getId(){
  var m = location.pathname.match(/^\/([0-9]+)/)
  return m ? m[1] : null
}

function init(){
  takeOverConsole()
  interceptWindowOnError()
  socket = io.connect({ reconnectionDelayMax: 1000 })
  var id = getId()
  socket.emit('browser-login',
    getBrowserName(navigator.userAgent),
    id)
  socket.on('connect', function(){
    connectStatus = 'connected'
    syncConnectStatus()
  })
  socket.on('disconnect', function(){
    connectStatus = 'disconnected'
    syncConnectStatus()
  })
  socket.on('reconnect', startTests)
  socket.on('start-tests', startTests)
  initTestFrameworkHooks()
  addListener(window, 'load', initUI)
  setupTestStats()
}

function setupTestStats(){
  var originalTitle = document.title
  var total = 0
  var passed = 0
  Testem.on('test-result', function(test){
    total++
    if (test.failed === 0) passed++
    updateTitle()
  })

  function updateTitle(){
    if (!total) return
    document.title = originalTitle + ' (' + passed + '/' + total + ')'
  }
}

function takeOverConsole(){
  var console = window.console
  if (!console) {
    console = window.console = {
      log: function () {},
      warn: function () {},
      error: function () {},
      info: function () {}
    }
  }
  function intercept(method){
    var original = console[method]
    console[method] = function(){
      var args = Array.prototype.slice.apply(arguments)
      var message = circularSafe(args).join(' ')
      var doDefault = Testem.handleConsoleMessage(message)
      if (doDefault !== false){
        socket.emit(method, circularSafe(message))
        if (original && original.apply){
          // Do this for normal browsers
          original.apply(console, arguments)
        }else if (original) {
          // Do this for IE
          original(message)
        }
      }
    }
  }
  var methods = ['log', 'warn', 'error', 'info']
  for (var i = 0; i < methods.length; i++)
    intercept(methods[i])
}

function interceptWindowOnError(){
  window.onerror = function(msg, url, line){
    if (typeof msg === 'string' && typeof url === 'string' && typeof line === 'number'){
      socket.emit('top-level-error', msg, url, line)
    }
  }
}

function arrayIndexOf (obj, searchElement, fromIndex) {
  if (Array.prototype.indexOf) {
    return obj.indexOf(searchElement, fromIndex);
  }
  // Array.indexOf polyfill required for IE <= 8
  // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Array/indexOf#Polyfill
  var k;

  if (obj == null) {
    throw new TypeError('"obj" is null or not defined');
  }

  var O = Object(obj);
  var len = O.length >>> 0;
  if (len === 0) {
    return -1;
  }

  var n = +fromIndex || 0;
  if (Math.abs(n) === Infinity) {
    n = 0;
  }
  if (n >= len) {
    return -1;
  }

  k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
  while (k < len) {
    if (k in O && O[k] === searchElement) {
      return k;
    }
    k++;
  }
  return -1;
}

function getSerialize (fn, decycle) {
  var seen = [], keys = [];
  decycle = decycle || function(key, value) {
    return '[Circular ' + getPath(value, seen, keys) + ']'
  };
  return function(key, value) {
    var ret = value;
    if (value && typeof value.nodeType === 'number'){
      return String(value);
    }
    if (typeof value === 'object' && value) {
      if (arrayIndexOf(seen, value) !== -1)
        ret = decycle(key, value);
      else {
        seen.push(value);
        keys.push(key);
      }
    }
    if (fn) ret = fn(key, ret);
    return ret;
  }
}

function getPath (value, seen, keys) {
  var index = arrayIndexOf(seen, value);
  var path = [ keys[index] ];
  for (index--; index >= 0; index--) {
    if (seen[index][ path[0] ] === value) {
      value = seen[index];
      path.unshift(keys[index]);
    }
  }
  return '~' + path.join('.');
}

function stringify(obj, fn, spaces, decycle) {
  return xJSON.stringify(obj, getSerialize(fn, decycle), spaces);
}

function circularSafe(obj){
  return xJSON.parse(stringify(obj))
}

function emit(){
  Testem.emit.apply(Testem, arguments)
}

window.Testem = {
  useCustomAdapter: function(adapter){
    adapter(socket)
  },
  emit: function(evt){
    var args = Array.prototype.slice.apply(arguments)
    socket.emit.apply(socket, circularSafe(args))
    if (this.evtHandlers && this.evtHandlers[evt]){
      var handlers = this.evtHandlers[evt]
      var args = Array.prototype.slice.call(arguments, 1)
      for (var i = 0; i < handlers.length; i++){
        var handler = handlers[i]
        handler.apply(this, args)
      }
    }
  },
  on: function(evt, callback){
    if (!this.evtHandlers){
      this.evtHandlers = {}
    }
    if (!this.evtHandlers[evt]){
      this.evtHandlers[evt] = []
    }
    this.evtHandlers[evt].push(callback)
  },
  handleConsoleMessage: function(){}
}

var localJSON3 = JSON3.noConflict()
var xJSON = window.JSON || localJSON3

init()
