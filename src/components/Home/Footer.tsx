import { Cached, FavoriteRounded } from "@mui/icons-material";
import { Box, IconButton, Link, Typography } from "@mui/material";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import packageJson from "../../../package.json";

const Footer: React.FC = () => {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const isHomePage = pathname === "/";

  const version = packageJson.version;
  const commitHash: string | undefined =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const href = `https://github.com/ibastawisi/matheditor${
    commitHash ? "/commit/" + commitHash.substring(0, 7) : "/"
  }`;

  // Show blog footer on homepage
  if (isHomePage) {
    return (
      <Box
        component="footer"
        sx={{
          mt: 8,
          py: 4,
          px: 2,
          bgcolor: "grey.100",
          borderTop: "1px solid",
          borderColor: "divider",
          textAlign: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Made with <FavoriteRounded sx={{ color: "red", fontSize: 16, mx: 0.5, verticalAlign: "middle" }} /> 
          for the community
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", gap: 3, flexWrap: "wrap" }}>
          <Link
            component={RouterLink}
            href="/browse"
            color="text.secondary"
            underline="hover"
            variant="body2"
          >
            Browse Posts
          </Link>
          <Link
            component={RouterLink}
            href="/series"
            color="text.secondary"
            underline="hover"
            variant="body2"
          >
            Series
          </Link>
          <Link
            href={href}
            target="_blank"
            color="text.secondary"
            underline="hover"
            variant="body2"
          >
            Source Code
          </Link>
          <Link
            component={RouterLink}
            href="/privacy"
            color="text.secondary"
            underline="hover"
            variant="body2"
          >
            Privacy
          </Link>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
          v{version} {commitHash?.substring(0, 7)}
        </Typography>
      </Box>
    );
  }

  return isDashboard
    ? (
      <Box
        component="footer"
        sx={{
          display: "flex",
          displayPrint: "none",
          position: "fixed",
          bottom: 8,
          right: 16,
          gap: 1,
          zIndex: 1000,
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
          <Cached />
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
    )
    : null;
};

export default Footer;
