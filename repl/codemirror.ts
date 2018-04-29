// only Codemirror supports bash syntax:
import * as Codemirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/mode/shell/shell'

const codemirrorElement = document.getElementById('right')!
export let codemirror: Codemirror.Editor | undefined = undefined

export const initRight = (replValue: string | undefined) => {
  if (codemirror) {
    if (replValue != null) codemirror.setValue(replValue)
    return codemirror
  }
  return codemirror = Codemirror(codemirrorElement, {
    value: replValue,
    mode: 'shell',
    readOnly: true,
  })
}
