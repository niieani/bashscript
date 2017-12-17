#!/usr/bin/env bash

__module__variable=123

__module__.util() {
  __module__variable=$((__module__variable+1))
  echo hi ${__module__variable} "$@"
}

__module__.util2() {
  echo util2
}
