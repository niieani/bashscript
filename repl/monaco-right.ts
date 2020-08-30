// import * as Monaco from 'monaco-editor'
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'

const monacoElement = document.getElementById('right')!
let monaco: Monaco.editor.IStandaloneCodeEditor

export const initRight = (initialValue: string | undefined) => {
  if (monaco) {
    if (initialValue) monaco.getModel()!.setValue(initialValue)
    return monaco
  }

  monaco = Monaco.editor.create(monacoElement, {
    value: initialValue || '',
    language: 'shell',
    minimap: {enabled: false},
    formatOnType: true,
    // lineNumbers: "off",
    // roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: true,
    theme: 'vs-dark',
  })

  window.addEventListener('resize', () => {
    monaco.layout()
  })

  return monaco
}
