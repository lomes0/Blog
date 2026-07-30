import { Box, Container, Link, Typography } from "@mui/material";

/**
 * The address readers are told to write to with privacy questions.
 *
 * Deliberately empty: this app is self-hosted, so only whoever runs a given
 * deployment can say who is accountable for the data on it. Fill this in before
 * making the site public. While it is blank the contact section falls back to
 * "the operator of this site" rather than naming anyone — the previous version
 * of this page shipped the upstream maintainer's personal email for years, which
 * is the failure mode this default exists to avoid.
 */
const CONTACT_EMAIL: string = "";

const LAST_UPDATED = "30 July 2026";

const Section: React.FC<{ title: string; children: React.ReactNode }> = (
  { title, children },
) => (
  <Box component="section" sx={{ display: "flex", flexDirection: "column" }}>
    <Typography variant="h6" component="h2" gutterBottom>
      {title}
    </Typography>
    {children}
  </Box>
);

export default function Privacy() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Privacy Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Last updated: {LAST_UPDATED}
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Typography variant="body1">
          This is a blog platform: you write posts in the editor and, if you
          choose, publish them. This page describes what the site stores, what
          leaves it, and what you can do about both. It covers this deployment
          only — the software is open source and anyone may run their own copy.
        </Typography>

        <Section title="Using the site without an account">
          <Typography variant="body1">
            You can write without signing in. Those drafts are held in your
            browser&rsquo;s IndexedDB storage and are never sent to the server,
            so nobody operating this site can read them. They are also not
            backed up: clearing your browser&rsquo;s site data deletes them
            permanently, and they do not follow you to another browser or
            device. Use the export option in the dashboard to keep a copy.
          </Typography>
        </Section>

        <Section title="What is stored when you sign in">
          <Typography variant="body1" gutterBottom>
            Signing in uses GitHub or Google. We do not see or store your
            password. From your chosen provider we receive and store:
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <Typography component="li" variant="body1">
              your name
            </Typography>
            <Typography component="li" variant="body1">
              your email address
            </Typography>
            <Typography component="li" variant="body1">
              a link to your profile picture
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ mt: 2 }}>
            We also store the access tokens the provider issues, so the session
            can be maintained, along with the date you created the account and
            the date you last signed in. If you set a handle, it becomes part of
            your public profile URL.
          </Typography>
        </Section>

        <Section title="Content you create">
          <Typography variant="body1">
            Posts, their revision history, series, projects, sticky notes and
            any files you upload are stored on this server so they are available
            when you sign in from anywhere. Revision history means earlier
            versions of a post are retained after you edit it. Uploaded files
            are served through an authorization check rather than from a public
            directory, so they follow the visibility of the post they belong to.
          </Typography>
        </Section>

        <Section title="Publishing">
          <Typography variant="body1">
            A post is private until you publish it. Once published, it is
            readable by anyone with the link, appears on your public profile
            page, and is listed in the site&rsquo;s sitemap, which invites
            search engines to index it. Your name, handle and profile picture
            are shown alongside it. Unpublishing removes it from the public
            pages, but search engines may keep a cached copy for a while.
          </Typography>
        </Section>

        <Section title="Cookies">
          <Typography variant="body1">
            One cookie, holding your sign-in session, and only after you sign
            in. There are no analytics, advertising, or tracking cookies on this
            site, and no third-party scripts that set any. Signing out clears
            the session.
          </Typography>
        </Section>

        <Section title="When your content leaves this server">
          <Typography variant="body1" gutterBottom>
            Three cases, all of them driven by something you do:
          </Typography>
          <Box
            component="ul"
            sx={{ pl: 3, m: 0, display: "flex", flexDirection: "column" }}
          >
            <Typography component="li" variant="body1" gutterBottom>
              <strong>Signing in.</strong> GitHub or Google learns that you
              signed in here, and applies its own privacy policy to that.
            </Typography>
            <Typography component="li" variant="body1" gutterBottom>
              <strong>AI features.</strong> When you use the AI assistant or an
              editor AI action, the text it works on — which may be the whole
              post — is sent to the configured model provider. Depending on how
              this deployment is set up, that is Anthropic, Google, Azure
              OpenAI, or a self-hosted Ollama instance, and their terms then
              apply to that text. Do not put anything in a post you are not
              willing to send to a model provider before using these features.
            </Typography>
            <Typography component="li" variant="body1">
              <strong>Embedded media.</strong> If you embed a video, the
              reader&rsquo;s browser loads it from that service (for example
              YouTube), which lets the service see the reader&rsquo;s IP
              address.
            </Typography>
          </Box>
        </Section>

        <Section title="What we do not do">
          <Typography variant="body1">
            We do not sell or trade your personal information, we do not serve
            advertising, and we do not run analytics or behavioural tracking of
            any kind.
          </Typography>
        </Section>

        <Section title="Keeping and deleting your data">
          <Typography variant="body1">
            Your content is kept until you delete it. Deleting a post removes
            its revision history with it. You can download everything you have
            written as a backup archive from the dashboard at any time, and you
            can ask for your account and all of its content to be deleted, which
            also removes your profile and sessions.
          </Typography>
        </Section>

        <Section title="Children">
          <Typography variant="body1">
            This site is not directed at children under 13 and we do not
            knowingly collect their personal information. If you believe a child
            has provided information here, get in touch and it will be removed.
          </Typography>
        </Section>

        <Section title="Changes to this policy">
          <Typography variant="body1">
            If this policy changes, the revised version will be posted here with
            a new date at the top. Continuing to use the site after a change
            means the revised policy applies.
          </Typography>
        </Section>

        <Section title="Contact">
          <Typography variant="body1">
            Questions about this policy, or a request to export or delete your
            data, can go to{" "}
            {CONTACT_EMAIL
              ? <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>
              : "the operator of this site"}.
          </Typography>
        </Section>
      </Box>
    </Container>
  );
}
