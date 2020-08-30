import * as ts from 'typescript'
import {translateTsAstToBashAst} from './visitors'
import {write} from './ast/bash-ast'
import {Scope} from './scope'

export function transpile(sourceFile: ts.SourceFile) {
  const {nodes: [bashAst] = [], errors, warnings} = translateTsAstToBashAst({
    tsNodes: [sourceFile],
    scope: new Scope({type: 'FILE', name: sourceFile.fileName}),
  })
  const output = write(bashAst)
  console.log(errors)
  console.log(warnings)
  return output
}

export function transpileCode(code: string, fileName = 'default.ts') {
  const sourceFile: ts.SourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  )
  return transpile(sourceFile)
}
