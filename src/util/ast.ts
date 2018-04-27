import * as AST from 'ts-simple-ast'
import * as acorn from 'acorn'
import {comment} from '../writer/syntax/comment'

export const getCommentObjects = (node: AST.Node) =>
  getComments(node).map((text) => comment(text, false))

export const getComments = ({compilerNode}: AST.Node) => {
  const commentPart = compilerNode
    .getFullText()
    .slice(0, compilerNode.getLeadingTriviaWidth())
  const comments: Array<acorn.Comment> = []
  acorn.parse(commentPart, {
    ranges: false,
    onComment: comments,
    allowHashBang: true,
  })
  return comments.map((comment) => `${comment.value.split('\n').join('\n#')}`)
}
