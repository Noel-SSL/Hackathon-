import { Link } from "react-router-dom";

import { safeUrl } from "../lib/api";
import styles from "./Markdown.module.css";

// A small renderer for the chatbot's replies. chat.py asks Gemini for short
// markdown: paragraphs, bullet lists, **bold**, [links](url) and the
// occasional comparison table. Nothing is ever inserted as raw HTML.

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text, internalLinks) {
  const nodes = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const [whole, bold, label, url] = match;

    if (bold) {
      nodes.push(<strong key={match.index}>{bold}</strong>);
    } else if (internalLinks[url]) {
      // A keyboard the site lists: open its page here instead of the shop.
      nodes.push(
        <Link key={match.index} to={internalLinks[url]}>
          {label}
        </Link>,
      );
    } else if (safeUrl(url)) {
      nodes.push(
        <a key={match.index} href={safeUrl(url)} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    } else {
      nodes.push(label);
    }
    cursor = match.index + whole.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function tableCells(line) {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isTableRow = (line) => line.trim().startsWith("|");
const isListItem = (line) => /^\s*([-*]|\d+\.)\s+/.test(line);

// Groups consecutive lines into paragraph, list and table blocks.
function toBlocks(source) {
  const blocks = [];

  for (const line of source.split("\n")) {
    if (!line.trim()) {
      blocks.push(null);
      continue;
    }

    const type = isTableRow(line) ? "table" : isListItem(line) ? "list" : "paragraph";
    const last = blocks[blocks.length - 1];

    if (last && last.type === type) last.lines.push(line);
    else blocks.push({ type, lines: [line] });
  }

  return blocks.filter(Boolean);
}

export default function Markdown({ text, internalLinks = {} }) {
  const inline = (value) => renderInline(value, internalLinks);

  return (
    <div className={styles.markdown}>
      {toBlocks(text).map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.lines.map((line, item) => (
                <li key={item}>{inline(line.replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "table") {
          // The second line of a markdown table is the |---|---| divider.
          const [head, , ...rows] = block.lines;
          return (
            <div key={index} className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    {tableCells(head).map((cell, column) => (
                      <th key={column}>{inline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {tableCells(row).map((cell, column) => (
                        <td key={column}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={index}>{inline(block.lines.join(" "))}</p>;
      })}
    </div>
  );
}
