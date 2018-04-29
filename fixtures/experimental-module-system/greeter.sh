#!/usr/bin/env bash

# this variable is local to this module:
__module__invocationCount=0

# function is "exported" as a part of this module
__module__.greet() {
  __module__invocationCount=$((__module__invocationCount+1))
  echo Greetings "$@" "(invocation ${__module__invocationCount})"
}
