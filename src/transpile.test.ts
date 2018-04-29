import {transpile} from './transpile'
import {makeTestFile} from './util/test-util'

describe('transpile', () => {
  test('a larger program', () => {
    // language=TypeScript
    const file = makeTestFile(`
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
    `)

    expect(
      transpile(file)
    ).toMatchSnapshot()
  })
})
