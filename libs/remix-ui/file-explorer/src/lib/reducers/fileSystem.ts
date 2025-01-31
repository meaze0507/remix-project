import * as _ from 'lodash'
import { extractNameFromKey } from '../utils'
interface Action {
    type: string;
    payload: Record<string, any>;
}

export const fileSystemInitialState = {
  files: {
    files: [],
    expandPath: [],
    blankPath: null,
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  provider: {
    provider: null,
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  notification: {
    title: null,
    message: null,
    actionOk: () => {},
    actionCancel: () => {},
    labelOk: null,
    labelCancel: null
  }
}

export const fileSystemReducer = (state = fileSystemInitialState, action: Action) => {
  switch (action.type) {
    case 'FETCH_DIRECTORY_REQUEST': {
      return {
        ...state,
        files: {
          ...state.files,
          isRequesting: true,
          isSuccessful: false,
          error: null
        }
      }
    }
    case 'FETCH_DIRECTORY_SUCCESS': {
      return {
        ...state,
        files: {
          ...state.files,
          files: action.payload.files,
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FETCH_DIRECTORY_ERROR': {
      return {
        ...state,
        files: {
          ...state.files,
          isRequesting: false,
          isSuccessful: false,
          error: action.payload
        }
      }
    }
    case 'RESOLVE_DIRECTORY_REQUEST': {
      return {
        ...state,
        files: {
          ...state.files,
          isRequesting: true,
          isSuccessful: false,
          error: null
        }
      }
    }
    case 'RESOLVE_DIRECTORY_SUCCESS': {
      return {
        ...state,
        files: {
          ...state.files,
          files: resolveDirectory(state.provider.provider, action.payload.path, state.files.files, action.payload.files),
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'RESOLVE_DIRECTORY_ERROR': {
      return {
        ...state,
        files: {
          ...state.files,
          isRequesting: false,
          isSuccessful: false,
          error: action.payload
        }
      }
    }
    case 'FETCH_PROVIDER_REQUEST': {
      return {
        ...state,
        provider: {
          ...state.provider,
          isRequesting: true,
          isSuccessful: false,
          error: null
        }
      }
    }
    case 'FETCH_PROVIDER_SUCCESS': {
      return {
        ...state,
        provider: {
          ...state.provider,
          provider: action.payload,
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FETCH_PROVIDER_ERROR': {
      return {
        ...state,
        provider: {
          ...state.provider,
          isRequesting: false,
          isSuccessful: false,
          error: action.payload
        }
      }
    }
    case 'ADD_INPUT_FIELD': {
      return {
        ...state,
        files: {
          ...state.files,
          files: addInputField(state.provider.provider, action.payload.path, state.files.files, action.payload.files),
          blankPath: action.payload.path,
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'REMOVE_INPUT_FIELD': {
      return {
        ...state,
        files: {
          ...state.files,
          files: removeInputField(state.provider.provider, state.files.blankPath, state.files.files),
          blankPath: null,
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FILE_ADDED': {
      return {
        ...state,
        files: {
          ...state.files,
          files: fileAdded(state.provider.provider, action.payload.path, state.files.files, action.payload.files),
          expandPath: [...new Set([...state.files.expandPath, action.payload.path])],
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FOLDER_ADDED': {
      return {
        ...state,
        files: {
          ...state.files,
          files: folderAdded(state.provider.provider, action.payload.path, state.files.files, action.payload.files),
          expandPath: [...new Set([...state.files.expandPath, action.payload.path])],
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FILE_REMOVED': {
      return {
        ...state,
        files: {
          ...state.files,
          files: fileRemoved(state.provider.provider, action.payload.path, action.payload.removePath, state.files.files),
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'FILE_RENAMED': {
      return {
        ...state,
        files: {
          ...state.files,
          files: fileRenamed(state.provider.provider, action.payload.path, action.payload.removePath, state.files.files, action.payload.files),
          isRequesting: false,
          isSuccessful: true,
          error: null
        }
      }
    }
    case 'DISPLAY_NOTIFICATION': {
      return {
        ...state,
        notification: {
          title: action.payload.title,
          message: action.payload.message,
          actionOk: action.payload.actionOk || fileSystemInitialState.notification.actionOk,
          actionCancel: action.payload.actionCancel || fileSystemInitialState.notification.actionCancel,
          labelOk: action.payload.labelOk,
          labelCancel: action.payload.labelCancel
        }
      }
    }
    case 'HIDE_NOTIFICATION': {
      return {
        ...state,
        notification: fileSystemInitialState.notification
      }
    }
    default:
      throw new Error()
  }
}

const resolveDirectory = (provider, path: string, files, content) => {
  const root = provider.workspace || provider.type

  if (path === root) return { [root]: { ...content[root], ...files[root] } }
  const pathArr: string[] = path.split('/').filter(value => value)

  if (pathArr[0] !== root) pathArr.unshift(root)
  const _path = pathArr.map((key, index) => index > 1 ? ['child', key] : key).reduce((acc: string[], cur) => {
    return Array.isArray(cur) ? [...acc, ...cur] : [...acc, cur]
  }, [])

  const prevFiles = _.get(files, _path)

  files = _.set(files, _path, {
    isDirectory: true,
    path,
    name: extractNameFromKey(path).indexOf('gist-') === 0 ? extractNameFromKey(path).split('-')[1] : extractNameFromKey(path),
    type: extractNameFromKey(path).indexOf('gist-') === 0 ? 'gist' : 'folder',
    child: { ...content[pathArr[pathArr.length - 1]], ...(prevFiles ? prevFiles.child : {}) }
  })

  return files
}

const removePath = (root, path: string, pathName, files) => {
  const pathArr: string[] = path.split('/').filter(value => value)

  if (pathArr[0] !== root) pathArr.unshift(root)
  const _path = pathArr.map((key, index) => index > 1 ? ['child', key] : key).reduce((acc: string[], cur) => {
    return Array.isArray(cur) ? [...acc, ...cur] : [...acc, cur]
  }, [])
  const prevFiles = _.get(files, _path)

  prevFiles && prevFiles.child && prevFiles.child[pathName] && delete prevFiles.child[pathName]
  files = _.set(files, _path, {
    isDirectory: true,
    path,
    name: extractNameFromKey(path).indexOf('gist-') === 0 ? extractNameFromKey(path).split('-')[1] : extractNameFromKey(path),
    type: extractNameFromKey(path).indexOf('gist-') === 0 ? 'gist' : 'folder',
    child: prevFiles ? prevFiles.child : {}
  })

  return files
}

const addInputField = (provider, path: string, files, content) => {
  const root = provider.workspace || provider.type || ''

  if (path === root) return { [root]: { ...content[root], ...files[root] } }
  const result = resolveDirectory(provider, path, files, content)

  return result
}

const removeInputField = (provider, path: string, files) => {
  const root = provider.workspace || provider.type || ''

  if (path === root) {
    delete files[root][path + '/' + 'blank']
    return files
  }
  return removePath(root, path, path + '/' + 'blank', files)
}

const fileAdded = (provider, path: string, files, content) => {
  return resolveDirectory(provider, path, files, content)
}

const folderAdded = (provider, path: string, files, content) => {
  return resolveDirectory(provider, path, files, content)
}

const fileRemoved = (provider, path: string, removedPath: string, files) => {
  const root = provider.workspace || provider.type || ''

  if (path === root) {
    delete files[root][removedPath]

    return files
  }
  return removePath(root, path, extractNameFromKey(removedPath), files)
}

const fileRenamed = (provider, path: string, removePath: string, files, content) => {
  const root = provider.workspace || provider.type || ''

  if (path === root) {
    const allFiles = { [root]: { ...content[root], ...files[root] } }

    delete allFiles[root][extractNameFromKey(removePath) || removePath]
    return allFiles
  }
  const pathArr: string[] = path.split('/').filter(value => value)

  if (pathArr[0] !== root) pathArr.unshift(root)
  const _path = pathArr.map((key, index) => index > 1 ? ['child', key] : key).reduce((acc: string[], cur) => {
    return Array.isArray(cur) ? [...acc, ...cur] : [...acc, cur]
  }, [])
  const prevFiles = _.get(files, _path)

  delete prevFiles.child[extractNameFromKey(removePath)]
  files = _.set(files, _path, {
    isDirectory: true,
    path,
    name: extractNameFromKey(path).indexOf('gist-') === 0 ? extractNameFromKey(path).split('-')[1] : extractNameFromKey(path),
    type: extractNameFromKey(path).indexOf('gist-') === 0 ? 'gist' : 'folder',
    child: { ...content[pathArr[pathArr.length - 1]], ...prevFiles.child }
  })

  return files
}
