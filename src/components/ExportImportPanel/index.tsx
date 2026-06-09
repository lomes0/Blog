"use client";
/**
 * ExportImportPanel
 *
 * A self-contained panel with two tabs:
 *   - Export: download a full backup .zip (cloud and/or local)
 *   - Import: upload a .zip bundle and receive an import summary
 *
 * Follow DESIGN.md conventions (MUI v6, no Tailwind/Radix/etc.).
 */

import React, { useState } from "react";
import { Box, Paper, Tab, Tabs, Typography } from "@mui/material";
import { Download, FileUp } from "lucide-react";
import { ExportTab } from "./ExportTab";
import { ImportTab } from "./ImportTab";
import { ICON_SIZE } from "@/theme/icons";

function TabPanel({
  children,
  value,
  index,
}: {
  children: React.ReactNode;
  value: number;
  index: number;
}) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`export-import-tabpanel-${index}`}
      aria-labelledby={`export-import-tab-${index}`}
      sx={{ pt: 3 }}
    >
      {value === index && children}
    </Box>
  );
}

export const ExportImportPanel: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom>
        Backup &amp; Restore
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Export all your documents (with full revision history and assets) to a
        {" "}
        <code>.zip</code> file, or restore from a previous backup.
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) =>
          setTab(v)}
        aria-label="Export / Import tabs"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab
          icon={<Download size={ICON_SIZE.dense} />}
          iconPosition="start"
          label="Export"
          id="export-import-tab-0"
          aria-controls="export-import-tabpanel-0"
        />
        <Tab
          icon={<FileUp size={ICON_SIZE.dense} />}
          iconPosition="start"
          label="Import"
          id="export-import-tab-1"
          aria-controls="export-import-tabpanel-1"
        />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <ExportTab />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <ImportTab />
      </TabPanel>
    </Paper>
  );
};

export default ExportImportPanel;
