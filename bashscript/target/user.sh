#!/usr/bin/env bash

SCRIPT_DIR=${BASH_SOURCE[0]%/*}
source "${SCRIPT_DIR}/module.sh"

# import {util} from './module-test'
# util() ==>
module ./module-test.sh util
# util('abc') ==>
module ./module-test.sh util abc
