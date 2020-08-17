import {transpile} from '../../transpile'
import {makeTestFile} from '../../util/test-util'

describe('transpile', () => {
  describe('string literal', () => {
    test('simple', () => {
      // language=TypeScript
      const file = makeTestFile(`
  const test = "hello";
      `)

      expect(transpile(file)).toMatchInlineSnapshot(`
        "declare test='hello'
        "
      `)
    })

    test('multiline and containing characters', () => {
      // language=TypeScript
      const file = makeTestFile(`
  const test = "hello\\nworld!\\n\\nHe said: 'There are four lights!'";
      `)

      expect(transpile(file)).toMatchInlineSnapshot(`
        "declare test='hello
        world!

        He said: '\\\\'There are four lights!'\\\\''
        "
      `)
    })
  })

  describe('functions', () => {
    test('calling', () => {
      // language=TypeScript
      const file = makeTestFile(`
concat('hi', 'ho');
      `)

      expect(transpile(file)).toMatchInlineSnapshot(`
        "concat 'hi' 'ho'
        "
      `)
    })

    test('calling and assigning', () => {
      // language=TypeScript
      const file = makeTestFile(`
const value = concat('hi', 'ho');
      `)

      expect(transpile(file)).toMatchInlineSnapshot(`
        "declare value=$(concat 'hi' 'ho'
        )

        "
      `)
    })
  })
})
