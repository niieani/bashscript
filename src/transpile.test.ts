import {transpileCode} from './transpile'

describe('transpile', () => {
  test('a larger program', () => {
    // language=TypeScript
    const code = `
import {write} from './util'

write('hello')

const x = 123;

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
  function nestedOne() {
    echo('hello')
  }
}
    `

    expect(transpileCode(code)).toMatchInlineSnapshot(`
      "@fromModule ./util write hello
      declare -i x=123
      function lol {
        echo x
        echo hmm
      }
      function nestedFunctions {
        echo hi
        declare -a __declaration=(function nestedFunctions.nestedOne)
      }
      function nestedFunctions.nestedOne {
        echo hello
      }"
    `)
  })
})
