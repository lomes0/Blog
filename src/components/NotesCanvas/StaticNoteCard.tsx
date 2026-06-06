"use client";
import { Box, Typography } from "@mui/material";
import { Note } from "@/types/notes";
import { NOTE_COLORS, NoteColorKey } from "./noteColors";
import { alpha } from "@mui/material";

interface StaticNoteCardProps {
  note: Note;
  index: number;
}

/** Extract plain text from Lexical editor state JSON */
function extractTextFromLexicalState(content: string): string {
  try {
    const state = JSON.parse(content);
    const texts: string[] = [];

    function extractText(node: { text?: string; children?: unknown[] }) {
      if (node.text) {
        texts.push(node.text);
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) =>
          extractText(child as { text?: string; children?: unknown[] })
        );
      }
    }

    if (state.root) {
      extractText(state.root);
    }

    return texts.join(" ").trim() || "Empty note";
  } catch {
    // If it's not valid JSON, return the content as-is (might be plain text)
    return content || "Empty note";
  }
}

export default function StaticNoteCard({ note, index }: StaticNoteCardProps) {
  return (
    <Box
      sx={(theme) => ({
        width: "100%",
        height: "100%",
        background: NOTE_COLORS[note.color as NoteColorKey] ||
          NOTE_COLORS.yellow,
        borderRadius: 1.5,
        boxShadow:
          "0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)",
        ...theme.applyStyles("dark", {
          boxShadow:
            "0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
        }),
        p: 1.5,
        overflow: "hidden",
        position: "relative",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        animation: `fadeInUp 0.4s ease-out ${index * 0.1}s both`,
        "@keyframes fadeInUp": {
          from: {
            opacity: 0,
            transform: "translateY(10px)",
          },
          to: {
            opacity: 1,
            transform: "translateY(0)",
          },
        },
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)",
          ...theme.applyStyles("dark", {
            boxShadow: "0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)",
          }),
        },
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          bgcolor: alpha(theme.palette.common.black, 0.08),
          borderTopLeftRadius: 1.5,
          borderTopRightRadius: 1.5,
        },
      })}
    >
      <Typography
        sx={{
          color: "rgba(0,0,0,0.85)",
          fontSize: "44px",
          lineHeight: 1.4,
          fontWeight: 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 5,
          WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {extractTextFromLexicalState(note.content).substring(0, 150)}
      </Typography>
    </Box>
  );
}
