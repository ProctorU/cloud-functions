# Handle Needs Label

The `handleNeedsLabel` cloud function is responsible for assigning the owner of the Pull Request in GitHub.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently
hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleNeedsLabel?project=team-196819&tab=source&duration=PT1H)
within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
