import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
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
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.isEmpty ? "" : nextEditor.getHTML());
    },
  });

  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      heading: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      blockquote: currentEditor?.isActive("blockquote") ?? false,
    }),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const currentValue = editor.isEmpty ? "" : editor.getHTML();
    if (currentValue !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const toggleProps = {
    type: "button" as const,
    variant: "default" as const,
    size: "sm" as const,
    disabled,
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-input/30 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      <div
        role="toolbar"
        aria-label="Description formatting"
        className="flex flex-wrap items-center gap-1 p-2"
      >
        <Toggle
          {...toggleProps}
          pressed={formatting.bold}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold />
        </Toggle>
        <Toggle
          {...toggleProps}
          pressed={formatting.italic}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic />
        </Toggle>
        <Toggle
          {...toggleProps}
          pressed={formatting.strike}
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
        >
          <Strikethrough />
        </Toggle>
        <Toggle
          {...toggleProps}
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
          pressed={formatting.blockquote}
          onPressedChange={() =>
            editor.chain().focus().toggleBlockquote().run()
          }
          aria-label="Quote"
        >
          <Quote />
        </Toggle>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled}
          aria-label="Undo"
        >
          <Undo2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled}
          aria-label="Redo"
        >
          <Redo2 />
        </Button>
      </div>
      <Separator />
      <EditorContent editor={editor} />
    </div>
  );
}
