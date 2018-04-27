import './util/flatmap'
import Ast from 'ts-simple-ast'
import * as path from 'path'
import {print} from './writer/writer'
import {fileVisitor} from './visitors'

export function transpile(file: string) {
  const tsAST = new Ast()
  const sourceDir = path.resolve(__dirname, '..', 'bashscript')
  tsAST.addExistingSourceFiles(`${sourceDir}/example/**/*.ts`)

  const example = tsAST.getSourceFile(file)

  if (!example) {
    return ''
  }

  // ordered statements in the file
  // function call is a statement, function definition is a statement, etc.
  const children = example.getChildren()
  const statements = children.map(fileVisitor).flatten(1)
  return print(statements)
}

console.log(transpile('example.ts'))
