'use strict'
import { TraceAnalyser } from './traceAnalyser'
import { TraceCache } from './traceCache'
import { TraceStepManager } from './traceStepManager'
import { isCreateInstruction } from './traceHelper'
import { util } from '@remix-project/remix-lib'

export class TraceManager {
  web3
  fork: string
  isLoading: boolean
  trace
  traceCache
  traceAnalyser
  traceStepManager
  tx

  constructor (options) {
    this.web3 = options.web3
    this.fork = options.fork
    this.isLoading = false
    this.trace = null
    this.traceCache = new TraceCache()
    this.traceAnalyser = new TraceAnalyser(this.traceCache)
    this.traceStepManager = new TraceStepManager(this.traceAnalyser)
  }

  // init section
  async resolveTrace (tx) {
    this.tx = tx
    this.init()
    if (!this.web3) throw new Error('web3 not loaded')
    this.isLoading = true
    try {
      const result = await this.getTrace(tx.hash)

      if (result['structLogs'].length > 0) {
        this.trace = result['structLogs']

        this.traceAnalyser.analyse(result['structLogs'], tx)
        this.isLoading = false
        return true
      }
      var mes = tx.hash + ' is not a contract invocation or contract creation.'
      console.log(mes)
      this.isLoading = false
      throw new Error(mes)
    } catch (error) {
      console.log(error)
      this.isLoading = false
      throw new Error(error)
    }
  }

  getTrace (txHash) {
    return new Promise((resolve, reject) => {
      const options = {
        disableStorage: true,
        disableMemory: false,
        disableStack: false,
        fullStorage: false
      }
      this.web3.debug.traceTransaction(txHash, options, function (error, result) {
        if (error) return reject(error)
        resolve(result)
      })
    })
  }

  init () {
    this.trace = null
    this.traceCache.init()
  }

  getCurrentFork () {
    return this.fork
  }

  // API section
  inRange (step) {
    return this.isLoaded() && step >= 0 && step < this.trace.length
  }

  isLoaded () {
    return !this.isLoading && this.trace !== null
  }

  getLength (callback) {
    if (!this.trace) {
      callback(new Error('no trace available'), null)
    } else {
      callback(null, this.trace.length)
    }
  }

  accumulateStorageChanges (index, address, storageOrigin) {
    return this.traceCache.accumulateStorageChanges(index, address, storageOrigin)
  }

  getAddresses () {
    return this.traceCache.addresses
  }

  getCallDataAt (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    const callDataChange = util.findLowerBoundValue(stepIndex, this.traceCache.callDataChanges)
    if (callDataChange === null) {
      throw new Error('no calldata found')
    }
    return [this.traceCache.callsData[callDataChange]]
  }

  async buildCallPath (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    const callsPath = util.buildCallPath(stepIndex, this.traceCache.callsTree.call)
    if (callsPath === null) throw new Error('no call path built')
    return callsPath
  }

  getCallStackAt (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    const call = util.findCall(stepIndex, this.traceCache.callsTree.call)
    if (call === null) {
      throw new Error('no callstack found')
    }
    return call.callStack
  }

  getStackAt (stepIndex) {
    this.checkRequestedStep(stepIndex)
    if (this.trace[stepIndex] && this.trace[stepIndex].stack) { // there's always a stack
      const stack = this.trace[stepIndex].stack.slice(0)
      stack.reverse()
      return stack
    } else {
      throw new Error('no stack found')
    }
  }

  getLastCallChangeSince (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }

    const callChange = util.findCall(stepIndex, this.traceCache.callsTree.call)
    if (callChange === null) {
      return 0
    }
    return callChange
  }

  getCurrentCalledAddressAt (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
      const resp = this.getLastCallChangeSince(stepIndex)
      if (!resp) {
        throw new Error('unable to get current called address. ' + stepIndex + ' does not match with a CALL')
      }
      return resp.address
    } catch (error) {
      throw new Error(error)
    }
  }

  getContractCreationCode (token) {
    if (!this.traceCache.contractCreation[token]) {
      throw new Error('no contract creation named ' + token)
    }
    return this.traceCache.contractCreation[token]
  }

  getMemoryAt (stepIndex) {
    this.checkRequestedStep(stepIndex)
    const lastChanges = util.findLowerBoundValue(stepIndex, this.traceCache.memoryChanges)
    if (lastChanges === null) {
      throw new Error('no memory found')
    }
    return this.trace[lastChanges].memory
  }

  getCurrentPC (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    return this.trace[stepIndex].pc
  }

  getReturnValue (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    if (!this.traceCache.returnValues[stepIndex]) {
      throw new Error('current step is not a return step')
    }
    return this.traceCache.returnValues[stepIndex]
  }

  getCurrentStep (stepIndex) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    return this.traceCache.steps[stepIndex]
  }

  getMemExpand (stepIndex) {
    return (this.getStepProperty(stepIndex, 'memexpand') || '')
  }

  getStepCost (stepIndex) {
    return this.getStepProperty(stepIndex, 'gasCost')
  }

  getRemainingGas (stepIndex) {
    return this.getStepProperty(stepIndex, 'gas')
  }

  getStepProperty (stepIndex, property) {
    try {
      this.checkRequestedStep(stepIndex)
    } catch (check) {
      throw new Error(check)
    }
    return this.trace[stepIndex][property]
  }

  isCreationStep (stepIndex) {
    return isCreateInstruction(this.trace[stepIndex])
  }

  // step section
  findStepOverBack (currentStep) {
    return this.traceStepManager.findStepOverBack(currentStep)
  }

  findStepOverForward (currentStep) {
    return this.traceStepManager.findStepOverForward(currentStep)
  }

  findNextCall (currentStep) {
    return this.traceStepManager.findNextCall(currentStep)
  }

  findStepOut (currentStep) {
    return this.traceStepManager.findStepOut(currentStep)
  }

  checkRequestedStep (stepIndex) {
    if (!this.trace) {
      throw new Error('trace not loaded')
    } else if (stepIndex >= this.trace.length) {
      throw new Error('trace smaller than requested')
    }
  }

  waterfall (calls, stepindex, cb) {
    const ret = []
    let retError = null
    for (var call in calls) {
      calls[call].apply(this, [stepindex, function (error, result) {
        retError = error
        ret.push({ error: error, value: result })
      }])
    }
    cb(retError, ret)
  }
}
