import {Project} from 'ts-morph'

export const makeTestFile = (fileContents: string) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    addFilesFromTsConfig: false,
    compilerOptions: {
      strict: true,
      noLib: true,
    },
  })
  return project.createSourceFile('main.ts', fileContents)
}
