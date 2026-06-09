import { FileSearch } from "lucide-react";
import { Box, Typography } from "@mui/material";
import UserCard from "./UserCard";
import { ICON_SIZE } from "@/theme/icons";

const UserNotFound: React.FC = () => {
  return (
    <>
      <UserCard />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          my: 5,
          gap: 2,
        }}
      >
        <FileSearch size={ICON_SIZE.display} />
        <Typography variant="overline" component="p">
          User not found
        </Typography>
      </Box>
    </>
  );
};

export default UserNotFound;
