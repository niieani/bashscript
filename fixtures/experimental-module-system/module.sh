#!/usr/bin/env bash

declare -a __moduleCache=()

module() {
  local path="${1}"
  local export="${2}"
  shift; shift;
  local filename
  if [[ "${path:0:2}" == "./" ]]
  then
    filename="$( cd "${BASH_SOURCE[1]%/*}" && pwd )/${path#\./}"
  else
    # for absolute path we assume it's relative to "SCRIPT_DIR"
    filename="${SCRIPT_DIR}/${path}"
  fi
  load "${filename}.sh" "${export}" "$@"
}

load() {
  local filename="${1}"
  local export="${2}"
  shift; shift;
  local moduleName="_moduleId_${filename//[^a-zA-Z0-9]/_}"
  local moduleId="${!moduleName}"
  if [[ -z "${moduleId}" ]]
  then
    # module not yet loaded
    local moduleId="${#__moduleCache[@]}"
    local moduleContents
    moduleContents=$(<"${filename}")
    local moduleMemberPrefix="__module__${moduleId}"
    local prefixedModule="${moduleContents//__module__/$moduleMemberPrefix}"
    # declares reference to ID in global scope:
    eval ${moduleName}=${moduleId}
    __moduleCache+=($moduleName)
    # execute the module:
    eval "$prefixedModule"
  fi

  # module already loaded, execute
  __module__${moduleId}.${export} "$@"
}
