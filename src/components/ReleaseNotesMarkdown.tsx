import { Fragment, type ReactNode } from "react";
import { GITHUB_RAW_MAIN_URL, GITHUB_RELEASES_URL } from "../../shared/releases";

interface ReleaseNotesMarkdownProps {
  markdown: string;
}

const GITHUB_REPOSITORY_URL = GITHUB_RELEASES_URL.replace(/\/releases$/, "");

const normalizeRelativePath = (path: string) => path.trim().replace(/^\.?\//, "").replace(/^\/+/, "");

const getSafeMarkdownUrl = (candidate: string, kind: "image" | "link") => {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  if (kind === "link" && trimmed.startsWith("#")) {
    return trimmed;
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const relativePath = normalizeRelativePath(trimmed);
    if (!relativePath) {
      return undefined;
    }

    return kind === "image"
      ? new URL(relativePath, GITHUB_RAW_MAIN_URL).toString()
      : `${GITHUB_REPOSITORY_URL}/blob/main/${relativePath}`;
  }

  try {
    const url = new URL(trimmed);
    if (kind === "image") {
      return url.protocol === "https:" ? url.toString() : undefined;
    }

    return url.protocol === "https:" || url.protocol === "mailto:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const INLINE_PATTERN =
  /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

const parseInline = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    if (match[1] !== undefined) {
      const src = getSafeMarkdownUrl(match[2] ?? "", "image");
      nodes.push(
        src ? (
          <img
            key={`image-${index}`}
            className="release-notes-image"
            src={src}
            alt={match[1]}
            loading="lazy"
            decoding="async"
          />
        ) : (
          match[1]
        )
      );
    } else if (match[3] !== undefined) {
      const href = getSafeMarkdownUrl(match[4] ?? "", "link");
      nodes.push(
        href ? (
          <a key={`link-${index}`} href={href} target="_blank" rel="noreferrer">
            {match[3]}
          </a>
        ) : (
          match[3]
        )
      );
    } else if (match[5] !== undefined) {
      nodes.push(<code key={`code-${index}`}>{match[5]}</code>);
    } else {
      const strongText = match[6] ?? match[7];
      const emphasisText = match[8] ?? match[9];
      nodes.push(
        strongText !== undefined ? (
          <strong key={`strong-${index}`}>{strongText}</strong>
        ) : (
          <em key={`em-${index}`}>{emphasisText}</em>
        )
      );
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

export const ReleaseNotesMarkdown = ({ markdown }: ReleaseNotesMarkdownProps) => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "ol" | "ul" | undefined;
  let codeLines: string[] | undefined;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const text = paragraphLines.join(" ").trim();
    if (text) {
      blocks.push(<p key={`paragraph-${blocks.length}`}>{parseInline(text)}</p>);
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      return;
    }

    const items = listItems.map((item, index) => <li key={`${listType}-${blocks.length}-${index}`}>{parseInline(item)}</li>);
    blocks.push(
      listType === "ol" ? (
        <ol key={`ordered-${blocks.length}`}>{items}</ol>
      ) : (
        <ul key={`unordered-${blocks.length}`}>{items}</ul>
      )
    );
    listItems = [];
    listType = undefined;
  };

  const flushCode = () => {
    if (!codeLines) {
      return;
    }

    blocks.push(
      <pre key={`code-block-${blocks.length}`}>
        <code className={codeLanguage ? `language-${codeLanguage}` : undefined}>{codeLines.join("\n")}</code>
      </pre>
    );
    codeLines = undefined;
    codeLanguage = "";
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      if (codeLines) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        codeLines = [];
        codeLanguage = fenceMatch[1] ?? "";
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 4);
      const Heading = `h${level}` as keyof JSX.IntrinsicElements;
      blocks.push(<Heading key={`heading-${blocks.length}`}>{parseInline(headingMatch[2].trim())}</Heading>);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`rule-${blocks.length}`} />);
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const nextType = orderedMatch ? "ol" : "ul";
      if (listType && listType !== nextType) {
        flushList();
      }
      listType = nextType;
      listItems.push((orderedMatch?.[1] ?? unorderedMatch?.[1] ?? "").trim());
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(<blockquote key={`quote-${blocks.length}`}>{parseInline(quoteMatch[1].trim())}</blockquote>);
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();

  return <div className="release-notes-markdown">{blocks.length > 0 ? blocks : <Fragment />}</div>;
};
