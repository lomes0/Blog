"use client";
import React from "react";
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
} from "@mui/material";
import { Copy } from "lucide-react";
import { Post, User } from "@/types";
import UsersAutocomplete from "../User/UsersAutocomplete";
import { DateDisplay } from "@/components/shared/DateDisplay";

interface SharedPanelProps {
  post: Post;
  revision: string | null;
  setRevision: (v: string) => void;
  isPrivate: boolean;
  isAuthor: boolean;
  togglePrivate: () => void;
}

interface RevisionSelectorProps {
  post: Post;
  revision: string | null;
  setRevision: (v: string) => void;
  disabled?: boolean;
}

const RevisionSelector: React.FC<RevisionSelectorProps> = ({
  post,
  revision,
  setRevision,
  disabled,
}) => (
  <FormControl fullWidth sx={{ gap: 1, mb: 2 }} disabled={disabled}>
    <FormLabel>Revision</FormLabel>
    <Select
      size="small"
      value={revision ?? ""}
      onChange={(e) => setRevision(e.target.value)}
    >
      {(post.revisions ?? []).map((r) => (
        <MenuItem key={r.id} value={r.id}>
          <DateDisplay date={r.createdAt} variant="full" />
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);

interface PermissionsControlProps {
  isPrivate: boolean;
  isAuthor: boolean;
  togglePrivate: () => void;
  helperText?: string;
}

const PermissionsControl: React.FC<PermissionsControlProps> = ({
  isPrivate,
  isAuthor,
  togglePrivate,
  helperText,
}) => (
  <FormControl fullWidth disabled={!isAuthor}>
    <FormLabel>Permissions</FormLabel>
    <FormControlLabel
      control={<Switch checked={!isPrivate} onChange={togglePrivate} />}
      label={!isPrivate ? "Anyone with the link" : "Only author and coauthors"}
    />
    {isPrivate && helperText && <FormHelperText>{helperText}</FormHelperText>}
  </FormControl>
);

export const ShareViewPanel: React.FC<SharedPanelProps> = ({
  post,
  revision,
  setRevision,
  isPrivate,
  isAuthor,
  togglePrivate,
}) => (
  <Box sx={{ p: 2 }}>
    <RevisionSelector
      post={post}
      revision={revision}
      setRevision={setRevision}
    />
    <PermissionsControl
      isPrivate={isPrivate}
      isAuthor={isAuthor}
      togglePrivate={togglePrivate}
    />
  </Box>
);

export const ShareEmbedPanel: React.FC<SharedPanelProps> = ({
  post,
  revision,
  setRevision,
  isPrivate,
  isAuthor,
  togglePrivate,
}) => (
  <Box sx={{ p: 2 }}>
    <RevisionSelector
      post={post}
      revision={revision}
      setRevision={setRevision}
      disabled={isPrivate}
    />
    <PermissionsControl
      isPrivate={isPrivate}
      isAuthor={isAuthor}
      togglePrivate={togglePrivate}
      helperText="Private documents can not be embedded"
    />
  </Box>
);

export const SharePdfPanel: React.FC<SharedPanelProps> = ({
  post,
  revision,
  setRevision,
  isPrivate,
  isAuthor,
  togglePrivate,
}) => (
  <Box sx={{ p: 2 }}>
    <RevisionSelector
      post={post}
      revision={revision}
      setRevision={setRevision}
      disabled={isPrivate}
    />
    <PermissionsControl
      isPrivate={isPrivate}
      isAuthor={isAuthor}
      togglePrivate={togglePrivate}
      helperText="Private documents can not be shared as PDF"
    />
    <FormControl fullWidth disabled={isPrivate}>
      <FormLabel>Scale</FormLabel>
      <Slider
        name="scale"
        aria-label="scale"
        defaultValue={1}
        valueLabelDisplay="auto"
        step={0.1}
        marks
        min={0.1}
        max={2}
      />
    </FormControl>
    <FormControl fullWidth disabled={isPrivate}>
      <FormLabel>Orientation</FormLabel>
      <RadioGroup
        row
        aria-label="orientation"
        name="landscape"
        defaultValue="false"
      >
        <FormControlLabel value="false" control={<Radio />} label="Portrait" />
        <FormControlLabel value="true" control={<Radio />} label="Landscape" />
      </RadioGroup>
    </FormControl>
    <FormControl fullWidth disabled={isPrivate}>
      <FormLabel>Size</FormLabel>
      <RadioGroup row aria-label="size" name="format" defaultValue="a4">
        <FormControlLabel value="letter" control={<Radio />} label="Letter" />
        <FormControlLabel value="a4" control={<Radio />} label="A4" />
      </RadioGroup>
    </FormControl>
  </Box>
);

export const ShareDocxPanel: React.FC<SharedPanelProps> = ({
  post,
  revision,
  setRevision,
  isPrivate,
  isAuthor,
  togglePrivate,
}) => (
  <Box sx={{ p: 2 }}>
    <RevisionSelector
      post={post}
      revision={revision}
      setRevision={setRevision}
      disabled={isPrivate}
    />
    <PermissionsControl
      isPrivate={isPrivate}
      isAuthor={isAuthor}
      togglePrivate={togglePrivate}
      helperText="Private documents can not be shared as DOCx"
    />
  </Box>
);

interface ShareEditPanelProps {
  post: Post;
  isAuthor: boolean;
  isCollab: boolean;
  toggleCollab: () => void;
  updateCoauthors: (users: (User | string)[]) => void;
}

export const ShareEditPanel: React.FC<ShareEditPanelProps> = ({
  post,
  isAuthor,
  isCollab,
  toggleCollab,
  updateCoauthors,
}) => (
  <Box sx={{ p: 2 }}>
    <FormControl fullWidth sx={{ gap: 1, mb: 2 }} disabled={!isAuthor}>
      <FormLabel sx={{ mb: 0.5 }}>Permissions</FormLabel>
      <UsersAutocomplete
        label="Coauthors"
        placeholder="Email"
        value={post.coauthors ?? []}
        onChange={updateCoauthors}
        disabled={!isAuthor}
      />
      <FormControlLabel
        control={<Switch checked={isCollab} onChange={toggleCollab} />}
        label={isCollab ? "Anyone with the link" : "Only author and coauthors"}
      />
    </FormControl>
  </Box>
);

interface ShareCopyLinkProps {
  isPrivate: boolean;
  format: string;
  copyLink: () => void;
}

export const ShareCopyLinkButton: React.FC<ShareCopyLinkProps> = ({
  isPrivate,
  format,
  copyLink,
}) => {
  const restrictedFormats = ["embed", "pdf", "docx"];
  const disabled = isPrivate && restrictedFormats.includes(format);
  return (
    <Box sx={{ p: 2 }}>
      <Button
        startIcon={<Copy />}
        variant="outlined"
        disabled={disabled}
        onClick={copyLink}
        fullWidth
      >
        Copy Link
      </Button>
    </Box>
  );
};
