"use client";
import {
  AArrowDown,
  AArrowUp,
  AlignLeft,
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link,
  PaintBucket,
  Plus,
  Redo,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
} from "lucide-react";
import {
  AppBar,
  Box,
  Button,
  Container,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  SvgIcon,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
  useScrollTrigger,
} from "@mui/material";
import { PropsWithChildren, useEffect } from "react";
import { ICON_SIZE } from "@/theme/icons";

const Highlight = () => (
  <SvgIcon viewBox="0 -960 960 960" fontSize="small">
    <path
      xmlns="http://www.w3.org/2000/svg"
      d="M80 0v-160h800V0H80Zm504-480L480-584 320-424l103 104 161-160Zm-47-160 103 103 160-159-104-104-159 160Zm-84-29 216 216-189 190q-24 24-56.5 24T367-263l-27 23H136l126-125q-24-24-25-57.5t23-57.5l189-189Zm0 0 187-187q24-24 56.5-24t56.5 24l104 103q24 24 24 56.5T857-636L669-453 453-669Z"
      fontSize="small"
    />
  </SvgIcon>
);

export const EditorSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  const toolbarTrigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 32,
  });
  useEffect(() => {
    const lightThemeMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    );
    const darkThemeMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    );
    if (lightThemeMeta && darkThemeMeta) {
      lightThemeMeta.setAttribute(
        "content",
        toolbarTrigger ? "#ffffff" : "#4f46e5",
      );
      darkThemeMeta.setAttribute(
        "content",
        toolbarTrigger ? "#121212" : "#272727",
      );
    }
  }, [toolbarTrigger]);

  return (
    <>
      <AppBar
        elevation={toolbarTrigger ? 4 : 0}
        position={toolbarTrigger ? "fixed" : "static"}
        sx={{
          background: "var(--mui-palette-background-default) !important",
          transition: "none",
        }}
      >
        <Toolbar
          className="editor-toolbar"
          sx={{
            position: "relative",
            displayPrint: "none",
            alignItems: "center",
            px: "0 !important",
            py: 1,
          }}
        >
          <Container
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              px: toolbarTrigger ? "" : "0 !important",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignSelf: "start",
                my: { xs: 0, sm: 0.5 },
              }}
            >
              <IconButton aria-label="Undo" disabled>
                <Undo size={ICON_SIZE.dense} />
              </IconButton>
              <IconButton aria-label="Redo" disabled>
                <Redo size={ICON_SIZE.dense} />
              </IconButton>
            </Box>
            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                mx: "auto",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Select
                value="paragraph"
                aria-label="Formatting options for text style"
                size="small"
                sx={{
                  fieldset: { borderColor: "divider" },
                  "& .MuiSelect-select": {
                    display: "flex !important",
                    alignItems: "center",
                    pl: 1,
                    pr: "28px !important",
                    py: 1,
                    minHeight: "0 !important",
                    height: "20px !important",
                  },
                  "& .MuiSelect-icon": { m: 0, fontSize: 20 },
                  "& .MuiListItemIcon-root": {
                    mr: { sm: 0.5 },
                    minWidth: 20,
                  },
                  "& .MuiListItemText-root": {
                    display: { xs: "none", sm: "flex" },
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "primary.main",
                  },
                }}
              >
                <MenuItem value="paragraph">
                  <ListItemIcon>
                    <AlignLeft size={ICON_SIZE.dense} />
                  </ListItemIcon>
                  <ListItemText>Normal</ListItemText>
                </MenuItem>
              </Select>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Select
                  size="small"
                  sx={{
                    fieldset: { borderColor: "divider" },
                    "& .MuiSelect-select": {
                      display: "flex !important",
                      alignItems: "center",
                      pl: 1,
                      pr: "28px !important",
                      py: 1,
                      minHeight: "0 !important",
                      height: "20px !important",
                    },
                    "& .MuiSelect-icon": {
                      m: 0,
                      fontSize: 20,
                    },
                    "& .MuiListItemIcon-root": {
                      mr: { sm: 0.5 },
                      minWidth: 20,
                    },
                    "& .MuiListItemText-root": {
                      display: { xs: "none", sm: "flex" },
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "primary.main",
                    },
                  }}
                  value="Roboto"
                >
                  <MenuItem key={"Roboto"} value={"Roboto"}>
                    <ListItemIcon
                      sx={{
                        fontFamily: "Roboto",
                        fontWeight: 500,
                      }}
                      color="action"
                    >
                      Aa
                    </ListItemIcon>
                    <ListItemText
                      sx={{
                        "& *": { fontFamily: "Roboto" },
                      }}
                    >
                      Roboto
                    </ListItemText>
                  </MenuItem>
                </Select>
                <Box
                  sx={{
                    display: { xs: "none", md: "flex" },
                    alignItems: "center",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconButton
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                      borderRight: "none",
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "divider",
                      "&:hover": {
                        borderColor: "primary.main",
                      },
                    }}
                    aria-label="increase font size"
                  >
                    <AArrowDown size={ICON_SIZE.dense} />
                  </IconButton>
                  <TextField
                    hiddenLabel
                    variant="outlined"
                    size="small"
                    autoComplete="off"
                    spellCheck="false"
                    sx={{
                      width: 40,
                      fieldset: {
                        borderColor: "divider",
                      },
                      "& .MuiInputBase-root": {
                        borderRadius: 0,
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "primary.main",
                        },
                      },
                      "& .MuiInputBase-input": {
                        px: 0.5,
                        py: "6.5px",
                        textAlign: "center",
                        MozAppearance: "textfield",
                        "&::-webkit-inner-spin-button, &::-webkit-outer-spin-button":
                          {
                            appearance: "none",
                            margin: 0,
                          },
                      },
                    }}
                    type="number"
                    value={16}
                  />
                  <IconButton
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: "divider",
                      "&:hover": {
                        borderColor: "primary.main",
                      },
                    }}
                    aria-label="decrease font size"
                  >
                    <AArrowUp size={ICON_SIZE.dense} />
                  </IconButton>
                </Box>
              </Box>

              <Button
                id="ai-tools-button"
                aria-haspopup="true"
                variant="outlined"
                startIcon={
                  <Sparkles
                    size={ICON_SIZE.dense}
                    style={{ color: "var(--mui-palette-action-active)" }}
                  />
                }
                endIcon={
                  <ChevronDown
                    size={ICON_SIZE.dense}
                    style={{ color: "var(--mui-palette-action-active)" }}
                  />
                }
                sx={{
                  color: "text.primary",
                  borderColor: "divider",
                  p: 1,
                  minWidth: 0,
                  height: 36,
                  "& .MuiButton-startIcon": {
                    mr: { xs: 0, sm: 1 },
                    ml: 0,
                  },
                  "& .MuiButton-endIcon": { mr: 0, ml: 0 },
                  "& .MuiButton-endIcon > svg": {
                    fontSize: 20,
                  },
                }}
              >
                <Typography
                  variant="button"
                  sx={{
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  AI
                </Typography>
              </Button>
              <ToggleButtonGroup
                size="small"
                sx={{ display: { xs: "none", lg: "flex" } }}
              >
                <ToggleButton value="bold">
                  <Bold size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="italic">
                  <Italic size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="underline">
                  <Underline size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="highlight">
                  <Highlight />
                </ToggleButton>
                <ToggleButton value="code">
                  <Code size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="strikethrough">
                  <Strikethrough size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="subscript">
                  <Subscript size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="superscript">
                  <Superscript size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="link">
                  <Link size={ICON_SIZE.dense} />
                </ToggleButton>
                <ToggleButton value="color">
                  <PaintBucket size={ICON_SIZE.dense} />
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignSelf: "start",
                my: { xs: 0, sm: 0.5 },
              }}
            >
              <IconButton aria-label="Insert">
                <Plus size={ICON_SIZE.dense} />
              </IconButton>
              <IconButton aria-label="Align Text">
                <AlignLeft size={ICON_SIZE.dense} />
              </IconButton>
            </Box>
          </Container>
        </Toolbar>
      </AppBar>
      {toolbarTrigger && (
        <Box
          sx={(theme) => ({
            ...theme.mixins.toolbar,
            displayPrint: "none",
          })}
          fontSize="small"
        />
      )}
      <div className="document-container">{children}</div>
    </>
  );
};
