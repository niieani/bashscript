import './index.css'
import {makeTestFile} from '../src/util/test-util'
import {transpile} from '../src/transpile'

export const transpileText = (text: string) => {
  const file = makeTestFile(text)
  try {
    return transpile(file)
  } catch {
    return undefined
  }
}
