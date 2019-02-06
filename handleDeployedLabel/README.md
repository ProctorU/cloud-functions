# Handle Deployed Label

The `handleDeployedLabel` cloud function is responsible for sending a Slack message
to the Project Management team and assigned them to the GitHub Pull Request after
it's been tagged with a Deploy label.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleDeployedLabel?project=team-196819&tab=source&duration=PT1H) within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
