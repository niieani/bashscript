import Ast from 'ts-simple-ast'
import {SourceFile} from 'ts-simple-ast'

export const makeTestFile = (fileContents : string) => {
  const project = new Ast({
    useVirtualFileSystem: true,
    addFilesFromTsConfig: false,
    compilerOptions: {
      strict: true,
      noLib: true,
    },
  })
  return project.createSourceFile('main.ts', fileContents)
}
