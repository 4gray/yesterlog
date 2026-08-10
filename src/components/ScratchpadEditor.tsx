import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND
} from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode
} from "@lexical/rich-text";
import { mergeRegister } from "@lexical/utils";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Strikethrough,
  Underline
} from "lucide-react";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type EditorState,
  type LexicalEditor,
  type TextFormatType
} from "lexical";
import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode
} from "react";

export interface ScratchpadEditorValue {
  text: string;
  editorState: string;
  plainText: string;
}

interface ScratchpadEditorProps {
  initialText: string;
  initialEditorState?: string;
  onChange: (value: ScratchpadEditorValue) => void;
  onPlainTextChange?: (plainText: string) => void;
  onBlur: () => void;
  onError?: (message: string) => void;
}

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "number";

interface ToolbarState {
  block: BlockType;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
}

const EMPTY_TOOLBAR_STATE: ToolbarState = {
  block: "paragraph",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  code: false
};

const editorTheme = {
  paragraph: "notes-rich-paragraph",
  heading: {
    h1: "notes-rich-heading notes-rich-heading-h1",
    h2: "notes-rich-heading notes-rich-heading-h2",
    h3: "notes-rich-heading notes-rich-heading-h3"
  },
  quote: "notes-rich-quote",
  code: "notes-rich-code-block",
  link: "notes-rich-link",
  list: {
    ul: "notes-rich-list notes-rich-list-ul",
    ol: "notes-rich-list notes-rich-list-ol",
    listitem: "notes-rich-list-item",
    nested: {
      listitem: "notes-rich-list-item-nested"
    }
  },
  text: {
    bold: "notes-rich-bold",
    italic: "notes-rich-italic",
    underline: "notes-rich-underline",
    strikethrough: "notes-rich-strikethrough",
    underlineStrikethrough: "notes-rich-underline-strikethrough",
    code: "notes-rich-inline-code",
    highlight: "notes-rich-highlight"
  }
};

const isSerializedEditorState = (value: string | undefined) => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as {
      root?: { type?: unknown; children?: unknown };
    };
    return parsed.root?.type === "root" && Array.isArray(parsed.root.children);
  } catch {
    return false;
  }
};

const getBlockType = (): BlockType => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "paragraph";

  const anchorNode = selection.anchor.getNode();
  const element =
    anchorNode.getKey() === "root"
      ? anchorNode
      : anchorNode.getTopLevelElementOrThrow();

  if ($isListNode(element)) {
    return element.getListType() === "number" ? "number" : "bullet";
  }
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    return tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph";
  }
  if ($isQuoteNode(element)) return "paragraph";
  return "paragraph";
};

const readToolbarState = (): ToolbarState => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return EMPTY_TOOLBAR_STATE;
  return {
    block: getBlockType(),
    bold: selection.hasFormat("bold"),
    italic: selection.hasFormat("italic"),
    underline: selection.hasFormat("underline"),
    strikethrough: selection.hasFormat("strikethrough"),
    code: selection.hasFormat("code")
  };
};

const ToolbarButton = ({
  active = false,
  label,
  shortcut,
  children,
  onClick
}: {
  active?: boolean;
  label: string;
  shortcut?: string;
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={active ? "is-active" : ""}
    aria-label={label}
    aria-pressed={active}
    title={shortcut ? `${label} · ${shortcut}` : label}
    onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

const ScratchpadToolbar = () => {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState(EMPTY_TOOLBAR_STATE);

  const updateToolbar = useCallback(() => {
    setState(readToolbarState());
  }, []);

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => {
          editorState.read(updateToolbar);
        }),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            updateToolbar();
            return false;
          },
          COMMAND_PRIORITY_LOW
        )
      ),
    [editor, updateToolbar]
  );

  const formatBlock = (block: BlockType) => {
    if (block === "bullet" || block === "number") {
      const isCurrent = state.block === block;
      editor.dispatchCommand(
        isCurrent
          ? REMOVE_LIST_COMMAND
          : block === "bullet"
            ? INSERT_UNORDERED_LIST_COMMAND
            : INSERT_ORDERED_LIST_COMMAND,
        undefined
      );
      return;
    }

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        block === "paragraph" ? $createParagraphNode() : $createHeadingNode(block)
      );
    });
  };

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  return (
    <div className="notes-rich-toolbar" role="toolbar" aria-label="Scratchpad formatting">
      <div className="notes-rich-toolbar-group" aria-label="Block style">
        <ToolbarButton
          active={state.block === "paragraph"}
          label="Paragraph"
          onClick={() => formatBlock("paragraph")}
        >
          <Pilcrow size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={state.block === "h1"}
          label="Heading 1"
          shortcut="# + Space"
          onClick={() => formatBlock("h1")}
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={state.block === "h2"}
          label="Heading 2"
          shortcut="## + Space"
          onClick={() => formatBlock("h2")}
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={state.block === "h3"}
          label="Heading 3"
          shortcut="### + Space"
          onClick={() => formatBlock("h3")}
        >
          <Heading3 size={15} />
        </ToolbarButton>
      </div>
      <i aria-hidden="true" />
      <div className="notes-rich-toolbar-group" aria-label="Text style">
        <ToolbarButton
          active={state.bold}
          label="Bold"
          shortcut="Ctrl/⌘B"
          onClick={() => formatText("bold")}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={state.italic}
          label="Italic"
          shortcut="Ctrl/⌘I"
          onClick={() => formatText("italic")}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={state.underline}
          label="Underline"
          shortcut="Ctrl/⌘U"
          onClick={() => formatText("underline")}
        >
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={state.strikethrough}
          label="Strikethrough"
          shortcut="~~text~~"
          onClick={() => formatText("strikethrough")}
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={state.code}
          label="Inline code"
          shortcut="`text`"
          onClick={() => formatText("code")}
        >
          <Code2 size={14} />
        </ToolbarButton>
      </div>
      <i aria-hidden="true" />
      <div className="notes-rich-toolbar-group" aria-label="Lists">
        <ToolbarButton
          active={state.block === "bullet"}
          label="Bulleted list"
          shortcut="* + Space"
          onClick={() => formatBlock("bullet")}
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          active={state.block === "number"}
          label="Numbered list"
          shortcut="1. + Space"
          onClick={() => formatBlock("number")}
        >
          <ListOrdered size={15} />
        </ToolbarButton>
      </div>
      <span className="notes-rich-toolbar-hint">Markdown shortcuts work as you type</span>
    </div>
  );
};

const serializeEditor = (editorState: EditorState): ScratchpadEditorValue =>
  editorState.read(() => ({
    text: $convertToMarkdownString(TRANSFORMERS),
    editorState: JSON.stringify(editorState.toJSON()),
    plainText: $getRoot().getTextContent()
  }));

const ScratchpadChangePlugin = ({
  onChange
}: {
  onChange: ScratchpadEditorProps["onChange"];
}) => (
  <OnChangePlugin
    ignoreSelectionChange
    onChange={(editorState) => {
      onChange(serializeEditor(editorState));
    }}
  />
);

const ScratchpadInitialTextPlugin = ({
  onPlainTextChange
}: {
  onPlainTextChange?: ScratchpadEditorProps["onPlainTextChange"];
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onPlainTextChange) return;
    onPlainTextChange(
      editor.getEditorState().read(() => $getRoot().getTextContent())
    );
  }, [editor, onPlainTextChange]);

  return null;
};

export const ScratchpadEditor = ({
  initialText,
  initialEditorState,
  onChange,
  onPlainTextChange,
  onBlur,
  onError
}: ScratchpadEditorProps) => {
  const [initialConfig] = useState(() => ({
    namespace: "YesterlogScratchpad",
    theme: editorTheme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
    editorState: isSerializedEditorState(initialEditorState)
      ? initialEditorState
      : () => $convertFromMarkdownString(initialText, TRANSFORMERS),
    onError: (error: Error) => {
      onError?.(error.message);
    }
  }));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ScratchpadToolbar />
      <div className="notes-rich-editor">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="notes-rich-content"
              aria-label="General notes scratchpad"
              aria-placeholder="Start anywhere…"
              placeholder={
                <div className="notes-rich-placeholder">
                  Start anywhere…
                  <span>
                    Write a running thought, or type <kbd>#</kbd>, <kbd>*</kbd>, or <kbd>1.</kbd>{" "}
                    followed by Space.
                  </span>
                </div>
              }
              spellCheck
              onBlur={onBlur}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <TabIndentationPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <ScratchpadInitialTextPlugin onPlainTextChange={onPlainTextChange} />
        <ScratchpadChangePlugin onChange={onChange} />
      </div>
    </LexicalComposer>
  );
};
