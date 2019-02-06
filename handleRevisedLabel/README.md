# Handle Revised Label

The `handleRevisedLabel` cloud function is responsible for re-assinging the
engineers that have already reviewed a Pull Request.

## Deployment

1. First, download the `settings.json` file to your local repository. This file
   contains various tokens, as well as the list of team members who have opted
   into this feature.

2. Make your changes.

3. Deploy the changes.

   ```bash
   gcloud alpha functions deploy handleRevisedLabel --trigger-http --stage-bucket team-196819
   ```
