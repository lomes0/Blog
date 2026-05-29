"use client";
import { RefreshCcw } from "lucide-react";
import { Box, IconButton, Link, Typography } from "@mui/material";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import packageJson from "../../../package.json";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";

const FooterWithFloatingAction: React.FC = () => {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  const version = packageJson.version;
  const commitHash: string | undefined =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const href = `https://github.com/ibastawisi/matheditor${
    commitHash ? "/commit/" + commitHash.substring(0, 7) : "/"
  }`;

  if (!isDashboard) return null;

  return (
    <FloatingActionButton id="footer-info" priority={5}>
      <Box
        component="footer"
        sx={{
          display: "flex",
          displayPrint: "none",
          gap: 1,
          zIndex: 1000,
          backgroundColor: "background.paper",
          padding: "4px 8px",
          borderRadius: 1,
          boxShadow: 1,
        }}
      >
        <Typography
          variant="button"
          component={Link}
          href={href}
          target="_blank"
          sx={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          v{version} {commitHash?.substring(0, 7)}
        </Typography>
        <IconButton
          size="small"
          sx={{ width: 24, height: 24 }}
          aria-label="Check for updates"
        >
          <script
            dangerouslySetInnerHTML={{
              __html: `document.currentScript.parentElement.onclick  = () => {
              if (!navigator.onLine) return;
              navigator.serviceWorker.getRegistrations().then(registrations => {
                return Promise.all(registrations.map(registration => registration.unregister()))
              }).then(() => window.location.reload())
            }`,
            }}
          />
          <RefreshCcw />
        </IconButton>
        <Typography variant="button">
          <Link
            component={RouterLink}
            prefetch={false}
            href="/privacy"
            sx={{ textDecoration: "none" }}
          >
            Privacy Policy
          </Link>
        </Typography>
      </Box>
    </FloatingActionButton>
  );
};

export default FooterWithFloatingAction;
