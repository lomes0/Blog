"use client";
import { FormHelperText } from "@mui/material";
import { useSelector } from "@/store";
import { capabilities } from "@/lib/capabilities";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import type { CreatePostForm } from "@/hooks/useCreatePostForm";
import UsersAutocomplete from "../User/UsersAutocomplete";
import DocumentVisibilityFields from "./DocumentVisibilityFields";
import {
  EditDescriptionField,
  EditHandleField,
  EditTitleField,
} from "./EditFields";

/**
 * The fields a post-creation surface asks for, in order.
 *
 * Both surfaces — the /new page and the create-post drawer — ask for the same
 * things, so they ask with the same component; a drawer differing from a page
 * in field wording is a bug, not a feature.
 *
 * `disabled` is for a surface that blocks its form while submitting. The fields
 * that need the network say so themselves.
 */
const PostFormFields: React.FC<{
  form: CreatePostForm;
  disabled?: boolean;
}> = ({ form, disabled = false }) => {
  const initialized = useSelector((state) => state.ui.initialized);
  const isOnline = useOnlineStatus();
  const can = capabilities(form.user);
  const { input, updateInput } = form;
  const needsNetwork = disabled || !isOnline;

  return (
    <>
      <EditTitleField
        value={input.name ?? ""}
        onChange={(name) => updateInput({ name })}
      />
      <EditDescriptionField
        value={input.description ?? ""}
        onChange={(description) => updateInput({ description })}
      />
      <EditHandleField
        value={input.handle ?? ""}
        onChange={form.updateHandle}
        validating={form.validating}
        error={form.validationErrors.handle}
        disabled={needsNetwork}
      />

      {initialized && !form.user && (
        <FormHelperText sx={{ mb: 1 }}>
          You are not signed in — this document is saved in this browser only.
          Sign in to keep it in your account.
        </FormHelperText>
      )}

      {can.coauthors && (
        <UsersAutocomplete
          label="Coauthors"
          placeholder="Email"
          value={input.coauthors ?? []}
          onChange={form.updateCoauthors}
          sx={{ my: 2 }}
          disabled={needsNetwork}
        />
      )}
      {can.publish && (
        <DocumentVisibilityFields
          isPrivate={input.private}
          isPublished={input.published ?? true}
          isCollab={input.collab}
          disabled={needsNetwork}
          onChange={updateInput}
        />
      )}
    </>
  );
};

export default PostFormFields;
