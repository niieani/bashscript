# JavaScript to Bash

function calls can be calls to bash functions
e.g.

```
# IN
echo('hi')
# => OUT
echo hi
```

if the call is used in the position of parameter or assignment:
e.g.

```
# IN
const out = concat('hi', 'ho')
# => OUT
declare out = $(concat 'hi' 'ho')
```

## functions:

IN
```js
function concat(a, b) {
  return `${a}${b}`
}
```
=> OUT
```bash
function concat {
  local a="${1}"
  local b="${2}"
  echo "${a}${b}"
}
```

## lambdas:

IN

```js
const concat = (a) => {
  const c = `${a}-super`
  return (b) => {
    return `${c}${b}`
  }
}
const withOne = concat('one')
const result = withOne('two')
```

=> OUT
```bash
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
  )
  echo "$(declare -p declaration)"
}

# all functions are top level
function __lambda_concat_1 {
  # scoped variables:
  eval "${1}"; shift;
  # actual function body:
  local b="${1}"
  echo "${c}${b}"
}

function __callVar {
  # TODO: add check if var is a declaration
  eval "${!1}"; shift;
  if [[ "${declaration[1]}" == "function" ]]
  then
    "${declaration[1]}" "${declaration[2]}" "$@"
  fi
}

declare withOne="$(concat 'one')"
declare result="$(__callVar withOne 'two')"
```


```js
const a = 'abc'
const b = a.toLowercase()
```
=> OUT
```bash
declare a='abc'
declare b="$(__callProperty a toLowercase)"
```

IN
```js
const a = 'abc' + 'xyz'
```
=> OUT
```bash
declare a="$(__operator_addition 'abc' 'zyx')"
```

IN
```js
const arr = ['abc']
arr.push('xyz')
```

=> OUT
```bash
declare arr=('abc')
__callProperty arr push 'xyz'
```

OUT helper
```bash
# e.g.
__callProperty() {
  if isArray arr
  then
    if property === 'push'
    then
      arr+=("${arr[@]}")
    fi
  fi
}
```

IN
```js
const arr = [1, 2, 3]
const result = arr
  .map(num => num + 1)
  .map(num => num - 1)
```

=> OUT
```bash
declare declaration=(1 2 3)
declare arr="$(declare -p declaration)"
unset declaration

__lamda_arr_map_anon_1() {
  # scoped variables (if any):
  eval "${1}"; shift;
  # actual function body:
  local num="${1}"
  echo "$(__operator_addition num 1)"
}
__lamda_arr_map_anon_2() {
  # scoped variables (if any):
  eval "${1}"; shift;
  # actual function body:
  local num="${1}"
  echo "$(__operator_substraction num 1)"
}

declare _result1="$(__callProperty arr map __lamda_arr_map_anon_1)"
declare result="$(__callProperty _result1 map __lamda_arr_map_anon_2)"
unset _result1
```
