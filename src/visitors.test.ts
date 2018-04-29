import {transpile} from './transpile'
import {makeTestFile} from './util/test-util'

describe('visitors', () => {
  test('variableStatementVisitor', () => {
    const file = makeTestFile(`
      const a = 123
    `)
    expect(transpile(file)).toMatchSnapshot()
  })

  test('importDeclarationVisitor', () => {
    const file = makeTestFile(`
      const a = 123
    `)
    console.log(transpile(file))
  })
})
