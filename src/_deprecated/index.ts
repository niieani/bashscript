import {VisitorReturn} from '../visitors'

export interface PrinterState {
  statements: Array<string>
}

export type Printer = (state: PrinterState) => string

export const empty = {statementsRoot: [], statements: []}

export const getReduceVisitorReturns = (startWith: VisitorReturn = []) => (
  list: VisitorReturn,
) => list.concat(startWith)

export const reduceVisitorReturns = getReduceVisitorReturns()
