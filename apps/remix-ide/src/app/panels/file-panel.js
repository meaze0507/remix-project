import { ViewPlugin } from '@remixproject/engine-web'

import * as packageJson from '../../../../../package.json'
import React from 'react' // eslint-disable-line
import ReactDOM from 'react-dom'
import { Workspace } from '@remix-ui/workspace' // eslint-disable-line
import { bufferToHex, keccakFromString } from 'ethereumjs-util'
import { checkSpecialChars, checkSlash } from '../../lib/helper'
const { RemixdHandle } = require('../files/remixd-handle.js')
const { GitHandle } = require('../files/git-handle.js')
const { HardhatHandle } = require('../files/hardhat-handle.js')
const globalRegistry = require('../../global/registry')
const examples = require('../editor/examples')
const GistHandler = require('../../lib/gist-handler')
const QueryParams = require('../../lib/query-params')
const modalDialogCustom = require('../ui/modal-dialog-custom')
/*
  Overview of APIs:
   * fileManager: @args fileProviders (browser, shared-folder, swarm, github, etc ...) & config & editor
      - listen on browser & localhost file provider (`fileRenamed` & `fileRemoved`)
      - update the tabs, switchFile
      - trigger `currentFileChanged`
      - set the current file in the config
   * fileProvider: currently browser, swarm, localhost, github, gist
      - link to backend
      - provide properties `type`, `readonly`
      - provide API `resolveDirectory`, `remove`, `exists`, `rename`, `get`, `set`
      - trigger `fileExternallyChanged`, `fileRemoved`, `fileRenamed`, `fileRenamedError`, `fileAdded`
   * file-explorer: treeview @args fileProvider
      - listen on events triggered by fileProvider
      - call fileProvider API
*/

const profile = {
  name: 'filePanel',
  displayName: 'File explorers',
  methods: ['createNewFile', 'uploadFile', 'getCurrentWorkspace', 'getWorkspaces', 'createWorkspace', 'setWorkspace'],
  events: ['setWorkspace', 'renameWorkspace', 'deleteWorkspace', 'createWorkspace'],
  icon: 'assets/img/fileManager.webp',
  description: ' - ',
  kind: 'fileexplorer',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/file_explorer.html',
  version: packageJson.version
}
module.exports = class Filepanel extends ViewPlugin {
  constructor (appManager) {
    super(profile)
    this._components = {}
    this._components.registry = globalRegistry
    this._deps = {
      fileProviders: this._components.registry.get('fileproviders').api,
      fileManager: this._components.registry.get('filemanager').api
    }

    this.el = document.createElement('div')
    this.el.setAttribute('id', 'fileExplorerView')

    this.remixdHandle = new RemixdHandle(this._deps.fileProviders.localhost, appManager)
    this.gitHandle = new GitHandle()
    this.hardhatHandle = new HardhatHandle()
    this.registeredMenuItems = []
    this.request = {}
    this.workspaces = []
    this.initialWorkspace = null
  }

  render () {
    this.initWorkspace().then(() => this.getWorkspaces()).catch(console.error)
    return this.el
  }

  renderComponent () {
    ReactDOM.render(
      <Workspace
        createWorkspace={this.createWorkspace.bind(this)}
        renameWorkspace={this.renameWorkspace.bind(this)}
        setWorkspace={this.setWorkspace.bind(this)}
        workspaceRenamed={this.workspaceRenamed.bind(this)}
        workspaceDeleted={this.workspaceDeleted.bind(this)}
        workspaceCreated={this.workspaceCreated.bind(this)}
        workspace={this._deps.fileProviders.workspace}
        browser={this._deps.fileProviders.browser}
        localhost={this._deps.fileProviders.localhost}
        fileManager={this._deps.fileManager}
        registry={this._components.registry}
        plugin={this}
        request={this.request}
        workspaces={this.workspaces}
        registeredMenuItems={this.registeredMenuItems}
        initialWorkspace={this.initialWorkspace}
      />
      , this.el)
  }

  /**
   * @param item { id: string, name: string, type?: string[], path?: string[], extension?: string[], pattern?: string[] }
   * @param callback (...args) => void
   */
  registerContextMenuItem (item) {
    if (!item) throw new Error('Invalid register context menu argument')
    if (!item.name || !item.id) throw new Error('Item name and id is mandatory')
    if (!item.type && !item.path && !item.extension && !item.pattern) throw new Error('Invalid file matching criteria provided')

    this.registeredMenuItems = [...this.registeredMenuItems, item]
    this.renderComponent()
  }

  async getCurrentWorkspace () {
    return await this.request.getCurrentWorkspace()
  }

  async getWorkspaces () {
    const result = new Promise((resolve, reject) => {
      const workspacesPath = this._deps.fileProviders.workspace.workspacesPath
      this._deps.fileProviders.browser.resolveDirectory('/' + workspacesPath, (error, items) => {
        if (error) {
          console.error(error)
          return reject(error)
        }
        resolve(Object.keys(items)
          .filter((item) => items[item].isDirectory)
          .map((folder) => folder.replace(workspacesPath + '/', '')))
      })
    })
    try {
      this.workspaces = await result
    } catch (e) {
      modalDialogCustom.alert('Workspaces have not been created on your system. Please use "Migrate old filesystem to workspace" on the home page to transfer your files or start by creating a new workspace in the File Explorers.')
      console.log(e)
    }
    this.renderComponent()
    return this.workspaces
  }

  async initWorkspace () {
    this.renderComponent()
    const queryParams = new QueryParams()
    const gistHandler = new GistHandler()
    const params = queryParams.get()
    // get the file from gist
    let loadedFromGist = false
    if (params.gist) {
      await this.processCreateWorkspace('gist-sample')
      this._deps.fileProviders.workspace.setWorkspace('gist-sample')
      this.initialWorkspace = 'gist-sample'
      loadedFromGist = gistHandler.loadFromGist(params, this._deps.fileManager)
    }
    if (loadedFromGist) return

    if (params.code) {
      try {
        await this.processCreateWorkspace('code-sample')
        this._deps.fileProviders.workspace.setWorkspace('code-sample')
        var hash = bufferToHex(keccakFromString(params.code))
        const fileName = 'contract-' + hash.replace('0x', '').substring(0, 10) + '.sol'
        const path = fileName
        await this._deps.fileProviders.workspace.set(path, atob(params.code))
        this.initialWorkspace = 'code-sample'
        await this._deps.fileManager.openFile(fileName)
      } catch (e) {
        console.error(e)
      }
      return
    }
    // insert example contracts if there are no files to show
    return new Promise((resolve, reject) => {
      this._deps.fileProviders.browser.resolveDirectory('/', async (error, filesList) => {
        if (error) return reject(error)
        if (Object.keys(filesList).length === 0) {
          await this.createWorkspace('default_workspace')
          resolve('default_workspace')
        } else {
          this._deps.fileProviders.browser.resolveDirectory('.workspaces', async (error, filesList) => {
            if (error) return reject(error)
            if (Object.keys(filesList).length > 0) {
              const workspacePath = Object.keys(filesList)[0].split('/').filter(val => val)
              const workspaceName = workspacePath[workspacePath.length - 1]

              this._deps.fileProviders.workspace.setWorkspace(workspaceName)
              return resolve(workspaceName)
            }
            return reject(new Error('Can\'t find available workspace.'))
          })
        }
      })
    })
  }

  async createNewFile () {
    return await this.request.createNewFile()
  }

  async uploadFile (event) {
    return await this.request.uploadFile(event)
  }

  async processCreateWorkspace (name) {
    const workspaceProvider = this._deps.fileProviders.workspace
    const browserProvider = this._deps.fileProviders.browser
    const workspacePath = 'browser/' + workspaceProvider.workspacesPath + '/' + name
    const workspaceRootPath = 'browser/' + workspaceProvider.workspacesPath
    const workspaceRootPathExists = await browserProvider.exists(workspaceRootPath)
    const workspacePathExists = await browserProvider.exists(workspacePath)

    if (!workspaceRootPathExists) browserProvider.createDir(workspaceRootPath)
    if (!workspacePathExists) browserProvider.createDir(workspacePath)
  }

  async workspaceExists (name) {
    const workspaceProvider = this._deps.fileProviders.workspace
    const browserProvider = this._deps.fileProviders.browser
    const workspacePath = 'browser/' + workspaceProvider.workspacesPath + '/' + name
    return browserProvider.exists(workspacePath)
  }

  async createWorkspace (workspaceName, setDefaults = true) {
    if (!workspaceName) throw new Error('name cannot be empty')
    if (checkSpecialChars(workspaceName) || checkSlash(workspaceName)) throw new Error('special characters are not allowed')
    if (await this.workspaceExists(workspaceName)) throw new Error('workspace already exists')
    else {
      const workspaceProvider = this._deps.fileProviders.workspace
      await this.processCreateWorkspace(workspaceName)
      workspaceProvider.setWorkspace(workspaceName)
      await this.request.setWorkspace(workspaceName) // tells the react component to switch to that workspace
      if (setDefaults) {
        for (const file in examples) {
          try {
            await workspaceProvider.set(examples[file].name, examples[file].content)
          } catch (error) {
            console.error(error)
          }
        }
      }
    }
  }

  async renameWorkspace (oldName, workspaceName) {
    if (!workspaceName) throw new Error('name cannot be empty')
    if (checkSpecialChars(workspaceName) || checkSlash(workspaceName)) throw new Error('special characters are not allowed')
    if (await this.workspaceExists(workspaceName)) throw new Error('workspace already exists')
    const browserProvider = this._deps.fileProviders.browser
    const workspacesPath = this._deps.fileProviders.workspace.workspacesPath
    browserProvider.rename('browser/' + workspacesPath + '/' + oldName, 'browser/' + workspacesPath + '/' + workspaceName, true)
  }

  /** these are called by the react component, action is already finished whent it's called */
  async setWorkspace (workspace, setEvent = true) {
    if (workspace.isLocalhost) {
      this.call('manager', 'activatePlugin', 'remixd')
    } else if (await this.call('manager', 'isActive', 'remixd')) {
      this.call('manager', 'deactivatePlugin', 'remixd')
    }
    if (setEvent) {
      this._deps.fileManager.setMode(workspace.isLocalhost ? 'localhost' : 'browser')
      this.emit('setWorkspace', workspace)
    }
  }

  workspaceRenamed (workspace) {
    this.emit('renameWorkspace', workspace)
  }

  workspaceDeleted (workspace) {
    this.emit('deleteWorkspace', workspace)
  }

  workspaceCreated (workspace) {
    this.emit('createWorkspace', workspace)
  }
  /** end section */
}
