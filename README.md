# BashScript

A JavaScript/TypeScript to `bash` transpiler. **Work in progress.**

Why? Mainly because I wanted to learn how to make a transpiler.

I also wanted to experiment with `bash` and how far we could stretch
this old, yet widely cross-platform language.

I've previously created a framework trying to make `bash` as usable as possible:
[Bash Infinity](https://github.com/niieani/bash-oo-framework).
This seemed like the natural next step.

Also, because... why not? 🤓

## REPL

Not much works, but it's cool. :-)

Find it here: **[REPL](https://niieani.github.io/bashscript/)**.

## Specification (WIP)

### Function invocation

Function calls are transpilled as calls to bash functions/commands
e.g.

#### input

```typescript
echo('hi')
```

#### output

```bash
echo hi
```

if the call is used in the position of parameter or assignment:
e.g.

#### input

```typescript
const out = concat('hi', 'ho')
```

#### output

```bash
declare out=$(concat 'hi' 'ho')
```

### Function declaration

#### input

```typescript
function concat(a, b) {
  return `${a}${b}`
}
```

#### output

```bash
function concat {
  local a="${1}"
  local b="${2}"
  echo "${a}${b}"
}
```

### Invoking properties

#### input

```typescript
const a = 'abc'
const b = a.toLowercase()
```

#### output

```bash
declare a='abc'
declare b="$(__callProperty a toLowercase)"
```

### Invoking properties with parameters

#### input

```js
const arr = ['abc']
arr.push('xyz')
```

#### output

```bash
declare arr=('abc')
__callProperty arr push 'xyz'
```

### Operators

#### input

```typescript
const a = 'abc' + 'xyz'
```

#### output

```bash
declare a="$(__operator_addition 'abc' 'zyx')"
```

#### output helpers
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

### Lambda functions

#### input

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

#### output

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

### Lambdas with scoped variables

#### input

```typescript
const arr = [1, 2, 3]
const result = arr
  .map(num => num + 1)
  .map(num => num - 1)
```

#### output

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


### Objects and other literals

#### input

```typescript
const outerObject = {a: 'boom'}
const outerHello = 'hello from outer space!'
const obj = {
  a: {
    aa: 123,
    bbb: {c: ['inner1', 'inner2', 'inner3']}
  },
  b: 'hello',
  c: outerObject,
  d: outerHello,
}

echo(obj.a.aa)
```

#### output

```shell script
#!/usr/bin/env bash
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
```