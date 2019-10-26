import {SourceFile} from 'ts-morph'
import {fileVisitor} from './visitors'
import {print} from './writer/writer'

export function transpile(source: SourceFile | undefined) {
  if (!source) {
    return ''
  }
  // ordered statements in the file
  // function call is a statement, function definition is a statement, etc.
  const children = source.getChildren()
  const statements = children.map(fileVisitor).flat(1)
  return print(statements)
}
