import {print} from './writer'
import {declareFunction, declareVariable} from './syntax/parts'
import {TERMINATOR} from './syntax/terminator'
import {comment} from './syntax/comment'
import {statement} from './statement'
import {ensureASTObject} from './context-util'
import {reduceAST} from './reducers'
import {raw} from './syntax/raw'

// comment helper:
// _COMMENT_=
// echo ${_COMMENT_# here is your comment}

describe('writer', () => {
  test('comment', () => {
    expect(print([comment('testing')])).toMatchSnapshot()
  })

  test('terminator', () => {
    expect(print([TERMINATOR])).toMatchSnapshot()
  })

  test('declaration', () => {
    expect(print([declareVariable('hello', raw('test'))])).toMatchSnapshot()
  })

  test('statement', () => {
    expect(print(statement`echo test`)).toMatchSnapshot()
  })

  test('statement with raw', () => {
    expect(print(statement`echo ${raw('raw test')}`)).toMatchSnapshot()
  })

  test('scope is populated by variables', () => {
    expect(
      print([
        declareVariable('example'),
        ({example}) => statement`echo ${example}`,
      ]),
    ).toMatchSnapshot()
  })

  test('conflicting variable names are renamed', () => {
    expect(
      print([
        declareVariable('example'),
        ({example}) => statement`echo ${example}`,
        declareVariable('example'),
        ({example}) => statement`echo ${example}`, // will be example_1
      ]),
    ).toMatchSnapshot()
  })

  test('function declaration', () => {
    expect(
      print([
        declareFunction({
          name: 'example',
          body: statement`echo "this is awesome"`,
        }),
      ]),
    ).toMatchSnapshot()
  })

  test('access the AST type of declared function', () => {
    expect(
      print([
        declareFunction({
          name: 'setMood',
          body: [
            declareVariable('mood', raw('$1')),
            comment('this will be a recursive call'),
            ({setMood}) =>
              statement`${setMood} "awesome, because it's a ${
                setMood && setMood.type
              }"`,
          ],
        }),
      ]),
    ).toMatchSnapshot()
  })
})

describe('ast', () => {
  test('comment', () => {
    expect(reduceAST([comment('testing')])).toMatchSnapshot()
  })

  describe('ensureASTObject', () => {
    test('[] => group', () => {
      expect(ensureASTObject([])).toHaveProperty('type', 'group')
    })
    test('[text] => group with one raw node', () => {
      const result = ensureASTObject(['text'])
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(1)
      expect(result.data.children[0]).toHaveProperty('type', 'raw')
    })
    test('text => one raw node', () => {
      const result = ensureASTObject('text')
      expect(result).toHaveProperty('type', 'raw')
      expect(result.data).toHaveProperty('text')
      expect(result.data.text).toBe('text')
    })
    test('() => [text] => group with one raw node', () => {
      const result = ensureASTObject(() => ['text'])
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(1)
      expect(result.data.children[0]).toHaveProperty('type', 'raw')
    })
    test('() => text => one raw node', () => {
      const result = ensureASTObject(() => 'text')
      expect(result).toHaveProperty('type', 'raw')
      expect(result.data).toHaveProperty('text')
      expect(result.data.text).toBe('text')
    })
    test('() => statement => 2 nodes', () => {
      const result = ensureASTObject(() => statement`text`)
      expect(result).toHaveProperty('type', 'group')
      expect(result.data).toHaveProperty('children')
      expect(result.data.children).toHaveLength(3)
    })
  })
})
