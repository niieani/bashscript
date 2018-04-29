// import * as Monaco from 'monaco-editor'
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'

const monacoElement = document.getElementById('left')!
let monaco : Monaco.editor.IStandaloneCodeEditor

export const initLeft = (initialValue: string | undefined, updateLeft: (untranspiled: string) => void) => {
  if (monaco) {
    if (initialValue) monaco.getModel().setValue(initialValue)
    return monaco
  }

  monaco = Monaco.editor.create(monacoElement, {
    value: initialValue || '',
    language: "typescript",
    minimap: {enabled: false},
    formatOnType: true,
    // lineNumbers: "off",
    // roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    theme: "vs-dark",
  })

  window.addEventListener('resize', () => {
    monaco.layout()
  })

  const monacoModel = monaco.getModel()

  monacoModel.onDidChangeContent(() => {
    updateLeft(
      monacoModel.getValue()
    )
  })

  return monaco
}
