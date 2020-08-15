import {Project} from 'ts-morph'
import * as path from 'path'

export const getFile = (file: string) => {
  const tsAST = new Project()
  const sourceDir = path.resolve(__dirname, '..', 'fixtures')
  tsAST.addDirectoryAtPath(`${sourceDir}/example`, {recursive: true})
  return tsAST.getSourceFile(file)
}
