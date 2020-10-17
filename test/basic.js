/* eslint-disable no-unused-expressions */
/* eslint-disable no-undef */
const chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
var expect = chai.expect

const HyPNS = require('../src')
const once = require('events.once') // polyfill for nodejs events.once in the browser

const helper = require('./lib')

const mockPublicKey =
  'dee2fc9db57f409cfa5edea42aa40790f3c1b314e3630a04f25b75ad42b71835'
const mockPrivateKey =
  '1e9813baf16eb415a61a56693b037d5aec294279b35a814aff239a0c61f71d3bdee2fc9db57f409cfa5edea42aa40790f3c1b314e3630a04f25b75ad42b71835'
const mockKeypair = {
  publicKey: mockPublicKey,
  secretKey: mockPrivateKey
}
const mockObjPub = {
  text: 'Some test data to publish ' + new Date().toISOString(),
  type: 'chat-message',
  nickname: 'cat-lover'
}
const mockObjPub2 = {
  text: 'Some other test data to publish ' + new Date().toISOString(),
  type: 'chat-message',
  nickname: 'cat-lover'
}

process.on('warning', (warning) => {
  // console.warn(warning.name);    // Print the warning name
  // console.warn(warning.message); // Print the warning message
  // console.warn(warning.stack) // Print the stack trace
})

describe('Persist: false', async function () {
  var myNode = new HyPNS({ persist: false }) // pass in optional Corestore and networker
  var peerNode = new HyPNS({ persist: false }) // pass in optional Corestore and networker

  var instance
  var secondInstance
  var readerOnly
  before(async function () {
    // runs once before the first test in this block
    instance = await myNode.open({ keypair: mockKeypair })
    secondInstance = await peerNode.open({ keypair: { publicKey: instance.publicKey } })
    readerOnly = await myNode.open({ keypair: { publicKey: mockPublicKey } })
  })

  afterEach(function () {
    // runs after each test in this block
    // console.log('myNode corestore contents',myNode.store.list())
    // console.log('myNode', myNode.store)
  })

  after(function (done) {
    // runs once after the last test in this block
    this.timeout(30000) // takes time to close all the connections
    myNode
      .close()
      .catch((err) => console.error(err))
      .then(() => {
        this.timeout(30000) // takes time to close all the connections
        peerNode
          .close()
          .catch((err) => console.error(err))
          .then(done())
      })
  })
  describe('Writer', async function () {
    it('should create a HyPNS instance', async function () {
      expect(instance.publicKey).to.equal(mockPublicKey)
    })

    it('should start with empty latest value', function (done) {
      instance
        .readLatest()
        .catch((err) => console.error(err))
        .then((val) => {
          expect(val).to.equal(null)
          done()
        })
    })

    it('should be writeEnabled', function () {
      expect(instance.writeEnabled()).to.be.true
    })

    it('should publish and emit the same', async function () {
      const retVal = instance.publish(mockObjPub)
      expect(retVal.text).to.equal(mockObjPub.text)

      const [val] = await once(instance.beacon, 'update')
      expect(val.text).to.equal(mockObjPub.text)
      expect(val).to.have.property('signature')
    })

    it('should publish a second value and emit the same local and remote', async function () {
      const retVal = instance.publish(mockObjPub2)
      const [val] = await once(instance.beacon, 'update')
      const [val2] = await once(secondInstance.beacon, 'update')
      expect(retVal.text).to.equal(mockObjPub2.text)
      expect(val.text).to.equal(mockObjPub2.text)
      expect(val2.text).to.equal(mockObjPub2.text)
    })

    it('should ignore entries without a timestamp', function (done) {
      expect(instance.core.feeds().length).to.equal(1)
      // saved from another library to this publicKey
      helper.anotherWriter(instance.core, async () => {
        expect(instance.core.feeds().length).to.equal(2)
        var totalEntries = 0
        instance.core.feeds().forEach((f) => {
          totalEntries += f.length
        })
        expect(totalEntries).to.equal(3)

        instance
          .readLatest()
          .catch((err) => console.error(err))
          .then((val) => {
            expect(val).to.equal(mockObjPub2.text)
            done()
          })
      })
    })
  })

  describe('Reader', async function () {
    it('should be read only if only passed Public key and no private key', async function () {
      expect(readerOnly.writeEnabled()).to.be.false
      // need to wait until peers are confirmed as conencted before read
      this.timeout(1000)
      try {
        var val = await readerOnly.readLatest()
        expect(val).to.equal(mockObjPub2.text)
      } catch (error) {
        (error) => console.error(error)
      }
    })

    it('should ignore readonly publish command', function () {
      expect(readerOnly.publish({ text: 'foo' })).to.equal(null)
    })
  })

  it('should create new key if no public key is passed', async function () {
    const keyGen = await myNode.open()
    // console.log('keyGen', keyGen.store)

    expect(keyGen).to.have.property('publicKey')
  })

  it('should not be writeEnabled if bad secret key is passed', async function () {
    var badSecretKey = await myNode.open({
      keypair: { publicKey: mockPublicKey, secretKey: 'foo' }
    })
    // console.log('badSecretKey', badSecretKey.store)

    expect(badSecretKey.writeEnabled()).to.be.false
  })
})

describe('Persist:true', function () {
  var persistNode = new HyPNS({ persist: false }) // pass in optional Corestore and networker
  var persistH
  before(async function () {
    // runs once before the first test in this block
    persistH = await persistNode.open({ keypair: mockKeypair })
    // console.log('persistH', persistH.store)
  })

  after(function (done) {
    // runs once after the last test in this block
    this.timeout(30000) // takes time to close all the connections
    persistNode
      .close()
      .catch((err) => console.error(err))
      .then(done)
  })

  it('should persist on disk', async function () {
    const mockOb = { text: 'saved data ' + new Date().toISOString() }
    persistH.publish(mockOb)
    this.timeout(5000)
    const [val] = await once(persistH.beacon, 'update')
    expect(val.text).to.equal(mockOb.text)
  })
})
// process.exit(1);
