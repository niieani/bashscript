import './index.css'
import {transpileCode} from '../src/transpile'

export const transpileText = (text: string) => {
  try {
    return transpileCode(text)
  } catch {
    return undefined
  }
}
