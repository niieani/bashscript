import './util/flatmap'
import Ast from 'ts-simple-ast'
import * as path from 'path'
import {transpile} from './transpile'
import {SourceFile} from 'ts-simple-ast'

export const getFile = (file: string) => {
  const tsAST = new Ast()
  const sourceDir = path.resolve(__dirname, '..', 'fixtures')
  tsAST.addExistingSourceFiles(`${sourceDir}/example/**/*.ts`)
  return tsAST.getSourceFile(file)
}

