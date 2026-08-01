"use client";
import { User } from "@/types";
import RouterLink from "next/link";
import { memo, useState } from "react";
import UserActionMenu from "./UserActionMenu";
import UserSessionActions from "./UserSessionActions";
import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  IconButton,
  Skeleton,
  Snackbar,
  Typography,
} from "@mui/material";
import { Share2 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

/**
 * Store-free on purpose: this renders on `/user/[id]`, which is in the
 * `(public)` group and boots no Redux store (plan §8.1). The two reads it used
 * to have are gone — `initialized` moved into {@link UserSessionActions}, which
 * only mounts under `showActions`, and the copy-link announcement is a local
 * snackbar rather than the global announcement queue.
 */
const UserCard: React.FC<{ user?: User; showActions?: boolean }> = memo(
  ({ user, showActions }) => {
    const [notice, setNotice] = useState<string | null>(null);

    const handleShare = async () => {
      const shareData = {
        title: `${user?.name}'s profile on Editor`,
        url: window.location.origin + "/user/" +
          (user?.handle || user?.id),
      };
      try {
        await navigator.share(shareData);
      } catch {
        try {
          await navigator.clipboard.writeText(shareData.url);
          setNotice("Link copied to clipboard");
        } catch {
          setNotice("Failed to copy link to clipboard");
        }
      }
    };

    const href = user ? `/user/${user.handle || user.id}` : "/browse";

    return (
      <Card
        variant="outlined"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            width: 0,
            flex: 1,
          }}
        >
          <CardActionArea
            component={RouterLink}
            prefetch={false}
            href={href}
            sx={{ flex: "1 0 auto" }}
          >
            <CardContent>
              <Typography
                component="span"
                variant="h6"
                sx={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user ? user.name : <Skeleton variant="text" width={190} />}
              </Typography>
              <Typography
                component="span"
                variant="subtitle1"
                color="text.secondary"
                sx={{
                  display: "block",
                  lineHeight: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user ? user.email : <Skeleton variant="text" width={150} />}
              </Typography>
            </CardContent>
          </CardActionArea>
          <CardActions sx={{ height: 50 }}>
            {showActions && <UserSessionActions user={user} />}
            <Box sx={{ ml: "auto !important" }}>
              {showActions && user && <UserActionMenu user={user} />}
              {user && (
                <IconButton
                  size="small"
                  aria-label="Share"
                  onClick={handleShare}
                >
                  <Share2 size={ICON_SIZE.dense} />
                </IconButton>
              )}
            </Box>
          </CardActions>
        </Box>
        <CardActionArea
          component={RouterLink}
          prefetch={false}
          href={href}
          sx={{ display: "flex", width: "auto" }}
        >
          {user
            ? (
              <Avatar
                sx={{
                  width: 96,
                  height: 96,
                  m: 3,
                  alignSelf: "center",
                  flexShrink: 0,
                }}
                src={user.image ?? undefined}
                alt={user.name}
              />
            )
            : (
              <Skeleton
                variant="circular"
                width={96}
                height={96}
                sx={{
                  m: 3,
                  alignSelf: "center",
                  flexShrink: 0,
                }}
              />
            )}
        </CardActionArea>
        <Snackbar
          open={notice !== null}
          autoHideDuration={4000}
          onClose={() => setNotice(null)}
          message={notice}
        />
      </Card>
    );
  },
);

UserCard.displayName = "UserCard";

export default UserCard;
