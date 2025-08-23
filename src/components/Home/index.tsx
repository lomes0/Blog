"use client";
import { Box, Container, Typography, Paper } from "@mui/material";
import { UserDocument, Series, User } from "@/types";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";

const Home: React.FC<{ 
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({
  staticDocuments,
  series = [],
  user,
}) => {
  return (
    <DragProvider>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Simple Header Section */}
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700, color: "primary.main" }}>
            Welcome
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: "auto" }}>
            A simple blog platform for creating and sharing content
          </Typography>
        </Box>

        {/* Simple Content Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 6, 
            textAlign: "center", 
            bgcolor: "grey.50",
            borderRadius: 2
          }}
        >
          <Typography variant="h5" color="text.secondary" gutterBottom>
            Simple Blog Platform
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Start creating and sharing your thoughts with the world.
          </Typography>
        </Paper>

        {/* Trash Bin for drag and drop */}
        <TrashBin />
      </Container>
    </DragProvider>
  );
};

export default Home;
