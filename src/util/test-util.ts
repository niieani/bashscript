import {Project} from 'ts-morph'
import {SourceFile} from 'ts-morph'

export const makeTestFile = (fileContents: string) => {
  const project = new Project({
    useVirtualFileSystem: true,
    addFilesFromTsConfig: false,
    compilerOptions: {
      strict: true,
      noLib: true,
    },
  })
  return project.createSourceFile('main.ts', fileContents)
}
