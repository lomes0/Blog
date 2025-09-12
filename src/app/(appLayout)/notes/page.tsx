import { redirect } from "next/navigation";

export default function NotesPage() {
  // Redirect to the edit page for the special "notes" document
  redirect("/edit/notes");
}
