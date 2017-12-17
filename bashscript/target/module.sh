#!/usr/bin/env bash

declare -a moduleCache=()

module() {
  local path="$1"
  local export="$2"
  shift; shift;
  if [[ "${path:0:2}" == "./" ]]
  then
    local filename="$( cd "${BASH_SOURCE[1]%/*}" && pwd )/${path#\./}"
    local moduleName="_moduleId_${filename//[^a-zA-Z0-9]/_}"
    local moduleId="${!moduleName}"
    if [[ -z "${moduleId}" ]]
    then
      # module not yet loaded
      local moduleId="${#moduleCache[@]}"
      local moduleContents=$(<"${filename}")
      local moduleMemberPrefix="__module__${moduleId}"
      local prefixedModule="${moduleContents//__module__/$moduleMemberPrefix}"
      # declares reference to ID in global scope:
      eval ${moduleName}=${moduleId}
      moduleCache+=($moduleName)
      # execute the module:
      eval "$prefixedModule"
    fi

    # module already loaded, execute
    __module__${moduleId}.${export} "$@"
  else
    echo "Module must be relative, provided: ${path}"
    exit 1
  fi
}
