import { FileSearch } from "lucide-react";
import { Box, Typography } from "@mui/material";
import UserCard from "./UserCard";

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
        <FileSearch size={64} />
        <Typography variant="overline" component="p">
          User not found
        </Typography>
      </Box>
    </>
  );
};

export default UserNotFound;
