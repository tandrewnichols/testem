var Server = require('../lib/server')
var Config = require('../lib/config')
var EventEmitter = require('events').EventEmitter
var Backbone = require('backbone')
var request = require('request')
var cheerio = require('cheerio')
var fs = require('fs')
var path = require('path')
var expect = require('chai').expect

describe('Server', function(){
  var server, runners, app, socketClient, config
  var orgSetTimeout, baseUrl, port
  before(function(done){
  port = 73571
  config = new Config('dev', {
    port: port,
    src_files: [
      'web/hello.js',
      {src:'web/hello_tst.js', attrs: ['data-foo="true"', 'data-bar']}
    ],
    cwd: 'tests'
  })
  baseUrl = 'http://localhost:' + port + '/'
  runners = new Backbone.Collection

  server = new Server(config)
  server.start()
  server.server.addListener('connection', function(stream){
    stream.setTimeout(100) // don't tolerate idleness in tests
  })
  server.once('server-start', function(){
    done()
  })
  socketClient = new EventEmitter
  })
  after(function(done){
    server.stop(function(){
      done()
    })
  })

  it('gets the home page', function(done){
    request(baseUrl, function(err, req, text){
      done()
    })
  })

  it('gets scripts for the home page', function(done){
    request(baseUrl, function(err, req, text){
      var $ = cheerio.load(text)
      var srcs = $('script').map(function() { return $(this).attr('src') }).get()
      expect(srcs).to.deep.equal([
          '/testem/jasmine.js',
          '/testem.js',
          '/testem/jasmine-html.js',
          'web/hello.js',
          'web/hello_tst.js'
      ])
      done()
    })
  })

  it('gets testem.js', function(done){
    request(baseUrl + '/testem.js', function(err, req, text){
      done()
    })
  })

  it('gets src file', function(done){
    assertUrlReturnsFileContents(baseUrl + 'web/hello.js', 'tests/web/hello.js', done)
  })

  it('gets bundled files', function(done){
    assertUrlReturnsFileContents(baseUrl + 'testem/jasmine.js', 'public/testem/jasmine.js', done)
  })

  it('serves custom test page', function(done){
    config.set('test_page', 'web/tests.html')
    assertUrlReturnsFileContents(baseUrl, 'tests/web/tests.html', done)
  })

  it('renders custom test page as template', function(done){
    config.set('test_page', 'web/tests_template.mustache')
    request(baseUrl, function(err, req, text){
      expect(text).to.equal(
        [
        '<!doctype html>'
        , '<html>'
        , '<head>'
        , '        <script src="web/hello.js"></script>'
        , '        <script src="web/hello_tst.js" data-foo="true"  data-bar ></script>'
        , '    </head>'
        ].join('\n'))
      done()
    })
  })

  it('gets a file using a POST request', function(done) {
    request.post(baseUrl + 'web/hello.js', function(err, req, text) {
      expect(text).to.equal(fs.readFileSync('tests/web/hello.js').toString())
      done()
    })
  })

  function assertUrlReturnsFileContents(url, file, done){
    request(url, function(err, req, text){
      expect(text).to.equal(fs.readFileSync(file).toString())
      done()
    })
  }

  it('lists directories', function(done){
      request(baseUrl + 'data', function(err, req, text){
          expect(text).to.match(/<a href=\"blah.txt\">blah.txt<\/a>/)
          done()
      })
  })

  //describe('routes', function(){
  //    beforeEach(function(){
  //        config.set('routes', {
  //            '/index.html': 'web/tests.html'
  //            , '/www': 'web'
  //            , '/': 'web/tests.html'
  //            , '/config.js': path.join(__dirname, '../lib/config.js')
  //        })
  //    })
  //    it('routes file path', function(done){
  //        assertUrlReturnsFileContents(baseUrl + 'index.html', 'web/tests.html', done)
  //    })
  //    it('routes dir path', function(done){
  //        assertUrlReturnsFileContents(baseUrl + 'www/hello.js', 'web/hello.js', done)
  //    })
  //    it('route base path', function(done){
  //        assertUrlReturnsFileContents(baseUrl, 'web/tests.html', done)
  //    })
  //    it('can route files in parent directory', function(done){
  //        assertUrlReturnsFileContents(baseUrl + 'config.js', '../lib/config.js', done)
  //    })
  //})

})
