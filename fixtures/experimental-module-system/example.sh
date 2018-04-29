#!/usr/bin/env bash

SCRIPT_DIR=${BASH_SOURCE[0]%/*}
# shellcheck source=module.sh
source "${SCRIPT_DIR}/module.sh"

# import {greet} from './module-test'
# greet() ==>
module greeter greet tterranigma
module greeter greet niieani
# greet('niieani') ==>
# module ./greet util abc
