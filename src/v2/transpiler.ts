import * as ts from 'typescript'
import {SyntaxKind} from 'typescript'
import {readFileSync} from 'fs'
import path from 'path'
import {tsNodeToBashNode} from './visitors'
import {write} from '../ast/bash-ast'

export function printAstTree(sourceFile: ts.SourceFile) {
  printAstNode('', sourceFile)

  function printAstNode(space: string, node: ts.Node) {
    console.log(
      `${space}(${space.length}) ${SyntaxKind[node.kind]} ${node.getText()}`,
    )

    node.getChildren().map((child) => {
      const sp = `${space}-`
      printAstNode(sp, child)
    })
  }
}

export function transpile(sourceFile: ts.SourceFile) {
  // const symbols = new Set()
  const [bashAst] = tsNodeToBashNode(sourceFile)
  const output = write(bashAst)
  console.log(output)
}

function transpileFile(
  filePath: string = path.resolve('fixtures/example/example.ts'),
) {
  const code = readFileSync(filePath).toString()
  const fileName = path.basename(filePath)
  const sourceFile: ts.SourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  )
  printAstTree(sourceFile)
  transpile(sourceFile)
}

transpileFile()
