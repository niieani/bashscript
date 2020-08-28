#!/usr/bin/env bash

# const concat = (a) => {
#   const c = `${a}-super`
#   return (b) => {
#     return `${c}${b}`
#   }
# }
# const withOne = concat('one')
# const result = withOne('two')

function concat {
  # params:
  local a="${1}"
  # function body:
  local c="${a}-super"
  # preapplied function:
  # lambda declaration is:
  # [type, name, scoped_declarations_to_eval]
  local -a declaration=(
    function
    __lambda_concat_1
    "$(declare -p c)"
    # repeat ^ for each variable that is accessed in the body
  )
  declare -p declaration
}

# all functions are top level
function __lambda_concat_1 {
  # scoped variables (repeat for each):
  eval "${1}"; shift;
  # actual function body:
  local b="${1}"
  echo "${c}${b}"
}

function __callVar {
  # TODO: add check if var is a declaration
  # evaluate contents of the variable
  eval "${!1}"; shift;
  if [[ "${declaration[0]}" == "function" ]]
  then
    "${declaration[1]}" "${declaration[2]}" "$@"
  fi
}

declare withOne="$(concat 'one')"
declare result="$(__callVar withOne 'two')"

echo "${result}"