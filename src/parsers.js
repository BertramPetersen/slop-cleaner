import ts from "typescript";
import Parser from "tree-sitter";
import fsharpLanguages from "tree-sitter-fsharp";

const fsharpParser = new Parser();
fsharpParser.setLanguage(fsharpLanguages.fsharp);

export const parserByExtension = new Map([
  [".ts", extractTypeScriptComments],
  [".tsx", extractTypeScriptComments],
  [".fs", extractFSharpComments],
  [".fsi", extractFSharpComments],
  [".fsx", extractFSharpComments]
]);

export function extractComments(file, source) {
  const parser = parserByExtension.get(file.slice(file.lastIndexOf(".")).toLowerCase());
  return parser ? groupAdjacentComments(source, parser(source, file)) : [];
}

function groupAdjacentComments(source, comments) {
  const located = [];
  let searchFrom = 0;
  for (const comment of comments) {
    const start = source.indexOf(comment.raw, searchFrom);
    if (start < 0) return comments;
    located.push({ ...comment, startOffset: start, endOffset: start + comment.raw.length });
    searchFrom = start + comment.raw.length;
  }
  const groups = [];
  for (const comment of located) {
    const previous = groups.at(-1);
    const adjacent = previous && comment.start_line === previous.end_line + 1;
    const standalone = isStandalone(source, comment);
    if (!adjacent || !standalone || !previous.standalone) {
      groups.push({ ...comment, standalone });
      continue;
    }
    previous.raw = source.slice(previous.startOffset, comment.endOffset);
    previous.text = `${previous.text}\n${comment.text}`;
    previous.end_line = comment.end_line;
    previous.end_column = comment.end_column;
    previous.endOffset = comment.endOffset;
  }
  return groups.map(({ standalone, ...comment }) => comment);
}

function isStandalone(source, comment) {
  const lineStart = source.lastIndexOf("\n", comment.startOffset - 1) + 1;
  const lineEnd = source.indexOf("\n", comment.endOffset);
  return /^\s*$/.test(source.slice(lineStart, comment.startOffset)) && /^\s*$/.test(source.slice(comment.endOffset, lineEnd < 0 ? source.length : lineEnd));
}

function extractTypeScriptComments(source, file) {
  const scriptKind = file.toLowerCase().endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const ranges = new Map();
  const comments = [];
  function visit(node) {
    for (const range of [...(ts.getLeadingCommentRanges(source, node.pos) ?? []), ...(ts.getTrailingCommentRanges(source, node.end) ?? [])]) ranges.set(range.pos, range);
    node.forEachChild(visit);
  }
  visit(sourceFile);
  for (const range of [...ranges.values()].sort((a, b) => a.pos - b.pos)) comments.push(commentRecord(source, range.pos, range.end, source.slice(range.pos, range.end)));
  return comments;
}

function extractFSharpComments(source) {
  const tree = fsharpParser.parse(source);
  const comments = [];
  const cursor = tree.walk();
  function visit() {
    if (cursor.nodeType === "line_comment" || cursor.nodeType === "block_comment" || cursor.nodeType === "xml_doc") {
      const raw = source.slice(cursor.startIndex, cursor.endIndex);
      comments.push({
        ...positionRecord(cursor.startPosition, cursor.endPosition),
        text: raw.replace(/^\/\/\//, "").replace(/^\/\//, "").replace(/^\(\*/, "").replace(/\*\)$/, "").trim(),
        raw
      });
    }
    if (cursor.gotoFirstChild()) {
      do visit(); while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }
  visit();
  return comments;
}

function commentRecord(source, start, end, raw) {
  const startPosition = positionAt(source, start);
  const endPosition = positionAt(source, end);
  return {
    ...positionRecord(startPosition, endPosition),
    text: raw.replace(/^\/\//, "").replace(/^\/\*/, "").replace(/\*\/$/, "").trim(),
    raw
  };
}

function positionRecord(start, end) {
  return {
    start_line: start.row + 1,
    end_line: end.row + 1,
    start_column: start.column + 1,
    end_column: end.column + 1
  };
}

function positionAt(source, offset) {
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length - 1, column: offset - lineStart };
}
