import {write} from './util'

write('hello')

// this won't work yet:
const x = 123

// I'm a comment
/* I'm a multiline comment
   ...indeed... */
function lol(one: string, two: number) {
  // lol
  echo('x')
  // after
  echo('hmm')
}

function nestedFunctions() {
  echo('hi')
  let x = 1
  function nestedOne() {
    echo('hello', x)
  }
}
