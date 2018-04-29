import {SourceFile} from 'ts-simple-ast'
import {fileVisitor} from './visitors'
import {print} from './writer/writer'

export function transpile(source : SourceFile | undefined) {
  if (!source) {
    return ''
  }
  // ordered statements in the file
  // function call is a statement, function definition is a statement, etc.
  const children = source.getChildren()
  const statements = children.map(fileVisitor).flatten(1)
  return print(statements)
}