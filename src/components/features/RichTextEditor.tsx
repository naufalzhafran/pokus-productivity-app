import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Unlink,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

function normalizeWebUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmedValue) &&
    !/^https?:\/\//i.test(trimmedValue)
  ) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
  ariaDescribedBy,
  ariaInvalid = false,
}: RichTextEditorProps) {
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [toolbarIndex, setToolbarIndex] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer nofollow",
          },
        },
      }),
      Placeholder.configure({
        placeholder: "Add project context, goals, notes, or links…",
      }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        id,
        class:
          "rich-text-content min-h-40 max-h-[45dvh] overflow-y-auto px-3 py-3 text-sm outline-none",
        "aria-label": "Project description",
        role: "textbox",
        "aria-multiline": "true",
        "aria-describedby": ariaDescribedBy ?? "",
        "aria-invalid": ariaInvalid ? "true" : "false",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (nextEditor.isDestroyed || !nextEditor.schema) return;
      onChange(nextEditor.isEmpty ? "" : nextEditor.getHTML());
    },
  });

  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (
        !currentEditor ||
        currentEditor.isDestroyed ||
        !currentEditor.schema
      ) {
        return {
          bold: false,
          italic: false,
          strike: false,
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          link: false,
          canUndo: false,
          canRedo: false,
        };
      }

      return {
        bold: currentEditor.isActive("bold"),
        italic: currentEditor.isActive("italic"),
        strike: currentEditor.isActive("strike"),
        heading: currentEditor.isActive("heading", { level: 2 }),
        bulletList: currentEditor.isActive("bulletList"),
        orderedList: currentEditor.isActive("orderedList"),
        blockquote: currentEditor.isActive("blockquote"),
        link: currentEditor.isActive("link"),
        canUndo: currentEditor.can().undo(),
        canRedo: currentEditor.can().redo(),
      };
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;

    const syncContent = () => {
      if (editor.isDestroyed || !editor.schema) return;
      const currentValue = editor.isEmpty ? "" : editor.getHTML();
      if (currentValue !== value) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    };

    syncContent();
    editor.on("create", syncContent);

    return () => {
      editor.off("create", syncContent);
    };
  }, [editor, value]);

  if (!editor || !editor.schema) return null;

  const openLinkEditor = () => {
    const href = editor.getAttributes("link").href;
    setLinkUrl(typeof href === "string" ? href : "");
    setLinkError(null);
    setLinkEditorOpen(true);
  };

  const handleLinkSubmit = (event: FormEvent) => {
    event.preventDefault();
    const href = normalizeWebUrl(linkUrl);
    if (!href) {
      setLinkError("Enter a valid http or https URL.");
      return;
    }

    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: href,
          marks: [
            {
              type: "link",
              attrs: {
                href,
                target: "_blank",
                rel: "noopener noreferrer nofollow",
              },
            },
          ],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    setLinkEditorOpen(false);
    setLinkError(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkEditorOpen(false);
    setLinkError(null);
  };

  const closeLinkEditor = (focusEditor: boolean) => {
    setLinkEditorOpen(false);
    setLinkError(null);
    requestAnimationFrame(() => {
      if (focusEditor) editor.commands.focus();
      else linkButtonRef.current?.focus();
    });
  };

  const handleToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-toolbar-item="true"]:not(:disabled)',
      ) ?? [],
    );
    if (!buttons.length) return;

    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % buttons.length
            : (currentIndex - 1 + buttons.length) % buttons.length;
    const nextButton = buttons[nextIndex];
    setToolbarIndex(Number(nextButton.dataset.toolbarIndex));
    nextButton.focus();
  };

  const toolbarItemProps = (index: number) => ({
    "data-toolbar-item": "true",
    "data-toolbar-index": index,
    tabIndex: toolbarIndex === index ? 0 : -1,
    onFocus: () => setToolbarIndex(index),
  });

  const toggleProps = {
    type: "button" as const,
    variant: "default" as const,
    size: "sm" as const,
    disabled,
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Description formatting"
        className="flex flex-wrap items-center gap-1 p-2"
        onKeyDown={handleToolbarKeyDown}
      >
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(0)}
          pressed={formatting.bold}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(1)}
          pressed={formatting.italic}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(2)}
          pressed={formatting.strike}
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
        >
          <Strikethrough />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(3)}
          pressed={formatting.heading}
          onPressedChange={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          aria-label="Heading"
        >
          <Heading2 />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(4)}
          pressed={formatting.bulletList}
          onPressedChange={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          aria-label="Bulleted list"
        >
          <List />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(5)}
          pressed={formatting.orderedList}
          onPressedChange={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          aria-label="Numbered list"
        >
          <ListOrdered />
        </Toggle>
        <Toggle
          {...toggleProps}
          {...toolbarItemProps(6)}
          pressed={formatting.blockquote}
          onPressedChange={() =>
            editor.chain().focus().toggleBlockquote().run()
          }
          aria-label="Quote"
        >
          <Quote />
        </Toggle>
        <Toggle
          ref={linkButtonRef}
          {...toggleProps}
          {...toolbarItemProps(7)}
          pressed={formatting.link}
          onPressedChange={openLinkEditor}
          aria-label="Add or edit link"
          aria-expanded={linkEditorOpen}
          aria-controls={`${id}-link-controls`}
        >
          <Link2 />
        </Toggle>
        <Button
          {...toolbarItemProps(8)}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !formatting.canUndo}
          aria-label="Undo"
        >
          <Undo2 />
        </Button>
        <Button
          {...toolbarItemProps(9)}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !formatting.canRedo}
          aria-label="Redo"
        >
          <Redo2 />
        </Button>
      </div>
        {linkEditorOpen ? (
          <>
            <Separator className="my-1 w-full" />
            <form
              id={`${id}-link-controls`}
              className="w-full"
              onSubmit={handleLinkSubmit}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                closeLinkEditor(false);
              }}
            >
              <FieldGroup className="gap-2">
                <Field data-invalid={Boolean(linkError)}>
                  <FieldLabel className="sr-only" htmlFor={`${id}-link-url`}>
                    Link URL
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id={`${id}-link-url`}
                      type="text"
                      inputMode="url"
                      value={linkUrl}
                      onChange={(event) => {
                        setLinkUrl(event.target.value);
                        setLinkError(null);
                      }}
                      placeholder="https://example.com"
                      className="min-w-48 flex-1"
                      autoFocus
                      disabled={disabled}
                      aria-invalid={Boolean(linkError)}
                      aria-describedby={
                        linkError ? `${id}-link-error` : undefined
                      }
                    />
                    <Button type="submit" size="sm" disabled={disabled}>
                      <Link2 data-icon="inline-start" />
                      Apply
                    </Button>
                    {formatting.link ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={removeLink}
                        disabled={disabled}
                      >
                        <Unlink data-icon="inline-start" />
                        Remove
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        closeLinkEditor(false);
                      }}
                      aria-label="Cancel link"
                    >
                      <X />
                    </Button>
                  </div>
                  <FieldError id={`${id}-link-error`}>
                    {linkError}
                  </FieldError>
                </Field>
              </FieldGroup>
            </form>
          </>
        ) : null}
      <Separator />
      <EditorContent editor={editor} />
    </div>
  );
}
