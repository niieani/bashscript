import path from 'path'
import {readFileSync} from 'fs'
import {transpileCode} from './transpile'

export function transpileFile(
  filePath: string = path.resolve('fixtures/example/example.ts'),
) {
  const code = readFileSync(filePath).toString()
  const fileName = path.basename(filePath)
  return transpileCode(code, fileName)
}
