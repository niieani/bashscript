#!/usr/bin/env bash

# const outerObject = {a: 'boom'}
# const outerHello = 'hello from outer space!'

# const obj = {
#   a: {
#     aa: 123,
#     bbb: {c: ['inner1', 'inner2', 'inner3']}
#   },
#   b: 'hello',
#   c: outerObject,
#   d: outerHello,
# }

declare -A outerObject=(
  [__type]=object

  [a]="boom"
)

declare outerHello='hello from outer space!'

declare -a __obj_a_bbb_c=(inner1 inner2 inner3)
declare -A __obj_a_bbb=([ref_c]=__obj_a_bbb_c [__type]=object)
declare -A __obj_a=([aa]=123 [ref_bbb]="__obj_a_bbb" [__type]=object)
declare -A obj=(
  [__type]=object

  [ref_a]="__obj_a"
  [b]="hello"
  [ref_c]="outerObject"
  # we need the TypeScript type to tell whether this is a reference or a plain object
  [d]="${outerHello}"
)

# perhaps instead of using the ref_ prefix, we should use an uncommon prefix in the value
# that way we can reuse it for other reference-related functionality

@objectProperty() {
  local objName="$1"
  local property="$2"
  shift
  shift
  local refName="${objName}[\"ref_${property}\"]"
  local typeName="${objName}[\"__type\"]"
  # we need to check type, because bash will return the value of first property if it doesn't exist on the object 🤦
  if [[ -v "${refName}" && "${!typeName}" == 'object' ]]; then
    local value="${!refName}"
    if [[ "${#}" -gt 0 ]]; then
      @objectProperty "${value}" "$@"
      return
    fi
    echo "__ref:${value}"
  else
    refName="${objName}[${property}]"
    if [[ -v "${refName}" ]]; then
      if [[ "${#}" -gt 0 ]]; then
        echo "Error: Cannot read property '${1}' of a non-object '${property}'."
        return
      fi
      echo "${!refName}"
    else
      echo "Error: Cannot read property '${property}' of '${objName}'."
    fi
  fi
}

@objectProperty obj a aa
@objectProperty obj a bbb c 2

# errors:
@objectProperty obj a aa asd
@objectProperty obj a bbb c 5

# how do we return objects from functions?
# we can print declaration, but what about all the things it refers to?
# we would need to traverse object for all references (deep) and output all declarations (serialized)