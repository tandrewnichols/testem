var TapReporter = require('../../lib/ci/test_reporters/tap_reporter')
var DotReporter = require('../../lib/ci/test_reporters/dot_reporter')
var XUnitReporter = require('../../lib/ci/test_reporters/xunit_reporter')
var PassThrough = require('stream').PassThrough
var XmlDom = require('xmldom')
var assert = require('chai').assert

describe('test reporters', function(){

  describe('tap reporter', function(){
    it('writes out TAP', function(){
      var stream = new PassThrough()
      var reporter = new TapReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'it does stuff',
        passed: true,
        logs: []
      })
      reporter.report('phantomjs', {
        name: 'it fails',
        passed: false,
        error: { message: 'it crapped out' },
        logs: ["I am a log", "Useful information"]
      })
      reporter.finish()
      assert.deepEqual(stream.read().toString().split('\n'), [
        'ok 1 phantomjs - it does stuff',
        'not ok 2 phantomjs - it fails',
        '    ---',
        '        message: >',
        '            it crapped out',
        '        Log: |',
        '            I am a log',
        '            Useful information',
        '    ...',
        '',
        '1..2',
        '# tests 2',
        '# pass  1',
        '# fail  1',
        ''
      ])
    })
  })

  describe('dot reporter', function(){
    context('without errors', function(){
      it('writes out summary', function(){
        var stream = new PassThrough()
        var reporter = new DotReporter(false, stream)
        reporter.report('phantomjs', {
          name: 'it does stuff',
          passed: true,
          logs: []
        })
        reporter.finish()
        var output = stream.read().toString()
        assert.match(output, /  \./)
        assert.match(output, /1 tests complete \([0-9]+ ms\)/)
      })
    })

    context('with errors', function(){
      it('writes out summary with failure info', function(){
        var stream = new PassThrough()
        var reporter = new DotReporter(false, stream)
        reporter.report('phantomjs', {
          name: 'it fails',
          passed: false,
          error: {
            actual: 'Seven',
            expected: 7,
            message: 'This should be a number',
            stack: 'trace'
          }
        })
        reporter.finish()
        var output = stream.read().toString().split('\n')

        output.shift()
        assert.match(output.shift(), /  F/)
        output.shift()
        assert.match(output.shift(), /  1 tests complete \(\d+ ms\)/)
        output.shift()
        assert.match(output.shift(), /  1\) \[phantomjs\] it fails/)
        assert.match(output.shift(), /     This should be a number/)
        output.shift()
        assert.match(output.shift(), /     expected: 7/)
        assert.match(output.shift(), /       actual: 'Seven'/)
        output.shift()
        assert.match(output.shift(), /     trace/)
        assert.equal(output, '')
      })
    })
  })

  describe('xunit reporter', function(){
    it('writes out and XML escapes results', function(){
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'it does <cool> \"cool\" \'cool\' stuff',
        passed: true
      })
      reporter.finish()
      var output = stream.read().toString()
      assert.match(output, /<testsuite name="Testem Tests" tests="1" failures="0" timestamp="(.+)" time="(\d+(\.\d+)?)">/)
      assert.match(output, /<testcase classname="phantomjs" name="it does &lt;cool> &quot;cool&quot; \'cool\' stuff"/)

      assertXmlIsValid(output)
    })

    it('uses stdout to print intermediate test results when intermediate output is enabled', function() {
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream, true)
      var displayed = false
      var write = process.stdout.write
      process.stdout.write = function(string, encoding, fd) {
        write.apply(process.stdout, [string, encoding, fd])
        displayed = true
      }
      reporter.report('phantomjs', {
        name: 'it does stuff',
        passed: true,
        logs: []
      })
      assert(displayed)
      process.stdout.write = write
    })

    it('does not print intermediate test results when intermediate output is disabled', function() {
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream, false)
      var displayed = false
      var write = process.stdout.write
      process.stdout.write = function(string, encoding, fd) {
        write.apply(process.stdout, [string, encoding, fd])
        displayed = true
      }
      reporter.report('phantomjs', {
        name: 'it does stuff',
        passed: true,
        logs: []
      })
      assert(!displayed)
      process.stdout.write = write
    })

    it('outputs errors', function(){
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'it didnt work',
        passed: false,
        error: {
          message: (new Error('it crapped out')).stack
        }
      })
      reporter.finish()
      var output = stream.read().toString()
      assert.match(output, /it didnt work"/)
      assert.match(output, /it crapped out/)

      assertXmlIsValid(output)
    })

    it('XML escapes errors', function(){
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'it failed with quotes',
        passed: false,
        error: {
          message: (new Error('<it> \"crapped\" out')).stack
        }
      })
      reporter.finish()
      var output = stream.read().toString()
      assert.match(output, /it failed with quotes"/)
      assert.match(output, /&lt;it> &quot;crapped&quot; out/)

      assertXmlIsValid(output)
    })

    it('XML escapes messages', function(){
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'it failed with ampersands',
        passed: false,
        error: { message: "&&" }
      })
      reporter.finish()
      var output = stream.read().toString()
      assert.match(output, /it failed with ampersands"/)
      assert.match(output, /&amp;&amp;/)

      assertXmlIsValid(output)
    })

    it('presents valid XML with null messages', function(){
      var stream = new PassThrough()
      var reporter = new XUnitReporter(false, stream)
      reporter.report('phantomjs', {
        name: 'null',
        passed: false,
        error: { message: null }
      })
      reporter.finish()
      var output = stream.read().toString()

      assertXmlIsValid(output)
    })
  })

var assertXmlIsValid = function(xmlString) {
  var failure = null;
  var parser = new XmlDom.DOMParser({
    errorHandler:{
      locator:{},
      warning: function(txt) { failure = txt; },
      error: function(txt) { failure = txt; },
      fatalError: function(txt) { failure = txt; }
    }
  })

  // this will throw into failure variable with invalid xml
  parser.parseFromString(xmlString,'text/xml')

  if (failure)
  {
    assert(false, failure+'\n---\n'+xmlString+'\n---\n')
  }
}

})
