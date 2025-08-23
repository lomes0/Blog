"use client";
import { Button } from "@mui/material";
import { Add } from "@mui/icons-material";
import Link from "next/link";

export default function NewSeriesButton() {
  return (
    <Button
      component={Link}
      href="/series/new"
      variant="contained"
      startIcon={<Add />}
      sx={{
        borderRadius: 2,
        textTransform: 'none',
        fontSize: '1rem',
        px: 3,
        py: 1.5,
      }}
    >
      New Series
    </Button>
  );
}
