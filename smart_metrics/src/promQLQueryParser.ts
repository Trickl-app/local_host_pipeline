import { parser } from "@prometheus-io/lezer-promql";

// parser.parse() returns a Tree. The root is accessed via tree.topNode,
// which is a SyntaxNode. Every SyntaxNode has:
//
//   node.type.name   — string name of the grammar rule, e.g. "VectorSelector",
//                      "Identifier", "LabelName", "LabelMatchers"
//   node.from        — start offset (inclusive) into the source string
//   node.to          — end offset (exclusive) into the source string
//   node.parent      — the parent SyntaxNode, or null at the root
//   node.firstChild  — first child SyntaxNode, or null if this is a leaf
//   node.nextSibling — the next sibling SyntaxNode, or null if last child
//
// Children are ordered left-to-right and together span node.from..node.to.
// The tree is a CST (concrete syntax tree), so every token in the source
// has a corresponding leaf node.



// Returns true if the tree contains any error nodes, meaning the input had
// syntax the parser could not understand. Results from walk() may still be
// partially populated — the parser recovers what it can.
const hasErrors = (node: any) => {
  if (node.type.isError) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (hasErrors(child)) return true;
  }
  return false;
}

export const parsePromqlExpression = (expr: string) => {
  const tree = parser.parse(expr);
  const metrics: Set<string> = new Set();
  const labels: string[] = [];

  const walk = (node: any, source: any) => {
    // node.type.name is the grammar rule name for this node.
    const type = node.type.name;

    // Handle unquoted metric names at the VectorSelector level so that dotted
    // names like http.requests.total are captured whole. The parser splits them
    // into multiple Identifier + error nodes, so checking a single Identifier
    // child would only yield "http". Instead, when the first child is an
    // Identifier (meaning there is an unquoted metric name), slice the source
    // from the selector start to where LabelMatchers begins (or the node end).
    if (type === "VectorSelector" && node.firstChild?.type.name === "Identifier") {
      let end = node.to;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.type.name === "LabelMatchers") { end = child.from; break; }
      }
      metrics.add(expr.slice(node.from, end));
    }

    // Prometheus 3.0+ allows metric names with special characters (e.g. dots)
    // by quoting them as the first element in a label matcher set:
    //   {"http.requests.total", method="GET"}
    // The parser represents this as a QuotedLabelName directly inside
    // LabelMatchers (as opposed to inside a UnquotedLabelMatcher/QuotedLabelMatcher,
    // which is where quoted label keys live). Strip the surrounding quotes to get
    // the raw metric name.
    if (type === "QuotedLabelName" && node.parent?.type.name === "LabelMatchers") {
      const raw = source.slice(node.from, node.to);
      metrics.add(raw.slice(1, -1));
    }

    // Label keys (the left-hand side of a matcher like method="GET") are
    // LabelName nodes. They appear both inside LabelMatchers ({...}) and
    // inside GroupingLabels (the label list after "by" / "without").
    if (type === "LabelName") {
      labels.push(source.slice(node.from, node.to));
    }

    // Label keys with special characters (e.g. dots) are quoted and parsed as
    // QuotedLabelName inside a QuotedLabelMatcher, e.g. "scope.name"="value".
    if (type === "QuotedLabelName" && node.parent?.type.name === "QuotedLabelMatcher") {
      const raw = source.slice(node.from, node.to);
      labels.push(raw.slice(1, -1));
    }

    // Recurse depth-first through the tree. The loop walks across siblings
    // via nextSibling, and the recursive call descends into each child's
    // subtree before moving to the next sibling.
    for (let child = node.firstChild; child; child = child.nextSibling) {
      walk(child, source);
    }
    
  }

  walk(tree.topNode, expr);
  return { metrics, labels }
}